/* App shell: routing, navigation, dashboard. Developed by CA Sudanshu Mallick. */
'use strict';
/* Clears the offline copy of the app (NOT your data) and reloads the newest files */
async function refreshApp() { try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) { } location.reload(); }
function noAccess() { return `<div class="card"><h3>No access</h3><p class="muted">Your login does not include this section. Ask the administrator.</p></div>`; }

const ROUTES = {
  home: { v: () => viewHome(), t: 'Dashboard' }, entities: { v: () => viewEntities(), t: 'Entities', noE: 1 }, users: { v: () => viewUsers(), t: 'Users', noE: 1 }, settings: { v: () => viewSettings(), t: 'Settings', noE: 1 },
  updates: { v: () => viewUpdates(), t: 'Nepal updates', noE: 1 }, practice: { v: () => viewPractice(), t: 'My practice', noE: 1 }, admin: { v: () => viewAdmin(), t: 'Admin', noE: 1 },
  parties: { v: () => viewParties() }, migrate: { v: () => viewMigrate(), p: 'import' }, depreciation: { v: () => viewDepreciation(), p: 'tax' }, taxcomp: { v: () => viewTaxComp(), p: 'tax' }, taxtools: { v: () => viewTaxComp(), p: 'tax' }, trash: { v: () => viewTrash(), p: 'delete' },
  entry: { v: () => viewEntry(), p: 'entry' }, daybook: { v: () => viewDaybook(), p: 'reports' }, bulk: { v: () => viewBulk(), p: 'entry', after: () => bulkHeads() }, scan: { v: () => viewScan(), p: 'import' }, import: { v: () => viewImport(), p: 'import' },
  ledgers: { v: () => viewLedgers() }, groups: { v: () => viewGroups() }, items: { v: () => viewItems() }, legal: { v: () => viewLegal() }, mapping: { v: () => viewMapping(), p: 'masters' },
  ledger: { v: () => viewLedgerRpt(), p: 'reports' }, tb: { v: () => viewTB(), p: 'reports' }, pl: { v: () => viewPL(), p: 'reports' }, bs: { v: () => viewBS(), p: 'reports' }, nfrs: { v: () => viewNFRS(), p: 'reports' }, cf: { v: () => viewCashflow(), p: 'reports' },
  ratios: { v: () => viewRatios(), p: 'reports' }, projection: { v: () => viewProjection(), p: 'reports' }, aging: { v: () => viewAging(), p: 'reports' }, stock: { v: () => viewStock(), p: 'reports' }, itemledger: { v: () => viewItemLedger(), p: 'reports' },
  health: { v: () => viewHealth(), p: 'reports' }, brs: { v: () => viewBRS(), p: 'entry' }, vat: { v: () => viewVAT(), p: 'tax' }, taxtools: { v: () => viewTaxTools(), p: 'tax' }, docs: { v: () => viewDocs(), p: 'docs' },
};
const NAV = [
  ['', [['home', '🏠', 'Dashboard']]],
  ['Entries', [['entry', '➕', 'New entry'], ['daybook', '📅', 'Day book'], ['bulk', '⚡', 'Bulk entry'], ['scan', '📷', 'Scan bills'], ['import', '📥', 'Upload Excel'], ['migrate', '🔁', 'Migrate client'], ['trash', '🗑️', 'Recycle bin']]],
  ['Masters', [['parties', '🤝', 'Customers & suppliers'], ['ledgers', '📒', 'Ledgers'], ['items', '📦', 'Items & stock'], ['legal', '🏛️', 'Legal details']]],
  ['Reports', [['tb', '⚖️', 'Trial balance'], ['pl', '📈', 'Profit & loss'], ['bs', '🧮', 'Balance sheet'], ['nfrs', '📑', 'NFRS statements'], ['cf', '💧', 'Cash flow'], ['ledger', '📄', 'Ledger statement'], ['stock', '🏷️', 'Stock summary'], ['aging', '⏳', 'Ageing'], ['ratios', '➗', 'Ratios'], ['projection', '🔮', 'Projection'], ['health', '✅', 'Health check'], ['brs', '🏦', 'Bank reconciliation']]],
  ['Tax', [['vat', '🧾', 'VAT, TDS & IRD'], ['depreciation', '🏗️', 'Depreciation (IRD)'], ['taxcomp', '🧮', 'Income tax computation']]],
  ['Office', [['docs', '🗂️', 'Documents'], ['updates', '📰', 'Nepal updates'], ['entities', '🏢', 'Entities / clients'], ['users', '👥', 'Users & access'], ['settings', '⚙️', 'Settings & backup']]],
  ['My firm (admin)', [['practice', '💼', 'Jobs, fees & collection'], ['admin', '🔑', 'Admin & subscriptions']]],
];

const App = {
  async boot() {
    try { await DB.open(); } catch (e) { $('#app').innerHTML = `<div class="auth card">Storage is blocked in this browser (${h(e.message)}). Turn off private mode or allow site data.</div>`; return; }
    await loadUsers(); S.entities = (await DB.get('kv', 'entities')) || []; S.settings = (await DB.get('kv', 'settings')) || {}; await loadLicense();
    if (!S.users.length) { $('#app').innerHTML = viewSetup(); return; }
    if (!S.user) { let id = null; try { id = sessionStorage.getItem('sml_user'); } catch (e) { } S.user = S.users.find(u => u.id === id && u.active) || null; }
    if (!S.user) { $('#app').innerHTML = viewLogin(); setTimeout(() => $('#li_email') && $('#li_email').focus(), 50); return; }
    if (!S.E) { let last = null; try { last = localStorage.getItem('sml_last_' + S.user.id); } catch (e) { } if (last && S.entities.find(e => e.id === last) && canEntity(last)) { const E = await DB.get('entities', last); if (E) { migrateEntity(E); S.E = E; } } }
    const fromHash = location.hash.slice(1); if (fromHash && ROUTES[fromHash]) S.route = fromHash;
    App.render();
    runDailyBackups(false);
  },
  go(route, params) { S.route = route; S.params = params || {}; closeModal(); try { history.replaceState(null, '', '#' + route); } catch (e) { } App.render(); window.scrollTo(0, 0); $('.side') && $('.side').classList.remove('open'); },
  setp(p) { Object.assign(S.params, p); App.render(); },
  async render() {
    if (!S.user) return App.boot(); invalidate();
    let r = ROUTES[S.route] || ROUTES.home; if (!r.noE && !S.E) { S.route = 'entities'; r = ROUTES.entities; }
    let body; try { body = r.p && !can(r.p) ? noAccess() : await r.v(); } catch (e) { console.error(e); body = `<div class="alert r">Something went wrong: ${h(e.message)}</div>`; }
    $('#app').innerHTML = App.layout(body); if (r.after) r.after(); localizeDOM($('#app'));
  },
  layout(body) {
    const lic = licenseState(); const E = S.E;
    const nav = NAV.map(([sec, items]) => (sec ? `<div class="sec">${sec}</div>` : '') + items.filter(([k]) => {
      if (k === 'practice' || k === 'admin') return S.user.role === 'admin'; if (k === 'users') return can('users'); if (['entities', 'settings', 'updates', 'home'].includes(k)) return true; const r = ROUTES[k]; if (!E) return false; return !r.p || can(r.p);
    }).map(([k, ico, t]) => `<a href="#${k}" class="${S.route === k ? 'on' : ''}" onclick="App.go('${k}');return false"><span>${ico}</span>${t}</a>`).join('')).join('');
    return `<div class="layout"><aside class="side"><div class="brand"><img src="icons/logo.svg" alt="" style="width:30px;height:30px;vertical-align:middle;margin-right:8px;border-radius:7px;box-shadow:0 0 0 1px rgba(255,255,255,.25)"><b>LekhaPal</b> <span style="font-size:.75rem;opacity:.8">v${APP.version}</span><div>Developed by CA Sudanshu Mallick</div></div><nav>${nav}</nav><div class="foot"><a href="GUIDE.html" target="_blank" style="color:#fff">📘 Help & guide</a><br>${h(lic.label)}<br>v${APP.version}</div></aside>
    <div class="main"><div class="top"><button class="btn sm menu-btn" onclick="$('.side').classList.toggle('open')">☰</button>
    <span class="ent">${E ? h(E.name) : 'No entity open'}</span>${E ? `<span class="pill">FY ${h(E.fy)}</span>` : ''}${E && E.isFirm ? '<span class="pill b">My firm</span>' : ''}<button class="btn sm" onclick="App.go('entities')">${E ? 'Switch' : 'Open entity'}</button>
    ${S.user.role === 'admin' && !(E && E.isFirm) ? `<button class="btn sm pri" onclick="goFirm()">🏢 My firm books</button>` : ''}${S.user.role === 'admin' ? `<button class="btn sm" onclick="App.go('admin')">🔑 Admin</button>` : ''}
    <span class="grow"></span><span class="small muted">${h(S.user.name)}</span><button class="btn sm" onclick="logout()">Log out</button></div>
    <div class="content">${!lic.active ? `<div class="alert r">${h(lic.label)}. You can view reports but not make entries. Enter a licence key in Settings.</div>` : !lic.licensed ? `<div class="alert y no-print">${h(lic.label)}. <a href="#" onclick="App.go('settings');return false">Activate licence</a></div>` : ''}${body}</div></div></div>`;
  },
};

async function viewHome() {
  const extra = (await backupBanner()) + (await draftsHTML());
  const E = S.E; const fy = E.fy || fyOf(todayAD()); const { from, to } = fyRange(fy); const t2 = to < todayAD() ? to : todayAD();
  const B = ledgerBalances(E, '', t2); const sumG = g => r2(sum(E.ledgers.filter(l => inGroup(l, g)), l => B[l.id].cl));
  const vs = vatSummary(E, from, t2); const pl = plData(E, from, t2); const mk = monthKeyBS(todayAD()); const mr = monthRange(mk); const vm = vatSummary(E, mr.from, mr.to);
  const tile = (lbl, val, route, cls) => `<button class="tile" onclick="App.go('${route}')"><div class="lbl">${lbl}</div><div class="big ${cls || ''}">${val}</div></button>`;
  const due = complianceDue(E).filter(d => !d.past).slice(0, 6); const neg = negativeItems(E); const sv = stockValuation(E, '9999-12-31'); const low = E.items.filter(i => num(i.reorder) && sv.items[i.id].q <= num(i.reorder));
  const recent = E.vouchers.slice().sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8).map(v => ({ date: v.date, no: v.no, type: VTYPES[v.type].t, amt: v.bill ? v.bill.total : sum(v.lines, x => x.dr), _click: `viewVoucher('${v.id}')`, _cls: 'click' + (v.cancelled ? ' cancel' : '') }));
  return `<h2>${h(E.name)}</h2><p class="muted">${h(E.type)} ${E.legal.pan ? '· PAN ' + h(E.legal.pan) : ''} · FY ${fy} · Today ${isINTL() ? todayAD() : toBS(todayAD()) + ' BS (' + BS_MONTHS[bsParts(todayAD()).m - 1] + ')'}${isINTL() ? ' · ' + h(CFG().country) + ' · ' + CFG().cur : ''}</p>
  ${can('entry') ? `<div class="btns"><button class="btn pri" onclick="newVoucher('SAL')">+ Sales</button><button class="btn pri" onclick="newVoucher('PUR')">+ Purchase</button><button class="btn" onclick="newVoucher('RCT')">+ Receipt</button><button class="btn" onclick="newVoucher('PAY')">+ Payment</button><button class="btn" onclick="newVoucher('JV')">+ Journal</button><button class="btn" onclick="App.go('scan')">📷 Scan bills</button></div>` : ''}
  ${extra}<div class="tiles">${tile('Sales this FY', fmt(vs.sTax + vs.sEx + vs.sExp), 'vat')}${tile('Purchases this FY', fmt(vs.pTax + vs.pEx + vs.iTax + vs.cTax), 'vat')}${tile(isNPO(E) ? 'Surplus this FY' : 'Net profit this FY', fmt(pl.pat), 'pl', pl.pat < 0 ? 'bad' : 'ok')}
  ${tile('Cash & bank', fmt(sumG('g_cash') + sumG('g_bank')), 'bs')}${tile('Receivables', fmt(sumG('g_debt')), 'aging')}${tile('Payables', fmt(-sumG('g_cred')), 'aging')}${tile('Stock value', fmt(stockValueAt(E, t2)), 'stock')}${tile('VAT this month (net)', fmt(vm.net), 'vat')}</div>
  ${neg.length ? `<div class="alert r">Negative stock: ${neg.slice(0, 8).map(h).join(', ')}</div>` : ''}${low.length ? `<div class="alert y">Re-order: ${low.slice(0, 8).map(i => h(i.name)).join(', ')}</div>` : ''}
  <div class="grid2"><div class="card"><h3>Upcoming due dates</h3>${table([{ k: 'd', t: 'Due (BS)' }, { k: 'w', t: 'What' }], due)}<p class="small muted">${isINTL() ? 'Based on your country settings – verify with the tax authority.' : 'Based on current rules – verify with IRD / OCR notices.'}</p></div>
  <div class="card"><h3>Recent entries</h3>${table([{ k: 'date', t: 'Date', f: dBS }, { k: 'no', t: 'No.' }, { k: 'type', t: 'Type' }, { k: 'amt', t: 'Amount', n: 1, f: v => fmt(v) }], recent, { empty: 'No entries yet – start with New entry or Upload Excel.' })}</div></div>`;
}

window.addEventListener('load', () => {
  App.boot();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._swReload) { window._swReload = 1; location.reload(); } });
  }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML && !$('#vf')) closeModal(); if (e.altKey && S.E && can('entry')) { const m = { s: 'SAL', p: 'PUR', r: 'RCT', y: 'PAY', j: 'JV' }[e.key.toLowerCase()]; if (m) { e.preventDefault(); newVoucher(m); } } });
