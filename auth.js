/* Users, login, password recovery, permissions and licensing */
'use strict';

/* Public key of CA Sudanshu Mallick. Licence keys and admin-reset codes signed with the
   matching private key (ADMIN-PRIVATE-LICENSE-KEY.json, kept by the developer) are accepted. */
const DEV_PUBKEY = { kty: 'EC', crv: 'P-256', x: 'yR1vlfuCO0dIYBrNIIhOTYxtdWe8xiKJxRRVQRWJvyo', y: 'kBGrZ89kV-cpxoBQ4o3Nk_qXUaihJvchHo_LMrYu-Fs', ext: true };
const TRIAL_DAYS = 30;

const PERMS = [
  ['entry', 'Create & edit entries'], ['delete', 'Delete / cancel entries'], ['masters', 'Ledgers, items & groups'],
  ['reports', 'View reports'], ['tax', 'VAT, TDS & e-billing'], ['import', 'Bulk upload & bill scanning'],
  ['docs', 'Client documents'], ['entities', 'Create / edit / delete entities'], ['users', 'Manage users'], ['settings', 'Settings & backup'],
];
const ROLE_PRESETS = {
  admin: { label: 'Administrator (full access)', perms: PERMS.map(p => p[0]) },
  accountant: { label: 'Accountant', perms: ['entry', 'delete', 'masters', 'reports', 'tax', 'import', 'docs'] },
  dataentry: { label: 'Data entry', perms: ['entry', 'import', 'docs'] },
  viewer: { label: 'View reports only', perms: ['reports'] },
  client: { label: 'Client (reports + documents)', perms: ['reports', 'docs'] },
};

function can(p) { if (!S.user) return false; if (S.user.role === 'admin') return true; return (S.user.perms || []).includes(p); }
function canWrite() { return licenseState().active; }
function guardWrite() { if (!canWrite()) { toast('Licence expired – entries are read-only. Enter a licence key in Settings.', 1); return false; } return true; }
function canEntity(id) { if (!S.user) return false; if (S.user.role === 'admin' || S.user.entities === 'all') return true; return (S.user.entities || []).includes(id); }

async function saveUsers() { await DB.put('kv', 'users', S.users); }
async function loadUsers() { S.users = (await DB.get('kv', 'users')) || []; }

/* ---------- First run ---------- */
function viewSetup() {
  return `<div class="auth"><div class="card">
  <div class="center"><img src="icons/logo.svg" alt="LekhaPal" class="logo-big" style="margin:auto;display:block"><h2 style="margin-bottom:2px">Welcome to LekhaPal</h2><div class="muted small">लेखापाल · Your trusted accountant</div></div>
  <div class="dev">Accounting, inventory, VAT &amp; financial statements for Nepal.<br>Developed by <b>CA Sudanshu Mallick</b></div>
  <p class="small muted">Create the administrator account for this device. The administrator can add other users and control what they can see.</p>
  <label>Your full name</label><input id="su_name" placeholder="e.g. Sudanshu Mallick">
  <label>Email (used as login ID)</label><input id="su_email" type="email" placeholder="you@example.com">
  <label>Password (min 6 characters)</label><input id="su_p1" type="password">
  <label>Confirm password</label><input id="su_p2" type="password">
  <div class="btns"><button class="btn pri" onclick="doSetup()">Create administrator</button>
  <button class="btn" onclick="restoreBackupFlow()">Restore from backup file</button></div>
  </div></div>`;
}
async function doSetup() {
  const name = $('#su_name').value.trim(), email = $('#su_email').value.trim().toLowerCase(), p1 = $('#su_p1').value, p2 = $('#su_p2').value;
  if (!name || !email) return toast('Enter name and email', 1);
  if (p1.length < 6) return toast('Password must be at least 6 characters', 1);
  if (p1 !== p2) return toast('Passwords do not match', 1);
  const u = await makeUser({ name, email, role: 'admin', entities: 'all', perms: ROLE_PRESETS.admin.perms }, p1);
  S.users = [u.user]; await saveUsers();
  if (!(await DB.get('kv', 'installDate'))) await DB.put('kv', 'installDate', todayAD());
  showRecovery(u.code, () => { S.user = u.user; sessionStorageSet(u.user.id); App.boot(); });
}
async function makeUser(fields, pass) {
  const ph = await hashPass(pass); const code = randomCode(16); const rh = await hashPass(code.replace(/-/g, ''));
  const user = Object.assign({ id: uid('u'), created: todayAD(), active: true }, fields, { pass: ph.hash, salt: ph.salt, rec: rh.hash, recSalt: rh.salt });
  return { user, code };
}
function showRecovery(code, then) {
  window._afterRec = then;
  modal('Save your recovery code', `<p>If you forget your password, this code lets you set a new one. Write it down or take a photo and keep it safe. It is shown <b>only once</b>.</p>
  <div class="card center" style="font-size:1.4rem;font-weight:700;letter-spacing:2px">${code}</div>
  <div class="btns"><button class="btn" onclick="download('LekhaPal-recovery-code.txt','LekhaPal recovery code: ${code}')">Download as file</button>
  <button class="btn pri" onclick="closeModal(); window._afterRec && window._afterRec()">I have saved it</button></div>`, { sticky: true });
}

/* ---------- Login ---------- */
function sessionStorageSet(id) { try { sessionStorage.setItem('sml_user', id); } catch (e) { } }
function viewLogin() {
  return `<div class="auth"><div class="card">
  <div class="center"><img src="icons/logo.svg" alt="LekhaPal" class="logo-big" style="margin:auto;display:block"><h2 style="margin-bottom:2px">LekhaPal</h2><div class="muted small">लेखापाल · Your trusted accountant</div></div>
  <div class="dev center">Developed by <b>CA Sudanshu Mallick</b></div>
  <label>Email / login ID</label><input id="li_email" autocomplete="username" onkeydown="if(event.key==='Enter')$('#li_pass').focus()">
  <label>Password</label><input id="li_pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
  <div class="btns"><button class="btn pri" onclick="doLogin()">Log in</button><button class="btn" onclick="forgotFlow()">Forgot password?</button></div>
  <p class="small muted">Works offline. Your data stays on this device unless you export a backup.</p>
  </div><p class="center small muted">v${APP.version} · <a href="#" onclick="restoreBackupFlow();return false">Restore backup</a></p></div>`;
}
async function doLogin() {
  const email = $('#li_email').value.trim().toLowerCase(), pass = $('#li_pass').value;
  const u = S.users.find(x => x.email === email);
  if (!u || !u.active) return toast('Unknown user or user disabled', 1);
  const ph = await hashPass(pass, u.salt);
  if (ph.hash !== u.pass) { u.fails = (u.fails || 0) + 1; await saveUsers(); return toast('Wrong password', 1); }
  u.fails = 0; u.lastLogin = new Date().toISOString(); await saveUsers();
  S.user = u; sessionStorageSet(u.id); App.boot();
}
function logout() { S.user = null; S.E = null; try { sessionStorage.removeItem('sml_user'); } catch (e) { } App.boot(); }

/* ---------- Password recovery ---------- */
async function forgotFlow() {
  const iid = await installId();
  modal('Reset password', `
  <div class="seg"><button class="on" onclick="recTab(this,'r1')">I have my recovery code</button><button onclick="recTab(this,'r2')">I don't have it</button></div>
  <div id="r1"><label>Email / login ID</label><input id="rc_email"><label>Recovery code</label><input id="rc_code" placeholder="XXXX-XXXX-XXXX-XXXX">
  <label>New password</label><input id="rc_p" type="password"><div class="btns"><button class="btn pri" onclick="doRecover('code')">Reset password</button></div></div>
  <div id="r2" style="display:none">
   <p><b>Staff users:</b> ask your administrator to reset your password from <i>Users</i>.</p>
   <p><b>Administrator:</b> contact <b>CA Sudanshu Mallick</b> (${APP.devEmail}) with this Install ID. You will receive a one-time reset code.</p>
   <div class="card center"><b>Install ID: ${iid}</b></div>
   <label>Email / login ID</label><input id="rd_email"><label>Developer reset code</label><textarea id="rd_code" rows="3"></textarea>
   <label>New password</label><input id="rd_p" type="password"><div class="btns"><button class="btn pri" onclick="doRecover('dev')">Reset password</button></div>
  </div>`);
}
function recTab(b, id) { $$('.seg button', b.parentNode.parentNode).forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#r1').style.display = id === 'r1' ? '' : 'none'; $('#r2').style.display = id === 'r2' ? '' : 'none'; }
async function doRecover(mode) {
  const email = (mode === 'code' ? $('#rc_email') : $('#rd_email')).value.trim().toLowerCase();
  const np = (mode === 'code' ? $('#rc_p') : $('#rd_p')).value;
  const u = S.users.find(x => x.email === email); if (!u) return toast('Unknown user', 1);
  if (np.length < 6) return toast('Password must be at least 6 characters', 1);
  if (mode === 'code') {
    const code = $('#rc_code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rh = await hashPass(code, u.recSalt); if (rh.hash !== u.rec) return toast('Recovery code does not match', 1);
  } else {
    const p = await verifySigned($('#rd_code').value.trim()); const iid = await installId();
    if (!p || p.t !== 'reset' || p.iid !== iid || (p.x && p.x < todayAD())) return toast('Reset code is not valid for this install', 1);
  }
  const ph = await hashPass(np); u.pass = ph.hash; u.salt = ph.salt; u.active = true; await saveUsers();
  closeModal(); toast('Password changed. Please log in.');
}

/* ---------- Users screen ---------- */
function viewUsers() {
  if (!can('users')) return noAccess();
  const rows = S.users.map(u => ({ ...u, ents: u.entities === 'all' ? 'All' : (u.entities || []).map(id => (S.entities.find(e => e.id === id) || {}).name).filter(Boolean).join(', '), _click: `editUser('${u.id}')`, _cls: 'click' }));
  return `<h2>Users & access</h2><p class="muted">Give each person their own login. Choose exactly which entities and which parts of the software they can use.</p>
  <div class="btns"><button class="btn pri" onclick="editUser()">+ Add user</button></div>
  ${table([{ k: 'name', t: 'Name' }, { k: 'email', t: 'Login' }, { k: 'role', t: 'Role', f: v => h((ROLE_PRESETS[v] || {}).label || 'Custom') }, { k: 'ents', t: 'Entities' }, { k: 'active', t: 'Status', f: v => v ? '<span class="pill g">Active</span>' : '<span class="pill r">Disabled</span>' }, { k: 'lastLogin', t: 'Last login', f: v => v ? h(v.slice(0, 16).replace('T', ' ')) : '' }], rows)}`;
}
function editUser(id) {
  const u = S.users.find(x => x.id === id) || { role: 'accountant', perms: ROLE_PRESETS.accountant.perms, entities: [], active: true };
  const ents = S.entities.map(e => `<label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" class="ue" value="${e.id}" ${u.entities === 'all' || (u.entities || []).includes(e.id) ? 'checked' : ''}> ${h(e.name)}</label>`).join('');
  modal(id ? 'Edit user' : 'Add user', `
  <div class="row"><div><label>Full name</label><input id="uu_name" value="${h(u.name)}"></div><div><label>Email / login ID</label><input id="uu_email" value="${h(u.email)}"></div></div>
  <div class="row"><div><label>Role</label><select id="uu_role" onchange="rolePreset(this.value)">${Object.entries(ROLE_PRESETS).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v.label}</option>`).join('')}<option value="custom" ${!ROLE_PRESETS[u.role] ? 'selected' : ''}>Custom</option></select></div>
  <div><label>${id ? 'New password (leave blank to keep)' : 'Password'}</label><input id="uu_pass" type="password"></div></div>
  <label>What can this user do?</label><div class="grid2">${PERMS.map(([k, t]) => `<label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" class="up" value="${k}" ${(u.perms || []).includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
  <label>Which entities?</label><label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="uu_all" ${u.entities === 'all' ? 'checked' : ''}> All entities (including future ones)</label><div class="grid2">${ents || '<span class="muted">No entities yet</span>'}</div>
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="uu_active" ${u.active ? 'checked' : ''}> Active (can log in)</label>
  <div class="btns"><button class="btn pri" onclick="saveUser('${id || ''}')">Save</button>${id && id !== S.user.id ? `<button class="btn red" onclick="deleteUser('${id}')">Delete user</button>` : ''}</div>`);
}
function rolePreset(r) { if (!ROLE_PRESETS[r]) return; $$('.up').forEach(c => c.checked = ROLE_PRESETS[r].perms.includes(c.value)); }
async function saveUser(id) {
  const name = $('#uu_name').value.trim(), email = $('#uu_email').value.trim().toLowerCase(), pass = $('#uu_pass').value;
  if (!name || !email) return toast('Name and login are required', 1);
  if (S.users.some(x => x.email === email && x.id !== id)) return toast('That login is already used', 1);
  const fields = { name, email, role: $('#uu_role').value, perms: $$('.up').filter(c => c.checked).map(c => c.value), entities: $('#uu_all').checked ? 'all' : $$('.ue').filter(c => c.checked).map(c => c.value), active: $('#uu_active').checked };
  if (id) {
    const u = S.users.find(x => x.id === id);
    if (u.role === 'admin' && fields.role !== 'admin' && S.users.filter(x => x.role === 'admin').length === 1) return toast('Keep at least one administrator', 1);
    Object.assign(u, fields);
    if (pass) { if (pass.length < 6) return toast('Password min 6 characters', 1); const ph = await hashPass(pass); u.pass = ph.hash; u.salt = ph.salt; }
    await saveUsers(); closeModal(); toast('User saved'); App.go('users');
  } else {
    const lic = licenseState(); if (lic.maxUsers && S.users.length >= lic.maxUsers) return toast(`Your licence allows ${lic.maxUsers} users`, 1);
    if (pass.length < 6) return toast('Password min 6 characters', 1);
    const r = await makeUser(fields, pass); S.users.push(r.user); await saveUsers();
    showRecovery(r.code, () => App.go('users'));
  }
}
async function deleteUser(id) { if (!confirmBox('Delete this user?')) return; S.users = S.users.filter(u => u.id !== id); await saveUsers(); closeModal(); App.go('users'); }
async function changeMyPassword() {
  modal('Change my password', `<label>Current password</label><input id="cp0" type="password"><label>New password</label><input id="cp1" type="password"><div class="btns"><button class="btn pri" onclick="doChangePass()">Change</button><button class="btn" onclick="newRecoveryCode()">Get a new recovery code</button></div>`);
}
async function doChangePass() {
  const u = S.users.find(x => x.id === S.user.id); const ph = await hashPass($('#cp0').value, u.salt); if (ph.hash !== u.pass) return toast('Current password is wrong', 1);
  if ($('#cp1').value.length < 6) return toast('Min 6 characters', 1); const n = await hashPass($('#cp1').value); u.pass = n.hash; u.salt = n.salt; await saveUsers(); closeModal(); toast('Password changed');
}
async function newRecoveryCode() { const u = S.users.find(x => x.id === S.user.id); const code = randomCode(16); const rh = await hashPass(code.replace(/-/g, '')); u.rec = rh.hash; u.recSalt = rh.salt; await saveUsers(); showRecovery(code, () => { }); }

/* ---------- Licensing (signed keys) ---------- */
async function installId() { let id = await DB.get('kv', 'installId'); if (!id) { id = randomCode(12); await DB.put('kv', 'installId', id); } return id; }
async function verifySigned(token) {
  try {
    const [p, s] = token.replace(/\s/g, '').split('.'); if (!p || !s) return null;
    const key = await crypto.subtle.importKey('jwk', DEV_PUBKEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(s), enc.encode(p));
    return ok ? JSON.parse(dec.decode(unb64u(p))) : null;
  } catch (e) { return null; }
}
async function signPayload(obj, privJwk) {
  const key = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const p = b64u(enc.encode(JSON.stringify(obj))); const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(p));
  return p + '.' + b64u(sig);
}
async function loadLicense() {
  const tok = await DB.get('kv', 'license'); S.installDate = (await DB.get('kv', 'installDate')) || todayAD();
  S.license = tok ? await verifySigned(tok) : null; if (S.license && S.license.t !== 'lic') S.license = null;
}
function licenseState() {
  const L = S.license;
  if (L) { const exp = L.x && L.x < todayAD(); return { active: !exp, licensed: true, ed: L.ed || 'NP', label: (exp ? `Licence expired on ${L.x}` : `Licensed to ${L.c}${L.x ? ' · valid till ' + L.x : ' · lifetime'}`) + ' · ' + ({ NP: 'Nepal edition', INTL: 'International edition', ALL: 'Nepal + International' })[L.ed || 'NP'], maxEntities: L.n || 0, maxUsers: L.u || 0, plan: L.p }; }
  const used = Math.floor((new Date(todayAD()) - new Date(S.installDate || todayAD())) / 864e5); const left = TRIAL_DAYS - used;
  return { active: left >= 0, licensed: false, label: left >= 0 ? `Free trial – ${left} day(s) left` : 'Trial ended – read-only', maxEntities: 3, maxUsers: 2 };
}
async function applyLicense(tok) {
  const p = await verifySigned(tok); if (!p || p.t !== 'lic') return toast('This licence key is not valid', 1);
  if (p.iid && p.iid !== await installId()) return toast('This key was issued for a different install', 1);
  await DB.put('kv', 'license', tok.trim()); S.license = p; toast('Licence activated: ' + p.c); App.render();
}
