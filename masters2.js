/* Customers & suppliers, client stock list upload, recycle bin */
'use strict';

/* =================== CUSTOMERS & SUPPLIERS =================== */
function partyKind(l) { return inGroup(l, 'g_debt') ? 'Customer' : inGroup(l, 'g_cred') ? 'Supplier' : ''; }
function viewParties() {
  const E = S.E; const k = S.params.k || 'all'; const q = (S.params.q || '').toLowerCase(); const B = ledgerBalances(E, '', '9999-12-31');
  const last = {}; activeVouchers(E).forEach(v => (v.lines || []).forEach(x => { if (!last[x.l] || v.date > last[x.l]) last[x.l] = v.date; }));
  const list = E.ledgers.filter(l => isParty(l) && (k === 'all' || (k === 'c' ? inGroup(l, 'g_debt') : inGroup(l, 'g_cred'))) && (!q || (l.name + ' ' + (l.pan || '') + ' ' + (l.phone || '') + ' ' + (l.addr || '')).toLowerCase().includes(q))).sort(byName);
  const rows = list.map(l => ({ id: l.id, name: l.name, kind: partyKind(l), pan: l.pan || '', phone: l.phone || '', addr: l.addr || '', cdays: l.cdays || '', bal: B[l.id].cl, last: last[l.id] || '' }));
  const noPan = rows.filter(r => !r.pan).length;
  return `<h2>Customers & suppliers</h2><p class="muted">Your party master list. PAN entered here flows into invoices, VAT books, Annex 13 and TDS.</p>
  <div class="seg no-print">${[['all', 'All'], ['c', 'Customers'], ['s', 'Suppliers']].map(([x, t]) => `<button class="${k === x ? 'on' : ''}" onclick="App.setp({k:'${x}'})">${t}</button>`).join('')}</div>
  <div class="row no-print"><div><label>Search</label><input value="${h(S.params.q || '')}" placeholder="name, PAN, phone, address" onchange="App.setp({q:this.value})"></div></div>
  <div class="btns no-print">${can('masters') ? `<button class="btn pri" onclick="editLedger('', 'g_debt')">+ Customer</button><button class="btn pri" onclick="editLedger('', 'g_cred')">+ Supplier</button><button class="btn" onclick="startImport('parties')">Upload list (Excel)</button><button class="btn" onclick="downloadTemplate('parties')">Template</button><button class="btn" onclick="mergeParties()">Merge duplicates</button>` : ''}<button class="btn" onclick="exportTable('pt_t','Parties')">Export Excel</button></div>
  ${noPan ? `<div class="alert y">${noPan} part${noPan > 1 ? 'ies have' : 'y has'} no PAN.</div>` : ''}
  <div id="pt_t">${table([{ k: 'name', t: 'Name' }, { k: 'kind', t: 'Type' }, { k: 'pan', t: 'PAN' }, { k: 'phone', t: 'Phone' }, { k: 'addr', t: 'Address' }, { k: 'cdays', t: 'Credit days', n: 1 }, { k: 'bal', t: 'Balance', n: 1, f: v => fmtDC(v) }, { k: 'last', t: 'Last entry', f: dBS }, { k: 'id', t: '', f: v => `<span class="no-print"><button class="btn sm" onclick="event.stopPropagation();editLedger('${v}')">Edit</button> <button class="btn sm" onclick="event.stopPropagation();App.go('ledger',{l:'${v}'})">Statement</button></span>` }], rows.map(r => ({ ...r, _cls: 'click', _click: `editLedger('${r.id}')` })), { empty: 'No parties yet' })}</div>
  <p class="small muted">${rows.length} part${rows.length === 1 ? 'y' : 'ies'}</p>`;
}
function mergeParties() {
  modal('Merge duplicate parties', `<p class="small muted">All entries of the first party are moved to the second, opening balances are added, and the first party is removed. Use this when the same customer/supplier was created twice.</p>${ledgerDatalist()}
  <label>Merge this party (will be removed)</label><input id="mg_a" list="dl_party"><label>Into this party (will be kept)</label><input id="mg_b" list="dl_party"><div class="btns"><button class="btn pri" onclick="doMerge()">Merge</button></div>`);
}
async function doMerge() {
  const a = ledgerByName($('#mg_a').value), b = ledgerByName($('#mg_b').value); if (!a || !b || a.id === b.id) return toast('Choose two different existing ledgers', 1);
  if (a.sys) return toast('System ledgers cannot be merged', 1); if (!confirmBox(`Move all entries of "${a.name}" into "${b.name}" and delete "${a.name}"?`)) return;
  S.E.vouchers.forEach(v => { (v.lines || []).forEach(x => { if (x.l === a.id) x.l = b.id; }); if (v.bill) { if (v.bill.party === a.id) v.bill.party = b.id; (v.bill.rows || []).forEach(r => { if (r.k === 'l' && r.id === a.id) r.id = b.id; }); } });
  b.ob = r2(num(b.ob) + num(a.ob)); b.pan = b.pan || a.pan; b.addr = b.addr || a.addr; b.phone = b.phone || a.phone;
  S.E.ledgers = S.E.ledgers.filter(l => l.id !== a.id); audit('Merged ledgers', a.name + ' → ' + b.name); invalidate(); await saveE(); closeModal(); toast('Merged'); App.render();
}

/* =================== CLIENT STOCK LIST UPLOAD =================== */
function stockUpload() {
  modal('Upload client stock list', `<p>Upload the client's current stock list (Excel / CSV). Columns: <b>Item Name, Qty, Rate</b> and optionally Code, Unit, Category, HS Code, VAT %, Location. Items not yet in LekhaPal are created automatically.</p>
  <div class="seg"><button class="on" id="su_m1" onclick="this.classList.add('on');$('#su_m2').classList.remove('on');$('#su_dt').style.display='none'">Set as opening stock (new client)</button><button id="su_m2" onclick="this.classList.add('on');$('#su_m1').classList.remove('on');$('#su_dt').style.display=''">Physical count – adjust book stock</button></div>
  <div id="su_dt" style="display:none">${dateInput('su_date', todayAD(), 'Count date (BS)')}<p class="small muted">The difference between book stock on this date and the uploaded quantity is posted as a stock journal. Rate is used for extra quantity found.</p></div>
  <div class="btns"><button class="btn" onclick="downloadTemplate('stocklist')">Template</button><button class="btn pri" onclick="doStockUpload()">Choose file & preview</button></div>`);
}
async function doStockUpload() {
  const count = $('#su_m2').classList.contains('on'); const date = count ? readDate('su_date') : ''; if (count && !date) return toast('Enter count date', 1);
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); const E = S.E; const sv = count ? stockValuation(E, date) : null; const out = [], errs = [];
  rows.forEach((r, i) => { const name = String(rowGet(r, 'item name', 'item', 'name', 'product', 'particulars')).trim(); if (!name) return; const q = num(rowGet(r, 'qty', 'quantity', 'closing qty', 'stock')); const rate = num(rowGet(r, 'rate', 'cost', 'closing rate', 'unit cost')); const value = num(rowGet(r, 'value', 'amount', 'closing value')); if (!q && !value) { errs.push(`Row ${i + 2}: no quantity for ${name}`); return; }
    const it = itemByName(name); const gdn = rowGet(r, 'location', 'godown'); const gd = (E.godowns.find(g => nk(g.name) === nk(gdn)) || {}).id || (it && it.gd) || 'gd_main'; const book = count && it ? sv.items[it.id].q : 0;
    out.push({ name, it, q, rate: rate || (q ? r2(value / q) : 0), gd, book, diff: r2(q - book), code: rowGet(r, 'code', 'sku'), unit: rowGet(r, 'unit', 'uom') || 'Nos', cat: rowGet(r, 'category', 'group'), hs: rowGet(r, 'hs code', 'hs'), vat: rowGet(r, 'vat %', 'vat') }); });
  window._stk = { count, date, out };
  modal('Preview stock upload', `<p><b>${out.length}</b> item(s), total value ${fmt(sum(out, o => o.q * o.rate))}. ${errs.length ? `<span class="bad">${errs.length} row(s) skipped</span>` : ''}</p>${errs.length ? `<div class="alert y">${errs.slice(0, 30).map(h).join('<br>')}</div>` : ''}
  ${table([{ k: 'name', t: 'Item' }, { k: 'new', t: '', f: (v, r) => r.it ? '' : '<span class="pill b">new</span>' }, ...(count ? [{ k: 'book', t: 'Book qty', n: 1, f: fmtQ }] : []), { k: 'q', t: count ? 'Counted qty' : 'Opening qty', n: 1, f: fmtQ }, ...(count ? [{ k: 'diff', t: 'Difference', n: 1, f: v => `<span class="${v ? 'bad' : ''}">${fmtQ(v)}</span>` }] : []), { k: 'rate', t: 'Rate', n: 1, f: v => fmt(v) }], out, { maxh: '50vh' })}
  <div class="btns"><button class="btn pri" onclick="commitStockUpload()">${count ? 'Post adjustment' : 'Save opening stock'}</button></div>`, { wide: true });
}
async function commitStockUpload() {
  const { count, date, out } = window._stk; const E = S.E; if (!guardWrite()) return;
  out.forEach(o => { if (!o.it) { const pv = parseVat(o.vat); o.it = { id: uid('i'), name: o.name, code: o.code, unit: o.unit, cat: o.cat, hs: o.hs, vat: pv.tax, vr: pv.vr, oq: 0, orate: 0, gd: o.gd }; E.items.push(o.it); } });
  if (!count) { out.forEach(o => { o.it.oq = o.q; o.it.orate = o.rate; o.it.gd = o.gd; }); audit('Opening stock uploaded', out.length + ' items'); invalidate(); await saveE(); closeModal(); toast('Opening stock saved – check the trial balance for opening difference'); return App.render(); }
  const st = out.filter(o => Math.abs(o.diff) > 1e-6).map(o => ({ i: o.it.id, q: o.diff, rate: o.diff > 0 ? o.rate : '', gd: o.gd }));
  if (!st.length) { invalidate(); await saveE(); closeModal(); return toast('Book stock already matches the count'); }
  if (await saveVoucher({ type: 'STJ', date, stock: st, purpose: 'Stock adjustment (physical count)', narration: 'Stock count uploaded', lines: [] })) { closeModal(); toast(st.length + ' item(s) adjusted'); App.render(); }
}

/* =================== RECYCLE BIN (deleted entries) =================== */
function viewTrash() {
  const T = S.E.trash || [];
  return `<h2>Recycle bin</h2><p class="muted">Deleted entries are kept here so they can be restored.</p>${table([{ k: 'date', t: 'Date', f: dBS }, { k: 'no', t: 'No.' }, { k: 'type', t: 'Type', f: v => VTYPES[v].t }, { k: 'amt', t: 'Amount', n: 1, f: v => fmt(v) }, { k: 'delBy', t: 'Deleted by' }, { k: 'delAt', t: 'Deleted on', f: v => h((v || '').slice(0, 16).replace('T', ' ')) }, { k: 'id', t: '', f: v => can('entry') ? `<button class="btn sm" onclick="restoreVoucher('${v}')">Restore</button>` : '' }], T.map(v => ({ ...v, amt: sum(v.lines || [], x => x.dr) })))}`;
}
async function restoreVoucher(id) { const E = S.E; const v = E.trash.find(x => x.id === id); if (!v || !guardWrite()) return; if (!(await unlockIfNeeded(v.date))) return; E.trash = E.trash.filter(x => x.id !== id); delete v.delBy; delete v.delAt; E.vouchers.push(v); audit('Restored', v.no); invalidate(); await saveE(); toast('Restored ' + v.no); App.render(); }
