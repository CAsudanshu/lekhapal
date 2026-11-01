/* My CA firm: own books, work types, engagements (fees, billing, collection, finalized files),
   admin & subscriptions (plans, licences, client access), daily automatic folder backups */
'use strict';

const DEF_WORKTYPES = ['Statutory audit', 'Internal audit', 'Income tax return & tax audit', 'VAT return filing', 'TDS return filing', 'Bookkeeping & accounting', 'OCR annual return & compliance', 'Company / firm registration', 'PAN / VAT registration', 'Financial projection / CMA / bank work', 'Consultancy & advisory', 'Due diligence', 'Software subscription (LekhaPal)', 'Other services'];
const DEF_PLANS = [{ id: 'm1', name: 'Monthly', months: 1, price: 1500, n: 1, u: 2 }, { id: 'y1', name: 'Yearly', months: 12, price: 15000, n: 1, u: 2 }, { id: 'y2', name: '2 years', months: 24, price: 27000, n: 2, u: 3 }, { id: 'y3', name: '3 years', months: 36, price: 39000, n: 3, u: 3 }, { id: 'y5', name: '5 years', months: 60, price: 60000, n: 5, u: 5 }, { id: 'life', name: 'Lifetime', months: 0, price: 100000, n: 0, u: 0 }];
async function getPractice() { const P = (await DB.get('kv', 'practice')) || {}; P.fees = P.fees || {}; P.tasks = P.tasks || []; P.receipts = P.receipts || []; P.engs = P.engs || []; P.workTypes = P.workTypes || DEF_WORKTYPES.slice(); P.plans = P.plans || clone(DEF_PLANS); P.subs = P.subs || []; return P; }
async function savePractice(P) { await DB.put('kv', 'practice', P); }
const firmId = () => S.settings.firmId || '';
const addMonths = (iso, m) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + m); return isoOf(d); };

/* =================== FIRM BOOKS =================== */
function firmSetup() {
  modal('Set up my firm\'s books', `<p class="small muted">Your firm gets its own set of books, exactly like a client – with fee income ledgers for each type of work. Fees you bill and collect from clients are posted here automatically.</p>
  <label>Firm name</label><input id="fs_name" value="${h(S.settings.firm || 'Sudanshu Mallick & Associates')}"><div class="row"><div><label>Type</label><select id="fs_type">${['Sole Proprietorship', 'Partnership Firm', 'Private Limited Company'].map(t => `<option>${t}</option>`).join('')}</select></div><div><label>PAN / VAT</label><input id="fs_pan" maxlength="9"></div></div>
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="fs_vat"> Firm is VAT registered</label><label>Address</label><input id="fs_addr" placeholder="Birtamod, Jhapa">
  <div class="btns"><button class="btn pri" onclick="createFirm()">Create firm books</button></div>`);
}
async function createFirm() {
  const name = $('#fs_name').value.trim(); if (!name) return toast('Enter firm name', 1); const P = await getPractice();
  const E = newEntityObject({ name, type: $('#fs_type').value, legal: { pan: $('#fs_pan').value.trim(), vatReg: $('#fs_vat').checked, address: $('#fs_addr').value.trim() } }); E.isFirm = true;
  E.groups.push({ id: 'g_fee', name: 'Professional Fee Income', parent: '', nature: 'I', fs: 'REV', sys: true });
  P.workTypes.forEach(w => E.ledgers.push({ id: uid('l'), name: w + ' – fee', g: 'g_fee', ob: 0, wt: w }));
  S.entities.push({ id: E.id, name: E.name, type: E.type, pan: E.legal.pan, updated: todayAD(), isFirm: true }); await saveEntities(); await DB.put('entities', E.id, E);
  S.settings.firmId = E.id; S.settings.firm = name; await DB.put('kv', 'settings', S.settings); closeModal(); toast('Firm books created'); App.render();
}
async function goFirm() { if (!firmId()) return firmSetup(); await openEntity(firmId()); }
async function withFirm(fn) {
  const id = firmId(); if (!id) { firmSetup(); return null; }
  if (S.E && S.E.id === id) return fn(S.E);
  const prev = S.E; const F = await DB.get('entities', id); migrateEntity(F); S.E = F; invalidate();
  try { return await fn(F); } finally { S.E = prev; invalidate(); }
}
function feeLedger(F, wt) { let l = F.ledgers.find(x => x.wt === wt); if (!l) { if (!F.groups.find(g => g.id === 'g_fee')) F.groups.push({ id: 'g_fee', name: 'Professional Fee Income', parent: '', nature: 'I', fs: 'REV', sys: true }); l = { id: uid('l'), name: wt + ' – fee', g: 'g_fee', ob: 0, wt }; F.ledgers.push(l); } return l; }
async function clientLedger(F, name, entityId) {
  let l = F.ledgers.find(x => (entityId && x.clientId === entityId) || x.name.toLowerCase() === name.toLowerCase());
  if (!l) { let pan = '', addr = ''; if (entityId) { const CE = await DB.get('entities', entityId); if (CE) { pan = CE.legal.pan; addr = CE.legal.address; } } l = { id: uid('l'), name, g: 'g_debt', ob: 0, pan, addr, clientId: entityId || '' }; F.ledgers.push(l); }
  return l;
}

/* =================== PRACTICE: engagements, fees, collections, files =================== */
async function engMoney(P) {
  const id = firmId(); const F = id ? (S.E && S.E.id === id ? S.E : await DB.get('entities', id)) : null; const m = {};
  if (F) (F.vouchers || []).filter(v => v.eng && !v.cancelled).forEach(v => { const o = m[v.eng] = m[v.eng] || { billed: 0, fee: 0, tds: 0, coll: 0, list: [] }; if (v.type === 'SAL') { o.billed += v.bill.total; o.fee += v.bill.taxable + v.bill.exempt; o.tds += num(v.bill.tds); } if (v.type === 'RCT') o.coll += sum(v.lines, x => x.dr); if (v.type === 'CN') o.billed -= v.bill.total; o.list.push(v); });
  Object.values(m).forEach(o => { o.out = r2(o.billed - o.tds - o.coll); }); return m;
}
async function viewPractice() {
  if (S.user.role !== 'admin') return noAccess(); const P = await getPractice(); const tab = S.params.tab || 'work'; const fy = S.params.fy || fyOf(todayAD());
  const M = await engMoney(P); const name = e => e.client ? ((S.entities.find(x => x.id === e.client) || {}).name || e.cname) : e.cname;
  const engs = P.engs.filter(e => (fy === 'all' || e.fy === fy) && (!S.params.wt || e.wt === S.params.wt) && (!S.params.st || e.status === S.params.st));
  const rows = engs.map(e => { const m = M[e.id] || { billed: 0, coll: 0, tds: 0, out: 0 }; return { ...e, cn: name(e), billed: m.billed, coll: m.coll + m.tds, out: m.out, nf: (e.files || []).length, _cls: 'click', _click: `editEng('${e.id}')` }; });
  const by = key => { const o = {}; rows.forEach(r => { const k = r[key]; const x = o[k] = o[k] || { k, n: 0, fee: 0, billed: 0, coll: 0, out: 0 }; x.n++; x.fee += num(r.fee); x.billed += r.billed; x.coll += r.coll; x.out += r.out; }); return Object.values(o).sort((a, b) => b.fee - a.fee); };
  const fys = Array.from(new Set([fyOf(todayAD()), ...P.engs.map(e => e.fy)])).sort().reverse();
  const tiles = `<div class="tiles"><div class="tile"><div class="lbl">Jobs (${fy === 'all' ? 'all years' : 'FY ' + fy})</div><div class="big">${rows.length}</div></div><div class="tile"><div class="lbl">Agreed fees</div><div class="big">${fmt(sum(rows, r => r.fee))}</div></div><div class="tile"><div class="lbl">Billed</div><div class="big">${fmt(sum(rows, r => r.billed))}</div></div><div class="tile"><div class="lbl">Collected (incl. TDS)</div><div class="big ok">${fmt(sum(rows, r => r.coll))}</div></div><div class="tile"><div class="lbl">Outstanding</div><div class="big bad">${fmt(sum(rows, r => r.out))}</div></div><div class="tile"><div class="lbl">Open deadlines</div><div class="big">${P.tasks.filter(t => t.st !== 'Done').length}</div></div></div>`;
  const firmCard = firmId() ? `<div class="alert g">Fees billed and collected here are posted automatically into your firm's books. <a href="#" onclick="goFirm();return false"><b>Open my firm books →</b></a></div>` : `<div class="alert b">Set up your firm's own books so fee bills and collections post automatically. <button class="btn sm pri" onclick="firmSetup()">Set up my firm books</button></div>`;
  let body = '';
  if (tab === 'work') body = `<div class="row no-print"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})"><option value="all" ${fy === 'all' ? 'selected' : ''}>All years</option>${fys.map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div><div><label>Type of work</label><select onchange="App.setp({wt:this.value})"><option value="">All</option>${P.workTypes.map(w => `<option ${w === S.params.wt ? 'selected' : ''}>${h(w)}</option>`).join('')}</select></div><div><label>Status</label><select onchange="App.setp({st:this.value})"><option value="">All</option>${ENG_ST.map(s => `<option ${s === S.params.st ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
    <div class="btns no-print"><button class="btn pri" onclick="editEng()">+ New job / engagement</button><button class="btn" onclick="editWorkTypes()">Types of work</button><button class="btn" onclick="exportTable('eng_t','Engagements')">Export Excel</button></div>
    <div id="eng_t">${table([{ k: 'cn', t: 'Client' }, { k: 'wt', t: 'Work' }, { k: 'fy', t: 'FY' }, { k: 'due', t: 'Due', f: dBS }, { k: 'status', t: 'Status', f: v => `<span class="pill ${v === 'Completed' ? 'g' : v === 'In progress' ? 'b' : 'y'}">${h(v)}</span>` }, { k: 'fee', t: 'Agreed fee', n: 1, f: v => fmt(v) }, { k: 'billed', t: 'Billed', n: 1, f: v => fmt(v) }, { k: 'coll', t: 'Collected', n: 1, f: v => fmt(v) }, { k: 'out', t: 'Outstanding', n: 1, f: v => `<span class="${v > 0.005 ? 'bad' : ''}">${fmt(v)}</span>` }, { k: 'nf', t: 'Files', n: 1 }, { k: 'id', t: '', f: v => `<span class="no-print"><button class="btn sm" onclick="event.stopPropagation();billEng('${v}')">Bill</button> <button class="btn sm" onclick="event.stopPropagation();collectEng('${v}')">Receive</button> <button class="btn sm" onclick="event.stopPropagation();engFiles('${v}')">Files</button></span>` }], rows, { empty: 'No jobs yet – add one with “New job / engagement”.' })}</div>`;
  if (tab === 'fees') { const c = [{ k: 'k', t: '' }, { k: 'n', t: 'Jobs', n: 1 }, { k: 'fee', t: 'Agreed fee', n: 1, f: v => fmt(v) }, { k: 'billed', t: 'Billed', n: 1, f: v => fmt(v) }, { k: 'coll', t: 'Collected', n: 1, f: v => fmt(v) }, { k: 'out', t: 'Outstanding', n: 1, f: v => fmt(v) }];
    body = `<div class="row no-print"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})"><option value="all" ${fy === 'all' ? 'selected' : ''}>All years</option>${fys.map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>${rptBtns('fee_t', 'Fees_' + fy.replace('/', '-'))}<div id="fee_t"><h3>By type of work</h3>${table(c.map((x, i) => i ? x : { ...x, t: 'Type of work' }), by('wt'))}<h3>By client</h3>${table(c.map((x, i) => i ? x : { ...x, t: 'Client' }), by('cn'))}</div>`; }
  if (tab === 'tasks') { const st = S.params.ts || 'open'; const tasks = P.tasks.filter(t => st === 'all' || (st === 'open' ? t.st !== 'Done' : t.st === 'Done')).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    body = `<div class="btns"><button class="btn pri" onclick="editTask()">+ Add deadline</button><button class="btn" onclick="autoTasks()">Add this month's VAT/TDS deadlines for all clients</button></div><div class="seg">${[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, t]) => `<button class="${st === k ? 'on' : ''}" onclick="App.setp({ts:'${k}'})">${t}</button>`).join('')}</div>
    ${table([{ k: 'due', t: 'Due (BS)', f: v => v ? `<span class="${v < todayAD() ? 'bad' : ''}">${toBS(v)}</span>` : '' }, { k: 'cn', t: 'Client' }, { k: 'title', t: 'Task' }, { k: 'who', t: 'Assigned to' }, { k: 'st', t: 'Status', f: v => `<span class="pill ${v === 'Done' ? 'g' : v === 'In progress' ? 'b' : 'y'}">${v}</span>` }], tasks.map(t => ({ ...t, cn: (S.entities.find(e => e.id === t.e) || {}).name || '-', _cls: 'click', _click: `editTask('${t.id}')` })))}`; }
  return `<h2>My CA practice</h2>${firmCard}${tiles}<div class="seg no-print">${[['work', 'Jobs & engagements'], ['fees', 'Fees & collection by work type'], ['tasks', 'Deadlines']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" onclick="App.setp({tab:'${k}'})">${t}</button>`).join('')}</div>${body}`;
}
const ENG_ST = ['Not started', 'In progress', 'Waiting for client', 'Completed', 'Cancelled'];
async function editWorkTypes() { const P = await getPractice(); modal('Types of work', `<p class="small muted">One per line. Each type gets its own fee income ledger in your firm books.</p><textarea id="wt_l" rows="14">${h(P.workTypes.join('\n'))}</textarea><div class="btns"><button class="btn pri" onclick="(async()=>{const P=await getPractice();P.workTypes=$('#wt_l').value.split('\\n').map(x=>x.trim()).filter(Boolean);await savePractice(P);closeModal();App.render()})()">Save</button></div>`); }
async function editEng(id) {
  const P = await getPractice(); const e = P.engs.find(x => x.id === id) || { fy: fyOf(todayAD()), status: 'Not started', wt: P.workTypes[0] }; const M = id ? (await engMoney(P))[id] : null;
  modal(id ? 'Job / engagement' : 'New job / engagement', `<div class="row"><div><label>Client (entity)</label><select id="en_c"><option value="">(not in LekhaPal – type name)</option>${S.entities.filter(x => !x.isFirm).map(x => `<option value="${x.id}" ${x.id === e.client ? 'selected' : ''}>${h(x.name)}</option>`).join('')}</select></div><div><label>Client name (if not in list)</label><input id="en_cn" value="${h(e.cname || '')}"></div></div>
  <div class="row"><div><label>Type of work</label><select id="en_wt">${P.workTypes.map(w => `<option ${w === e.wt ? 'selected' : ''}>${h(w)}</option>`).join('')}</select></div><div><label>For FY</label><input id="en_fy" value="${h(e.fy)}"></div><div><label>Agreed fee (Rs, excl. VAT)</label><input id="en_fee" value="${e.fee || ''}"></div></div>
  <div class="row">${dateInput('en_due', e.due || '', 'Due date (BS)')}<div><label>Status</label><select id="en_st">${ENG_ST.map(s => `<option ${s === e.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div><label>Assigned to</label><input id="en_who" value="${h(e.who || '')}"></div></div>
  <label>Notes</label><textarea id="en_n" rows="2">${h(e.notes || '')}</textarea>
  ${M ? `<div class="kv card"><div>Billed</div><div>${fmt(M.billed)}</div><div>Collected (incl. TDS ${fmt(M.tds)})</div><div>${fmt(M.coll + M.tds)}</div><div>Outstanding</div><div class="${M.out > 0 ? 'bad' : ''}">${fmt(M.out)}</div></div>` : ''}
  <div class="btns"><button class="btn pri" onclick="saveEng('${id || ''}')">Save</button>${id ? `<button class="btn" onclick="billEng('${id}')">Bill fee</button><button class="btn" onclick="collectEng('${id}')">Record collection</button><button class="btn" onclick="engFiles('${id}')">Finalized files (${(e.files || []).length})</button><button class="btn red" onclick="delEng('${id}')">Delete</button>` : ''}</div>`, { wide: true });
}
async function saveEng(id) {
  const P = await getPractice(); const c = $('#en_c').value; const o = { id: id || uid('j'), client: c, cname: c ? (S.entities.find(x => x.id === c) || {}).name : $('#en_cn').value.trim(), wt: $('#en_wt').value, fy: $('#en_fy').value.trim(), fee: num($('#en_fee').value), due: readDate('en_due'), status: $('#en_st').value, who: $('#en_who').value.trim(), notes: $('#en_n').value };
  if (!o.cname) return toast('Choose or type the client', 1); const old = P.engs.find(x => x.id === id); if (old) { o.files = old.files || []; if (o.status === 'Completed' && old.status !== 'Completed') o.done = todayAD(); Object.assign(old, o); } else P.engs.push({ ...o, files: [] });
  await savePractice(P); closeModal(); toast('Saved'); App.render();
}
async function delEng(id) { if (!confirmBox('Delete this job? Bills already posted in firm books stay.')) return; const P = await getPractice(); P.engs = P.engs.filter(x => x.id !== id); await savePractice(P); closeModal(); App.render(); }
async function billEng(id) {
  if (!firmId()) return firmSetup(); const P = await getPractice(); const e = P.engs.find(x => x.id === id); const M = (await engMoney(P))[id] || { fee: 0 }; const F = await DB.get('entities', firmId());
  modal('Bill fee – ' + h(e.cname), `<p>${h(e.wt)} · FY ${h(e.fy)}</p><div class="row">${dateInput('bf_d', todayAD(), 'Bill date (BS)')}<div><label>Fee amount (excl. VAT)</label><input id="bf_a" value="${Math.max(0, r2(num(e.fee) - M.fee)) || ''}"></div><div><label>VAT %</label><input id="bf_v" value="${F && F.legal.vatReg ? defVat(F) : 0}"></div><div><label>TDS deducted by client %</label><input id="bf_t" placeholder="e.g. 1.5 or 15"></div></div><label>Narration</label><input id="bf_n" value="${h(e.wt + ' for FY ' + e.fy)}">
  <div class="btns"><button class="btn pri" onclick="doBillEng('${id}',true)">Save & print bill</button><button class="btn" onclick="doBillEng('${id}')">Save</button></div>`);
}
async function doBillEng(id, print) {
  const P = await getPractice(); const e = P.engs.find(x => x.id === id); const date = readDate('bf_d'), amt = num($('#bf_a').value); if (!date || !amt) return toast('Enter date and amount', 1);
  const vr = num($('#bf_v').value), tds = num($('#bf_t').value), narr = $('#bf_n').value; let vid = null;
  await withFirm(async Fm => { const party = await clientLedger(Fm, e.cname, e.client); const led = feeLedger(Fm, e.wt); const v = { type: 'SAL', date, narration: narr, eng: id, bill: { party: party.id, pan: party.pan, rows: [{ k: 'l', id: led.id, amt, vr, tax: vr > 0, desc: narr }], tdsRate: tds, payMode: 'Credit' } }; if (await saveVoucher(v)) vid = v.id; });
  if (!vid) return; closeModal(); toast('Fee bill posted in firm books'); if (print) { await withFirm(async () => { await printInvoice(vid); }); } else App.render();
}
async function collectEng(id) {
  if (!firmId()) return firmSetup(); const P = await getPractice(); const e = P.engs.find(x => x.id === id); const M = (await engMoney(P))[id] || { out: 0 }; const F = await DB.get('entities', firmId()); const cbs = F.ledgers.filter(l => { const path = []; let g = F.groups.find(x => x.id === l.g); while (g) { path.push(g.id); g = F.groups.find(x => x.id === g.parent); } return path.includes('g_cash') || path.includes('g_bank'); });
  modal('Record collection – ' + h(e.cname), `<div class="row">${dateInput('cl_d', todayAD(), 'Date (BS)')}<div><label>Amount received</label><input id="cl_a" value="${M.out > 0 ? M.out : ''}"></div><div><label>Received in</label><select id="cl_cb">${cbs.map(l => `<option value="${l.id}">${h(l.name)}</option>`).join('')}</select></div></div><label>Reference / cheque no.</label><input id="cl_r"><div class="btns"><button class="btn pri" onclick="doCollectEng('${id}')">Save</button></div>`);
}
async function doCollectEng(id) {
  const P = await getPractice(); const e = P.engs.find(x => x.id === id); const date = readDate('cl_d'), amt = num($('#cl_a').value), cb = $('#cl_cb').value; if (!date || !amt) return toast('Enter date and amount', 1); let ok = false;
  await withFirm(async Fm => { const party = await clientLedger(Fm, e.cname, e.client); ok = await saveVoucher({ type: 'RCT', date, eng: id, refNo: $('#cl_r').value.trim(), narration: 'Fee received – ' + e.wt + ' FY ' + e.fy, lines: [{ l: cb, dr: amt, cr: 0 }, { l: party.id, dr: 0, cr: amt }] }); });
  if (ok) { closeModal(); toast('Collection recorded in firm books'); App.render(); }
}
async function engFiles(id) {
  const P = await getPractice(); const e = P.engs.find(x => x.id === id); const docs = []; for (const d of (e.files || [])) { const x = await DB.get('docs', d); if (x) docs.push(x); }
  modal('Finalized files – ' + h(e.cname) + ' · ' + h(e.wt) + ' FY ' + h(e.fy), `<p class="small muted">Keep the final signed reports, returns, financial statements and working files for this job. Open them inside the app or download any time.</p>
  ${table([{ k: 'name', t: 'File' }, { k: 'size', t: 'Size', n: 1, f: v => (v / 1024).toFixed(0) + ' KB' }, { k: 'date', t: 'Added', f: dBS }, { k: 'id', t: '', f: v => `<button class="btn sm pri" onclick="viewDoc('${v}')">View</button> <button class="btn sm" onclick="dlDoc('${v}')">Download</button> <button class="btn sm red" onclick="engDelFile('${id}','${v}')">Remove</button>` }], docs, { empty: 'No files yet' })}
  <div class="btns"><button class="btn pri" onclick="engAddFiles('${id}')">Upload files</button></div>`, { wide: true });
}
async function engAddFiles(id) {
  const fs = await pickFile('', true); if (!fs || !fs.length) return; const P = await getPractice(); const e = P.engs.find(x => x.id === id); e.files = e.files || [];
  for (const f of fs) e.files.push(await saveDoc(f, { entityId: e.client || firmId() || (S.E && S.E.id), cat: 'Finalized work – ' + e.wt, fy: e.fy, note: e.cname, engId: id }));
  await savePractice(P); toast(fs.length + ' file(s) saved'); engFiles(id);
}
async function engDelFile(id, did) { if (!confirmBox('Remove this file?')) return; const P = await getPractice(); const e = P.engs.find(x => x.id === id); e.files = (e.files || []).filter(x => x !== did); await DB.del('docs', did); await savePractice(P); engFiles(id); }

/* =================== IN-APP DOCUMENT VIEWER =================== */
async function viewDoc(id) {
  const d = await DB.get('docs', id); if (!d) return toast('File not found', 1); const url = URL.createObjectURL(d.blob); const n = d.name.toLowerCase(); let body = '';
  if (/\.pdf$/.test(n) || d.type === 'application/pdf') body = `<iframe src="${url}" style="width:100%;height:75vh;border:1px solid var(--line);border-radius:8px"></iframe>`;
  else if (/^image\//.test(d.type) || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) body = `<img src="${url}" style="max-width:100%;border:1px solid var(--line);border-radius:8px">`;
  else if (/\.(xlsx|xls|csv|ods)$/.test(n)) { try { const wb = XLSX.read(await d.blob.arrayBuffer(), { type: 'array' }); body = wb.SheetNames.map(s => `<h3>${h(s)}</h3><div class="tw" style="max-height:60vh">${XLSX.utils.sheet_to_html(wb.Sheets[s], { header: '', footer: '' }).replace('<table', '<table class="t"')}</div>`).join(''); } catch (e) { body = '<p>Could not preview this spreadsheet.</p>'; } }
  else if (/^text\//.test(d.type) || /\.(txt|json|xml|md)$/.test(n)) body = `<pre style="white-space:pre-wrap;max-height:70vh;overflow:auto">${h(await d.blob.text())}</pre>`;
  else body = `<p>This file type (${h(n.split('.').pop())}) cannot be shown inside the app. Download it to open in Word or another program.</p>`;
  modal(h(d.name), body + `<div class="btns"><button class="btn pri" onclick="dlDoc('${id}')">Download</button><a class="btn" href="${url}" target="_blank" rel="noopener">Open in new tab</a></div>`, { wide: true, nofocus: true });
}

/* =================== ADMIN & SUBSCRIPTIONS =================== */
function subStatus(s) { if (!s.expiry) return ['Active (lifetime)', 'g']; if (s.expiry < todayAD()) return ['Expired', 'r']; if (s.expiry <= addDays(todayAD(), 30)) return ['Expiring soon', 'y']; return ['Active', 'g']; }
async function viewAdmin() {
  if (S.user.role !== 'admin') return noAccess(); const P = await getPractice(); const tab = S.params.tab || 'subs'; const lic = licenseState();
  const subs = P.subs.map(s => { const [st, c] = subStatus(s); return { ...s, st, c, due: r2(num(s.amount) - num(s.paid)), _cls: 'click', _click: `editSub('${s.id}')` }; }).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  const tiles = `<div class="tiles"><div class="tile"><div class="lbl">Subscribers</div><div class="big">${subs.length}</div></div><div class="tile"><div class="lbl">Active</div><div class="big ok">${subs.filter(s => s.c === 'g').length}</div></div><div class="tile"><div class="lbl">Expiring in 30 days</div><div class="big warn">${subs.filter(s => s.c === 'y').length}</div></div><div class="tile"><div class="lbl">Expired</div><div class="big bad">${subs.filter(s => s.c === 'r').length}</div></div><div class="tile"><div class="lbl">Subscription fees due</div><div class="big" style="font-size:1rem">${(() => { const m = {}; subs.forEach(s => { if (s.due > 0) m[s.cur || 'NPR'] = (m[s.cur || 'NPR'] || 0) + s.due; }); return Object.entries(m).map(([c, v]) => c + ' ' + fmt(v)).join('<br>') || '0.00'; })()}</div></div></div>`;
  let body = '';
  if (tab === 'subs') body = `<div class="btns no-print"><button class="btn pri" onclick="editSub()">+ New subscription</button><button class="btn" onclick="exportTable('sub_t','Subscriptions')">Export Excel</button></div><div id="sub_t">${table([{ k: 'client', t: 'Client' }, { k: 'plan', t: 'Plan' }, { k: 'ed', t: 'Edition', f: v => `<span class="pill ${v === 'INTL' ? 'b' : v === 'ALL' ? 'y' : 'g'}">${({ NP: 'Nepal', INTL: 'International', ALL: 'Both' })[v || 'NP']}</span>` }, { k: 'start', t: 'Start', f: dBS }, { k: 'expiry', t: 'Valid till', f: v => v ? toBS(v) : 'Lifetime' }, { k: 'st', t: 'Status', f: (v, r) => `<span class="pill ${r.c}">${v}</span>` }, { k: 'amount', t: 'Fee', n: 1, f: (v, r) => (r.cur || 'NPR') + ' ' + fmt(v) }, { k: 'paid', t: 'Paid', n: 1, f: v => fmt(v) }, { k: 'due', t: 'Due', n: 1, f: v => `<span class="${v > 0 ? 'bad' : ''}">${fmt(v)}</span>` }, { k: 'id', t: '', f: (v, r) => `<span class="no-print"><button class="btn sm" onclick="event.stopPropagation();renewSub('${v}')">Renew</button> <button class="btn sm" onclick="event.stopPropagation();subKey('${v}')">Licence key</button></span>` }], subs, { empty: 'No subscribers yet.' })}</div>`;
  if (tab === 'plans') body = `<p class="muted">Prices and limits for each plan (months 0 = lifetime; limits 0 = unlimited).</p><div class="tw"><table class="t ent"><thead><tr><th>Plan name</th><th>Months</th><th>Price (Rs)</th><th>Max entities</th><th>Max users</th><th></th></tr></thead><tbody id="pl_rows">${P.plans.map(p => `<tr><td><input data-k="name" value="${h(p.name)}"></td><td><input data-k="months" value="${p.months}"></td><td><input data-k="price" value="${p.price}"></td><td><input data-k="n" value="${p.n}"></td><td><input data-k="u" value="${p.u}"></td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div><div class="btns"><button class="btn sm" onclick="addRowTo('pl_rows',['name','months','price','n','u'])">+ Add plan</button><button class="btn pri" onclick="savePlans()">Save plans</button></div>`;
  if (tab === 'access') body = `<div class="card"><h3>Give a client access on this device</h3><p class="small muted">If you keep a client's books here and want them (or their accountant) to log in and see only their own company, create a login limited to that entity and to the sections you choose.</p><div class="btns"><button class="btn pri" onclick="clientLogin()">Create client login</button><button class="btn" onclick="App.go('users')">All users & permissions</button></div></div>
  <div class="card"><h3>Client using LekhaPal on their own computer</h3><p class="small muted">Create a subscription (Subscriptions tab) and send them the licence key. Their app shows its Install ID under Settings › Licence; you can lock a key to that ID so it cannot be shared.</p></div>
  <div class="card"><h3>Developer key ${DEVKEY ? '<span class="pill g">loaded</span>' : '<span class="pill y">not loaded</span>'}</h3><p class="small muted">Load ADMIN-PRIVATE-LICENSE-KEY.json once per session to issue licence keys and admin reset codes.</p><div class="btns"><button class="btn" onclick="loadDevKey()">Load private key file</button>${DEVKEY ? `<button class="btn" onclick="viewDeveloper()">Admin password reset code</button>` : ''}</div></div>
  <div class="card"><h3>This device</h3><p>${h(lic.label)} · Install ID <b>${await installId()}</b></p></div>`;
  return `<h2>Admin & subscriptions</h2><p class="muted">Sell LekhaPal to clients on monthly, yearly or multi-year plans, issue licence keys, and control who can use what.</p>${tiles}<div class="seg no-print">${[['subs', 'Subscriptions'], ['plans', 'Plans & prices'], ['access', 'Client access & keys']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" onclick="App.setp({tab:'${k}'})">${t}</button>`).join('')}</div>${body}`;
}
async function savePlans() { const P = await getPractice(); P.plans = $$('#pl_rows tr').map(tr => { const o = { id: uid('p') }; $$('input', tr).forEach(i => o[i.dataset.k] = i.dataset.k === 'name' ? i.value.trim() : num(i.value)); return o; }).filter(p => p.name); await savePractice(P); toast('Plans saved'); App.render(); }
async function editSub(id, renewFrom) {
  const P = await getPractice(); const s = P.subs.find(x => x.id === id) || renewFrom || { start: todayAD(), plan: 'Yearly' }; const plan = P.plans.find(p => p.name === s.plan) || P.plans[0];
  modal(id ? 'Subscription' : renewFrom ? 'Renew subscription' : 'New subscription', `<div class="row"><div><label>Client name</label><input id="sb_c" value="${h(s.client || '')}" list="dl_cl"><datalist id="dl_cl">${S.entities.map(e => `<option value="${h(e.name)}">`).join('')}</datalist></div><div><label>Email / phone</label><input id="sb_e" value="${h(s.email || '')}"></div></div>
  <div class="row"><div><label>Edition the client gets</label><select id="sb_ed" onchange="$('#sb_cur').value=this.value==='NP'?'NPR':($('#sb_cur').value==='NPR'?'USD':$('#sb_cur').value)">${[['NP', 'Nepal edition (BS, NPR, VAT/PAN/TDS, NFRS)'], ['INTL', 'International edition (any country, IFRS)'], ['ALL', 'Both editions']].map(([k, t]) => `<option value="${k}" ${(s.ed || 'NP') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div><label>Fee currency</label><input id="sb_cur" value="${h(s.cur || ((s.ed || 'NP') === 'NP' ? 'NPR' : 'USD'))}" style="max-width:120px"></div></div>
  <div class="row"><div><label>Plan</label><select id="sb_p" onchange="subPlanChanged()">${P.plans.map(p => `<option value="${h(p.name)}" data-m="${p.months}" data-pr="${p.price}" data-n="${p.n}" data-u="${p.u}" ${p.name === (s.plan || plan.name) ? 'selected' : ''}>${h(p.name)} – Rs ${fmt(p.price)}</option>`).join('')}</select></div>${dateInput('sb_s', s.start, 'Start date (BS)')}<div><label>Valid till (AD, blank = lifetime)</label><input id="sb_x" type="date" value="${s.expiry || ''}"></div></div>
  <div class="row"><div><label>Fee (Rs)</label><input id="sb_a" value="${s.amount ?? plan.price}"></div><div><label>Paid (Rs)</label><input id="sb_pd" value="${s.paid || ''}"></div><div><label>Max entities</label><input id="sb_n" value="${s.n ?? plan.n}"></div><div><label>Max users</label><input id="sb_u" value="${s.u ?? plan.u}"></div></div>
  <div class="row"><div><label>Client Install ID (optional – locks the key)</label><input id="sb_iid" value="${h(s.iid || '')}"></div></div><label>Notes</label><input id="sb_no" value="${h(s.notes || '')}">
  ${s.key ? `<label>Licence key</label><textarea rows="3" readonly onclick="this.select()">${h(s.key)}</textarea>` : ''}
  <div class="btns"><button class="btn pri" onclick="saveSub('${id || ''}')">Save${DEVKEY ? ' & generate key' : ''}</button>${firmId() ? `<button class="btn" onclick="saveSub('${id || ''}',true)">Save & bill in firm books</button>` : ''}${id ? `<button class="btn red" onclick="delSub('${id}')">Delete</button>` : ''}</div>${DEVKEY ? '' : '<p class="small muted">Load your private key (Client access & keys tab) to generate the licence key automatically.</p>'}`, { wide: true });
  if (!id) subPlanChanged();
}
function subPlanChanged() { const o = $('#sb_p').selectedOptions[0]; const m = num(o.dataset.m); const st = readDate('sb_s') || todayAD(); $('#sb_x').value = m ? addDays(addMonths(st, m), -1) : ''; $('#sb_a').value = o.dataset.pr; $('#sb_n').value = o.dataset.n; $('#sb_u').value = o.dataset.u; }
async function saveSub(id, bill) {
  const P = await getPractice(); const o = { id: id || uid('s'), client: $('#sb_c').value.trim(), email: $('#sb_e').value.trim(), plan: $('#sb_p').value, start: readDate('sb_s') || todayAD(), expiry: $('#sb_x').value, amount: num($('#sb_a').value), paid: num($('#sb_pd').value), n: num($('#sb_n').value), u: num($('#sb_u').value), iid: $('#sb_iid').value.trim(), notes: $('#sb_no').value, ed: $('#sb_ed').value, cur: $('#sb_cur').value.trim().toUpperCase() || 'NPR' };
  if (!o.client) return toast('Client name required', 1); const old = P.subs.find(x => x.id === id); if (old) o.key = old.key;
  if (DEVKEY) { const p = { t: 'lic', c: o.client, e: o.email, p: o.plan, ed: o.ed, n: o.n, u: o.u, x: o.expiry, i: todayAD(), id: o.id }; if (o.iid) p.iid = o.iid; o.key = await signPayload(p, DEVKEY); }
  if (old) Object.assign(old, o); else P.subs.push(o); await savePractice(P);
  if (bill && o.amount) { let eng = P.engs.find(e => e.subId === o.id); if (!eng) { eng = { id: uid('j'), client: (S.entities.find(e => e.name === o.client) || {}).id || '', cname: o.client, wt: 'Software subscription (LekhaPal)', fy: fyOf(o.start), fee: o.amount, status: 'Completed', subId: o.id, files: [] }; P.engs.push(eng); if (!P.workTypes.includes(eng.wt)) P.workTypes.push(eng.wt); await savePractice(P); } closeModal(); return billEng(eng.id); }
  closeModal(); toast(o.key ? 'Saved – licence key ready' : 'Saved'); if (o.key) subKey(o.id); else App.render();
}
async function delSub(id) { if (!confirmBox('Delete this subscription record?')) return; const P = await getPractice(); P.subs = P.subs.filter(s => s.id !== id); await savePractice(P); closeModal(); App.render(); }
async function renewSub(id) { const P = await getPractice(); const s = P.subs.find(x => x.id === id); const start = s.expiry && s.expiry >= todayAD() ? addDays(s.expiry, 1) : todayAD(); editSub('', { client: s.client, email: s.email, plan: s.plan, ed: s.ed, cur: s.cur, start, iid: s.iid, notes: 'Renewal of ' + (s.expiry ? toBS(s.expiry) : '') }); }
async function subKey(id) {
  const P = await getPractice(); const s = P.subs.find(x => x.id === id);
  if (!s.key) { if (!DEVKEY) return toast('Load your private key first (Admin › Client access & keys)', 1); editSub(id); return; }
  modal('Licence key – ' + h(s.client), `<p>${({ NP: 'Nepal edition', INTL: 'International edition', ALL: 'Both editions' })[s.ed || 'NP']} · ${h(s.plan)} · valid till ${s.expiry ? toBS(s.expiry) + ' BS' : 'lifetime'} · ${s.n || 'unlimited'} entities · ${s.u || 'unlimited'} users</p><textarea id="sk_k" rows="4" readonly onclick="this.select()">${h(s.key)}</textarea>
  <p class="small muted">Send this key to the client. They paste it in LekhaPal › Settings › Licence › Activate.</p><div class="btns"><button class="btn pri" onclick="navigator.clipboard.writeText($('#sk_k').value).then(()=>toast('Copied'))">Copy key</button><button class="btn" onclick="download('LekhaPal-licence-${h(s.client).replace(/\W+/g, '_')}.txt', $('#sk_k').value)">Download</button></div>`);
}
function clientLogin() { editUser(); setTimeout(() => { $('#uu_role').value = 'client'; rolePreset('client'); $('#uu_all').checked = false; }, 50); }

/* =================== DAILY AUTOMATIC FOLDER BACKUPS =================== */
const BK_KEEP = 30;
async function bkDirs() { const out = []; const g = await DB.get('kv', 'backupDir'); if (g) out.push({ key: 'backupDir', h: g, name: 'All data (firm + every client)', only: null }); for (const e of S.entities) { const d = await DB.get('kv', 'bkdir:' + e.id); if (d) out.push({ key: 'bkdir:' + e.id, h: d, name: e.name, only: e.id }); } return out; }
async function chooseBackupFolder(entityId) {
  if (!window.showDirectoryPicker) return toast('Folder backup needs Chrome or Edge on a computer. Use "Download backup" on this device.', 1);
  try { const hd = await window.showDirectoryPicker({ mode: 'readwrite' }); if (entityId === '__new') { window._newBkDir = hd; toast('Folder selected: ' + hd.name); const s = $('#ne_bkname'); if (s) s.textContent = hd.name; return; } await DB.put('kv', entityId ? 'bkdir:' + entityId : 'backupDir', hd); if (!S.settings.backupPass) await askBackupPass(); toast('Daily backup folder set: ' + hd.name); await runDailyBackups(true); App.render(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 1); }
}
async function removeBackupFolder(entityId) { await DB.del('kv', entityId ? 'bkdir:' + entityId : 'backupDir'); toast('Automatic backup folder removed'); App.render(); }
async function askBackupPass() { const p = prompt('Choose a password for your automatic backup files (needed to restore them). It is stored on this device:'); if (p) { S.settings.backupPass = p; await DB.put('kv', 'settings', S.settings); } return !!p; }
async function bkPending() { const out = []; for (const d of await bkDirs()) { try { if ((await d.h.queryPermission({ mode: 'readwrite' })) !== 'granted') out.push(d); } catch (e) { } } return out; }
async function runDailyBackups(force, interactive) {
  if (!S.user || !window.showDirectoryPicker) return; const dirs = await bkDirs(); if (!dirs.length) return; if (!S.settings.backupPass) { if (!interactive || !(await askBackupPass())) return; }
  const log = (await DB.get('kv', 'bkLog')) || {}; const today = todayAD(); let n = 0;
  for (const d of dirs) {
    if (!force && log[d.key] === today) continue;
    try {
      let perm = await d.h.queryPermission({ mode: 'readwrite' }); if (perm !== 'granted' && interactive) perm = await d.h.requestPermission({ mode: 'readwrite' }); if (perm !== 'granted') continue;
      const prefix = 'LekhaPal-' + (d.only ? d.name.replace(/[^\w]+/g, '_').slice(0, 40) : 'ALL') + '-'; const fh = await d.h.getFileHandle(prefix + toBS(today) + '.smlb', { create: true }); const w = await fh.createWritable(); await w.write(await encryptText(await buildBackup(d.only), S.settings.backupPass)); await w.close();
      const old = []; for await (const [nm] of d.h.entries()) if (nm.startsWith(prefix) && nm.endsWith('.smlb')) old.push(nm); old.sort().reverse().slice(BK_KEEP).forEach(nm => d.h.removeEntry(nm).catch(() => { }));
      log[d.key] = today; n++;
    } catch (e) { console.warn('backup failed', d.name, e); }
  }
  await DB.put('kv', 'bkLog', log); if (n) { await DB.put('kv', 'lastBackup', new Date().toISOString()); if (force || interactive) toast(`Backup saved (${n} folder${n > 1 ? 's' : ''})`); }
}
async function backupBanner() {
  if (!window.showDirectoryPicker || !S.user || S.user.role !== 'admin') return ''; const dirs = await bkDirs(); const lb = await DB.get('kv', 'lastBackup');
  if (!dirs.length) return (!lb || lb < addDays(todayAD(), -7)) ? `<div class="alert y no-print">No automatic backup is set up. <button class="btn sm" onclick="chooseBackupFolder()">Choose a backup folder</button> (e.g. inside your Google Drive folder)</div>` : '';
  const pend = await bkPending(); return pend.length || !S.settings.backupPass ? `<div class="alert y no-print">Automatic daily backup is waiting for your permission (${pend.map(d => h(d.name)).join(', ') || 'password'}). <button class="btn sm pri" onclick="runDailyBackups(true,true).then(()=>App.render())">Allow & back up now</button></div>` : '';
}
setInterval(() => runDailyBackups(false), 60 * 60 * 1000);
