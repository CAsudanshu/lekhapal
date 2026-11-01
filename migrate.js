/* Migration of a new client from Tally / Busy / other software, previous-year figures, TB verification */
'use strict';
VTYPES.MIG = { t: 'Imported voucher', p: 'IM' };

function viewMigrate() {
  if (!can('import')) return noAccess(); const E = S.E; const M = E.migration = E.migration || {};
  const done = k => M[k] ? '<span class="pill g">done</span>' : '<span class="pill">to do</span>';
  const py = E.pyFig || { l: {} }; const ie = E.ledgers.filter(l => ['I', 'E'].includes(natureOf(l))).sort((a, b) => natureOf(a).localeCompare(natureOf(b)) || byName(a, b));
  const pfy = (() => { const s = fyOf(booksStart(E)); const y = fyStartYear(s) - 1; return y + '/' + String((y + 1) % 100).padStart(2, '0'); })();
  return `<h2>Migrate a client from other software</h2><p class="muted">Move a new client's books from Tally, Busy, Marg, Swastik, Excel or any other system in five steps. Nothing is overwritten without a preview.</p>
  <div class="card"><h3>Step 1 – Cut-over date ${done('cut')}</h3><p class="small muted">The date from which LekhaPal keeps the books. Opening balances are as at the start of this date (${isINTL() ? 'normally the first day of the financial year' : 'normally 1 Shrawan'}).</p>
  <div class="row">${dateInput('mg_bf', booksStart(E), 'Books begin on (BS)')}<div><label>Old software</label><select id="mg_sw">${['Tally (ERP 9 / Prime)', 'Busy', 'Marg', 'Swastik', 'Excel / manual', 'Other'].map(x => `<option ${M.sw === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="fit"><button class="btn pri" onclick="migCut()">Save</button></div></div></div>
  <div class="card"><h3>Step 2 – Masters & opening balances ${done('masters')}</h3>
  <p><b>From Tally:</b> In Tally go to <i>Gateway › Display › List of Accounts</i>, press <kbd>Alt+E</kbd> (Export), choose <b>XML</b> format, "Show all" ledgers & stock items, and export. Upload that file here – groups, ledgers with opening balances & PAN, and stock items with opening stock come across.</p>
  <div class="btns"><button class="btn pri" onclick="tallyImport('masters')">Upload Tally masters (XML)</button></div>
  <p><b>From any software / Excel:</b> export the opening trial balance, party list and closing stock list to Excel and use these:</p>
  <div class="btns"><button class="btn" onclick="startImport('ledgers')">Opening trial balance / ledgers</button><button class="btn" onclick="startImport('parties')">Customers & suppliers</button><button class="btn" onclick="stockUpload()">Closing stock list (as opening)</button><button class="btn" onclick="App.go('import')">All templates</button></div>
  <p class="small">Opening difference now: <b class="${Math.abs(openingDiff(E)) > 0.005 ? 'bad' : 'ok'}">${fmtDC(openingDiff(E))}</b> ${Math.abs(openingDiff(E)) > 0.005 ? '(must be zero – check stock and balances)' : '✓ opening trial balance tallies'}</p></div>
  <div class="card"><h3>Step 3 – Previous year figures for comparatives (FY ${pfy}) ${done('py')}</h3><p class="small muted">The previous year's balance sheet comes from the opening balances. Enter last year's income & expense figures (from the old software's P&L) so every statement shows comparatives in the first year. Positive = debit (expense), negative = credit (income) – or upload Excel with columns Ledger, Debit, Credit.</p>
  <div class="row"><div><label>Opening stock of FY ${pfy}</label><input id="py_os" value="${py.opStock ?? ''}"></div><div class="fit"><button class="btn" onclick="pyUpload()">Upload last year P&L (Excel)</button></div></div>
  <div class="tw" style="max-height:45vh"><table class="t ent"><thead><tr><th>Ledger</th><th>Nature</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${ie.map(l => { const v = num(py.l[l.id]); return `<tr><td>${h(l.name)}</td><td>${natureOf(l) === 'I' ? 'Income' : 'Expense'}</td><td><input class="pyd" data-id="${l.id}" value="${v > 0 ? v : ''}"></td><td><input class="pyc" data-id="${l.id}" value="${v < 0 ? -v : ''}"></td></tr>`; }).join('')}</tbody></table></div>
  <div class="btns"><button class="btn pri" onclick="pySave()">Save previous year figures</button>${E.pyFig ? `<button class="btn" onclick="App.go('pl',{fy:'${fyOf(booksStart(E))}'})">View P&L with comparatives</button>` : ''}</div></div>
  <div class="card"><h3>Step 4 – Transactions after cut-over (optional) ${done('vch')}</h3><p class="small muted">If the client already passed entries in the old software after the cut-over date, bring them across. From Tally: <i>Display › Day Book</i>, set the period (<kbd>Alt+F2</kbd>), <kbd>Alt+E</kbd> Export as XML. Accounting and stock effects are both imported; review VAT books afterwards because old-software invoices come in as imported vouchers.</p>
  <div class="btns"><button class="btn pri" onclick="tallyImport('vouchers')">Upload Tally day book (XML)</button><button class="btn" onclick="startImport('sales')">Sales (Excel)</button><button class="btn" onclick="startImport('purchase')">Purchases (Excel)</button><button class="btn" onclick="startImport('journal')">Journals / day book (Excel)</button></div></div>
  <div class="card"><h3>Step 5 – Verify against the old software ${done('verify')}</h3><p class="small muted">Export the old software's trial balance on any date to Excel (columns: Ledger, Debit, Credit – or Closing balance with Dr/Cr) and upload. LekhaPal compares every ledger and lists differences.</p>
  <div class="row">${dateInput('mg_vd', todayAD(), 'Trial balance date (BS)')}<div class="fit"><button class="btn pri" onclick="verifyTB()">Upload old trial balance & compare</button></div></div><div id="mg_vr"></div></div>`;
}
async function migCut() { const d = readDate('mg_bf'); if (!d) return toast('Enter a valid BS date', 1); S.E.settings.booksFrom = d; S.E.fy = fyOf(d); S.E.migration.sw = $('#mg_sw').value; S.E.migration.cut = true; invalidate(); await saveE(); toast('Cut-over date saved'); App.render(); }
async function pySave() { const E = S.E; const l = {}; $$('.pyd').forEach(i => { const c = $(`.pyc[data-id="${i.dataset.id}"]`); const v = r2(num(i.value) - num(c.value)); if (v) l[i.dataset.id] = v; }); E.pyFig = { l, opStock: $('#py_os').value === '' ? undefined : num($('#py_os').value) }; E.migration.py = true; invalidate(); await saveE(); toast('Previous year figures saved'); App.render(); }
async function pyUpload() {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); const E = S.E; E.pyFig = E.pyFig || { l: {} }; let n = 0; const miss = [];
  rows.forEach(r => { const name = rowGet(r, 'ledger', 'ledger name', 'particulars', 'account'); if (!name) return; if (/opening\s*stock/i.test(name)) { E.pyFig.opStock = num(rowGet(r, 'debit', 'dr', 'amount')); return; } const l = ledgerByName(name); const v = r2(num(rowGet(r, 'debit', 'dr')) - num(rowGet(r, 'credit', 'cr'))); if (!l) { miss.push(name); return; } if (!['I', 'E'].includes(natureOf(l))) return; E.pyFig.l[l.id] = v; n++; });
  E.migration.py = true; invalidate(); await saveE(); toast(n + ' figures loaded' + (miss.length ? ', ' + miss.length + ' ledger(s) not found: ' + miss.slice(0, 5).join(', ') : ''), miss.length > 0); App.render();
}

/* ---------- Tally XML ---------- */
async function readTextAny(file) { const buf = new Uint8Array(await file.arrayBuffer()); if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf); if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf); if (buf.length > 3 && buf[1] === 0 && buf[3] === 0) return new TextDecoder('utf-16le').decode(buf); return new TextDecoder('utf-8').decode(buf); }
function parseXML(text) {
  text = text.replace(/&#(\d+);/g, (m, n) => (+n < 32 && ![9, 10, 13].includes(+n)) ? '' : m).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const doc = new DOMParser().parseFromString(text, 'text/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('This is not a readable XML file'); return doc;
}
const kid = (el, tag) => { for (const c of el.children) if (c.tagName === tag) return c.textContent.trim(); return ''; };
const tName = el => el.getAttribute('NAME') || kid(el, 'NAME') || (el.querySelector('NAME\\.LIST > NAME') || {}).textContent || '';
const tNum = s => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
function tDate(s) { s = String(s || '').trim(); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; }
async function tallyImport(kind) {
  if (!guardWrite()) return; const f = await pickFile('.xml,.txt'); if (!f) return; let doc;
  try { doc = parseXML(await readTextAny(f)); } catch (e) { return toast(e.message, 1); }
  return kind === 'masters' ? tallyMasters(doc) : tallyVouchers(doc);
}
function tallyMasters(doc) {
  const E = S.E; const xg = {}; Array.from(doc.getElementsByTagName('GROUP')).forEach(g => { const n = tName(g); if (n) xg[n] = kid(g, 'PARENT'); });
  const ledgers = Array.from(doc.getElementsByTagName('LEDGER')).map(l => ({ name: tName(l), parent: kid(l, 'PARENT'), ob: -tNum(kid(l, 'OPENINGBALANCE')), pan: (kid(l, 'INCOMETAXNUMBER') || kid(l, 'VATTINNUMBER') || kid(l, 'PARTYGSTIN') || '').replace(/\D/g, '').slice(0, 9), addr: Array.from(l.getElementsByTagName('ADDRESS')).map(a => a.textContent.trim()).filter(Boolean).join(', '), phone: kid(l, 'LEDGERMOBILE') || kid(l, 'LEDGERPHONE') })).filter(x => x.name);
  const items = Array.from(doc.getElementsByTagName('STOCKITEM')).map(s => { const q = tNum(kid(s, 'OPENINGBALANCE')); const v = Math.abs(tNum(kid(s, 'OPENINGVALUE'))); return { name: tName(s), cat: kid(s, 'PARENT'), unit: kid(s, 'BASEUNITS') || 'Nos', oq: q, orate: q ? r2(v / q) : tNum(kid(s, 'OPENINGRATE')) }; }).filter(x => x.name);
  if (!ledgers.length && !items.length) return toast('No ledgers or stock items found in this file. Export "List of Accounts" in XML format.', 1);
  window._tm = { xg, ledgers, items };
  const unknown = ledgers.filter(l => !resolveGroupDry(l.parent, xg)).map(l => l.name);
  modal('Preview Tally masters', `<p><b>${ledgers.length}</b> ledgers · <b>${items.length}</b> stock items · ${Object.keys(xg).length} groups. Opening balance total: ${fmtDC(sum(ledgers, l => l.ob))} · opening stock ${fmt(sum(items, i => i.oq * i.orate))}</p>
  ${unknown.length ? `<div class="alert y">${unknown.length} ledger(s) are under groups that could not be matched and will go to Suspense: ${unknown.slice(0, 10).map(h).join(', ')}</div>` : ''}
  ${table([{ k: 'name', t: 'Ledger' }, { k: 'parent', t: 'Tally group' }, { k: 'pan', t: 'PAN' }, { k: 'ob', t: 'Opening', n: 1, f: v => fmtDC(v) }], ledgers.slice(0, 200), { maxh: '40vh' })}
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="tm_ob" checked> Use Tally opening balances (untick if you will upload a closing TB as at cut-over instead)</label>
  <div class="btns"><button class="btn pri" onclick="commitTallyMasters()">Import</button></div>`, { wide: true });
}
function resolveGroupDry(name, xg, depth = 0) { if (!name || depth > 20) return null; return findGroup(name) || (name === 'Primary' ? null : resolveGroupDry(xg[name], xg, depth + 1)); }
function resolveGroup(name, xg, depth = 0) {
  if (!name || name === 'Primary' || depth > 20) return null; const f = findGroup(name); if (f) return f;
  const p = resolveGroup(xg[name], xg, depth + 1); if (!p) return null; const pg = G(p); const g = { id: uid('g'), name, parent: p, nature: rootGroup(p).nature, fs: pg.fs }; S.E.groups.push(g); return g.id;
}
async function commitTallyMasters() {
  const { xg, ledgers, items } = window._tm; const E = S.E; const useOb = $('#tm_ob').checked; let nl = 0, ni = 0;
  const map = { 'Cash': 'l_cash', 'Profit & Loss A/c': null };
  ledgers.forEach(x => { if (x.name === 'Profit & Loss A/c') return; const g = resolveGroup(x.parent, xg) || 'g_susp'; let l = ledgerByName(x.name) || (map[x.name] && L(map[x.name]));
    if (!l) { l = { id: uid('l'), name: x.name, g, ob: 0 }; E.ledgers.push(l); } else if (!l.sys) l.g = g;
    if (useOb) l.ob = r2(x.ob); if (x.pan) l.pan = x.pan; if (x.addr) l.addr = x.addr; if (x.phone) l.phone = x.phone; nl++; });
  const pl = ledgers.find(x => x.name === 'Profit & Loss A/c'); if (pl && useOb && pl.ob) { const re = sysL('re'); re.ob = r2(num(re.ob) + pl.ob); }
  items.forEach(x => { let it = itemByName(x.name); if (!it) { it = { id: uid('i'), name: x.name, unit: x.unit, cat: x.cat, vat: true, gd: 'gd_main' }; E.items.push(it); } it.oq = x.oq; it.orate = x.orate; ni++; });
  E.migration.masters = true; audit('Tally masters imported', nl + ' ledgers, ' + ni + ' items'); invalidate(); await saveE(); closeModal(); toast(`${nl} ledgers and ${ni} items imported`); App.render();
}
function tallyVouchers(doc) {
  const E = S.E; const vs = []; const typeMap = { Payment: 'PAY', Receipt: 'RCT', Contra: 'CON', Journal: 'JV' }; const newL = new Set(), newI = new Set();
  Array.from(doc.getElementsByTagName('VOUCHER')).forEach(v => {
    if (/Yes/i.test(kid(v, 'ISCANCELLED')) || /Yes/i.test(kid(v, 'ISOPTIONAL'))) return;
    const vt = v.getAttribute('VCHTYPE') || kid(v, 'VOUCHERTYPENAME'); const date = tDate(kid(v, 'DATE')); if (!date) return;
    const lines = []; v.querySelectorAll('*').forEach(el => { if (!/^(ALL)?LEDGERENTRIES\.LIST$|^ACCOUNTINGALLOCATIONS\.LIST$/.test(el.tagName)) return; const n = kid(el, 'LEDGERNAME'); const a = tNum(kid(el, 'AMOUNT')); if (!n || !a) return; if (!ledgerByName(n)) newL.add(n); lines.push({ n, dr: a < 0 ? r2(-a) : 0, cr: a > 0 ? r2(a) : 0 }); });
    const stock = []; v.querySelectorAll('*').forEach(el => { const t = el.tagName; if (!/INVENTORYENTRIES(IN|OUT)?\.LIST$/.test(t)) return; const n = kid(el, 'STOCKITEMNAME'); if (!n) return; const q = Math.abs(tNum(kid(el, 'ACTUALQTY') || kid(el, 'BILLEDQTY'))); const a = Math.abs(tNum(kid(el, 'AMOUNT'))); const inward = /IN\.LIST$/.test(t) ? true : /OUT\.LIST$/.test(t) ? false : /Yes/i.test(kid(el, 'ISDEEMEDPOSITIVE')); if (!itemByName(n)) newI.add(n); if (q) stock.push({ n, q: inward ? q : -q, v: inward ? a : null }); });
    if (!lines.length && !stock.length) return; vs.push({ vt, type: typeMap[vt] || 'MIG', date, no: kid(v, 'VOUCHERNUMBER'), narr: kid(v, 'NARRATION'), lines, stock });
  });
  const bad = vs.filter(v => Math.abs(sum(v.lines, x => x.dr) - sum(v.lines, x => x.cr)) > 0.01);
  window._tv = { vs: vs.filter(v => !bad.includes(v)), newL: [...newL], newI: [...newI] };
  const before = vs.filter(v => v.date < booksStart(E)).length;
  modal('Preview Tally vouchers', `<p><b>${window._tv.vs.length}</b> voucher(s) from ${vs.length ? toBS(vs.reduce((a, v) => v.date < a ? v.date : a, vs[0].date)) : '-'} to ${vs.length ? toBS(vs.reduce((a, v) => v.date > a ? v.date : a, vs[0].date)) : '-'}. ${bad.length ? `<span class="bad">${bad.length} unbalanced skipped.</span>` : ''}</p>
  ${before ? `<div class="alert y">${before} voucher(s) are dated before the cut-over date ${toBS(booksStart(E))}; they will be skipped.</div>` : ''}${window._tv.newL.length ? `<div class="alert y">${window._tv.newL.length} ledger(s) not in LekhaPal will be created under Suspense: ${window._tv.newL.slice(0, 10).map(h).join(', ')}. Import masters first to avoid this.</div>` : ''}${window._tv.newI.length ? `<div class="alert b">${window._tv.newI.length} new stock item(s) will be created.</div>` : ''}
  ${table([{ k: 'date', t: 'Date', f: dBS }, { k: 'vt', t: 'Type' }, { k: 'no', t: 'No.' }, { k: 'a', t: 'Amount', n: 1, f: (x, r) => fmt(sum(r.lines, y => y.dr)) }, { k: 'narr', t: 'Narration' }], window._tv.vs.slice(0, 200), { maxh: '40vh' })}
  <div class="btns"><button class="btn pri" onclick="commitTallyVouchers()">Import vouchers</button></div>`, { wide: true });
}
async function commitTallyVouchers() {
  const E = S.E; const { vs, newL, newI } = window._tv; if (!guardWrite()) return; const start = booksStart(E);
  newL.forEach(n => { if (!ledgerByName(n)) E.ledgers.push({ id: uid('l'), name: n, g: 'g_susp', ob: 0 }); }); newI.forEach(n => { if (!itemByName(n)) E.items.push({ id: uid('i'), name: n, unit: 'Nos', vat: true, oq: 0, orate: 0, gd: 'gd_main' }); });
  let n = 0; vs.filter(v => v.date >= start).forEach(x => { const v = { id: uid('v'), type: x.type, mig: x.vt, date: x.date, no: (x.no ? x.no : nextNo(E, 'MIG', x.date)), narration: (x.vt ? '[' + x.vt + '] ' : '') + (x.narr || ''), lines: x.lines.map(y => ({ l: ledgerByName(y.n).id, dr: y.dr, cr: y.cr })), stock: x.stock.map(s => ({ i: itemByName(s.n).id, q: s.q, v: s.v, gd: 'gd_main' })), by: S.user.email, at: new Date().toISOString() }; E.vouchers.push(v); n++; });
  E.migration.vch = true; audit('Tally vouchers imported', n); invalidate(); await saveE(); closeModal(); toast(n + ' vouchers imported'); App.render();
}

/* ---------- verify against old trial balance ---------- */
async function verifyTB() {
  const date = readDate('mg_vd'); if (!date) return toast('Enter the TB date', 1); const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); const E = S.E;
  const rg = fyRange(fyOf(date)); const B = ledgerBalances(E, rg.from, date); const mine = {};
  E.ledgers.forEach(l => { const b = B[l.id]; const v = (b.nat === 'I' || b.nat === 'E') ? r2(b.dr - b.cr) : b.cl; mine[nk(l.name)] = { name: l.name, v }; });
  const old = {}; rows.forEach(r => { const n = rowGet(r, 'ledger', 'ledger name', 'particulars', 'account', 'name'); if (!n || /^total|grand total/i.test(n)) return; let v = r2(num(rowGet(r, 'debit', 'dr', 'closing debit')) - num(rowGet(r, 'credit', 'cr', 'closing credit'))); const cb = rowGet(r, 'closing balance', 'balance'); if (cb !== '') { v = num(cb); if (/cr/i.test(String(cb) + rowGet(r, 'dr/cr'))) v = -Math.abs(v); } old[nk(n)] = { name: n, v }; });
  const keys = Array.from(new Set([...Object.keys(mine), ...Object.keys(old)])); const out = keys.map(k => ({ name: (mine[k] || old[k]).name, a: mine[k] ? mine[k].v : 0, b: old[k] ? old[k].v : 0, st: !mine[k] ? 'Not in LekhaPal' : !old[k] ? 'Not in old TB' : '' })).map(r => ({ ...r, d: r2(r.a - r.b) })).filter(r => Math.abs(r.d) > 0.005).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const sv = stockValueAt(E, date); E.migration.verify = !out.length; await saveE();
  $('#mg_vr').innerHTML = out.length ? `<div class="alert y">${out.length} difference(s) found. Closing stock in LekhaPal on that date: ${fmt(sv)}.</div>${table([{ k: 'name', t: 'Ledger' }, { k: 'a', t: 'LekhaPal', n: 1, f: v => fmtDC(v) }, { k: 'b', t: 'Old software', n: 1, f: v => fmtDC(v) }, { k: 'd', t: 'Difference', n: 1, f: v => `<span class="bad">${fmt(v)}</span>` }, { k: 'st', t: 'Note' }], out)}<button class="btn" onclick="exportTable('mg_vr','TB_Verification')">Export</button>` : '<div class="alert g"><b>Perfect match.</b> Every ledger agrees with the old software.</div>';
}
