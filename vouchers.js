/* Entry screens: invoices, receipts, payments, journals, stock journal, bulk entry, masters */
'use strict';
let F = null; // current form state

async function viewEntry() {
  if (!can('entry')) return noAccess(); const dr = await draftsHTML();
  const t = (k, ico, d) => `<button class="tile" onclick="newVoucher('${k}')"><div class="ico">${ico}</div><div class="big">${VTYPES[k].t}</div><div class="lbl">${d}</div></button>`;
  return `<h2>New entry</h2><p class="muted">Pick the type. Ledgers, VAT, stock and all reports update automatically.</p>
  <div class="tiles">${t('SAL', '🧾', 'Sales invoice / tax invoice')}${t('PUR', '🛒', 'Purchase bill, expense bill, asset')}${t('RCT', '💰', 'Money received')}${t('PAY', '💸', 'Money paid (with TDS)')}${t('JV', '📒', 'Any adjustment Dr / Cr')}${t('CON', '🏦', 'Cash ↔ bank transfer')}${t('CN', '↩️', 'Goods returned by customer')}${t('DN', '↪️', 'Goods returned to supplier')}${t('STJ', '📦', 'Stock adjustment / transfer')}
  <button class="tile" onclick="App.go('bulk')"><div class="ico">⚡</div><div class="big">Bulk entry</div><div class="lbl">Many entries of same type</div></button>
  <button class="tile" onclick="App.go('scan')"><div class="ico">📷</div><div class="big">Scan bills</div><div class="lbl">Read bill photos automatically</div></button>
  <button class="tile" onclick="App.go('import')"><div class="ico">📥</div><div class="big">Upload Excel</div><div class="lbl">Bills, TB, ledgers, items</div></button></div>${dr}`;
}
function newVoucher(type, prefill) {
  if (!guardWrite()) return;
  F = { type, date: todayAD(), lines: [], bill: { rows: [], autoRound: false }, stock: [], narration: '' };
  if (VTYPES[type].bill) F.bill.party = '';
  if (prefill) Object.assign(F, clone(prefill));
  showVoucherForm();
}
function editVoucher(id) {
  const v = S.E.vouchers.find(x => x.id === id); if (!v) return;
  if (v.cancelled) return toast('Cancelled entries cannot be edited', 1);
  if (S.E.settings.billCompliance && v.type === 'SAL' && v.printCount) return toast('IRD billing rule: a printed invoice cannot be changed. Cancel it and issue a new one (or a credit note).', 1);
  F = clone(v); showVoucherForm();
}
function showVoucherForm() {
  const T = VTYPES[F.type]; const html = `${ledgerDatalist()}<div id="vf">${T.bill ? billFormHTML() : F.type === 'STJ' ? stjFormHTML() : simpleFormHTML()}</div>
  <label>Narration</label><textarea id="vf_narr" rows="2">${h(F.narration)}</textarea>
  <div class="btns"><button class="btn pri" onclick="submitVoucher()">Save</button><button class="btn" onclick="submitVoucher(true)">Save & new</button>${F.type === 'SAL' ? `<button class="btn" onclick="submitVoucher(false,true)">Save & print invoice</button>` : ''}</div>`;
  modal((F.id ? 'Edit ' : 'New ') + T.t + (F.no ? ' – ' + h(F.no) : ''), html, { wide: true, sticky: true });
  F._did = F._did || uid('dr'); const mb = $('#mbody'); if (mb) { const h2 = () => { clearTimeout(window._dt); window._dt = setTimeout(saveDraftNow, 800); }; mb.addEventListener('input', h2); mb.addEventListener('change', h2); }
  if (T.bill) { if (!F.bill.rows.length) addBillRow(); else billRecalc(); } else if (F.type === 'STJ') { if (!F.stock.length) addStjRow(); } else { const rows = F._rows || []; delete F._rows; rows.forEach(x => addLineRow(x)); if (!rows.length) { addLineRow(); if (F.type !== 'PAY' && F.type !== 'RCT') addLineRow(); } simpleRecalc(); }
}

/* ---------- Drafts: half-filled entries are saved automatically ---------- */
async function getDrafts() { return ((await DB.get('kv', 'drafts')) || []); }
async function saveDraftNow() {
  if (!$('#vf') || !F || !F._did || !S.E) return;
  const fields = {}; $$('#mbody input[id], #mbody select[id], #mbody textarea[id]').forEach(el => { if (el.closest('tbody')) return; fields[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  const tables = {}; ['bl_rows', 'vl_rows', 'sj_rows'].forEach(tb => { const t = $('#' + tb); if (!t) return; tables[tb] = $$('tr', t).map(tr => { const o = {}; $$('input,select', tr).forEach(el => { const c = el.classList[0]; if (c) o[c] = el.type === 'checkbox' ? el.checked : el.value; }); return o; }); });
  const filled = Object.values(tables).some(rows => rows.some(o => Object.entries(o).some(([k, v]) => v && !['rk', 'rt', 'rg', 'sg', 'ru'].includes(k) && v !== true))) || (fields.vf_party || '').trim() || (fields.vf_narr || '').trim();
  let ds = await getDrafts(); ds = ds.filter(d => d.did !== F._did);
  if (filled) { const party = fields.vf_party || fields.vf_cb || ''; ds.unshift({ did: F._did, eid: S.E.id, type: F.type, id: F.id || null, at: new Date().toISOString(), by: S.user.email, label: `${VTYPES[F.type].t}${F.no ? ' ' + F.no : ''}${party ? ' – ' + party : ''}`, fields, tables }); }
  await DB.put('kv', 'drafts', ds.slice(0, 50));
}
async function deleteDraft(did, quiet) { if (!did) return; const ds = (await getDrafts()).filter(d => d.did !== did); await DB.put('kv', 'drafts', ds); if (!quiet) App.render(); }
async function resumeDraft(did) {
  const d = (await getDrafts()).find(x => x.did === did); if (!d) return;
  const base = d.id ? S.E.vouchers.find(v => v.id === d.id) : null;
  F = base ? clone(base) : { type: d.type, date: todayAD(), lines: [], bill: { rows: [] }, stock: [], narration: '' }; F._did = d.did; F._rows = []; if (F.bill) F.bill.rows = []; F.stock = [];
  showVoucherForm();
  Object.entries(d.tables).forEach(([tb, rows]) => {
    const t = $('#' + tb); if (!t) return; t.innerHTML = '';
    rows.forEach(o => {
      if (tb === 'bl_rows') addBillRow({ k: o.rk || 'i', vr: o.rt }); else if (tb === 'vl_rows') addLineRow(); else addStjRow();
      const tr = t.lastElementChild; Object.entries(o).forEach(([c, v]) => { const el = $('.' + c, tr); if (!el) return; if (el.type === 'checkbox') el.checked = v; else { if (el.tagName === 'SELECT' && ![...el.options].some(x => x.value === v)) el.add(new Option(v + '%', v)); el.value = v; } });
      if (tb === 'bl_rows') rowKind($('.rk', tr));
    });
  });
  Object.entries(d.fields).forEach(([id, v]) => { const el = document.getElementById(id); if (!el) return; if (el.type === 'checkbox') el.checked = v; else el.value = v; if (el.oninput && id.startsWith('vf_date')) dateHint(el); });
  if ($('#bl_rows')) billRecalc(); if ($('#vl_rows')) simpleRecalc(); toast('Draft restored');
}
async function draftsHTML() {
  const ds = (await getDrafts()).filter(d => S.E && d.eid === S.E.id); if (!ds.length) return '';
  return `<div class="card"><h3>Unsaved drafts (${ds.length})</h3><p class="small muted">Entries you started but did not save are kept here automatically.</p>${table([{ k: 'label', t: 'Entry' }, { k: 'at', t: 'Last edited', f: v => h(v.slice(0, 16).replace('T', ' ')) }, { k: 'by', t: 'By' }, { k: 'did', t: '', f: v => `<button class="btn sm pri" onclick="resumeDraft('${v}')">Continue</button> <button class="btn sm red" onclick="deleteDraft('${v}')">Discard</button>` }], ds)}</div>`;
}

/* ---------- Bill form (Sales / Purchase / CN / DN) ---------- */
function billFormHTML() {
  const b = F.bill, t = F.type, isS = t === 'SAL' || t === 'CN'; const pl = L(b.party);
  return `<div class="row">${dateInput('vf_date', F.date)}
  <div><label>${isS ? 'Customer' : 'Supplier'} (or Cash / Bank)</label><input id="vf_party" list="dl_party" value="${h(pl ? pl.name : '')}" onchange="partyChanged()" placeholder="Type name – new parties are created automatically"></div>
  <div><label>${isS ? 'Buyer' : 'Supplier'} PAN</label><input id="vf_pan" value="${h(b.pan || (pl && pl.pan) || '')}" maxlength="9"></div></div>
  <div class="row"><div><label>${isS ? 'Buyer' : 'Supplier'} name on bill</label><input id="vf_pname" value="${h(b.partyName || '')}" placeholder="for cash sales / purchases"></div><div><label>Address</label><input id="vf_addr" value="${h(b.addr || (pl && pl.addr) || '')}"></div>
  ${t === 'SAL' ? `<div><label>Invoice no.</label><input id="vf_no" value="${h(F.no || '(auto)')}" disabled></div>` : `<div><label>${t === 'CN' ? 'Credit note no.' : 'Supplier bill / DN no.'}</label><input id="vf_billno" value="${h(b.billNo || '')}"></div>`}
  ${t === 'PUR' ? `<div><label>Bill date (BS)</label><input id="vf_bdate" value="${h(b.billDate ? toBS(b.billDate) : '')}" placeholder="same as entry date"></div>` : ''}
  ${t === 'CN' || t === 'DN' ? `<div><label>Original invoice no.</label><input id="vf_ref" value="${h(b.ref || '')}"></div><div><label>Reason</label><input id="vf_reason" value="${h(b.reason || '')}"></div>` : ''}
  <div><label>Payment mode</label><select id="vf_pay">${['Credit', 'Cash', 'Cheque', 'Bank transfer', 'QR / wallet', 'Card'].map(x => `<option ${b.payMode === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
  ${t === 'SAL' ? `<div class="row"><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_export" ${b.export ? 'checked' : ''} onchange="if(this.checked){$$('#bl_rows tr').forEach(tr=>setRowVat(tr,0));billRecalc()}"> Export sale (zero-rated)</label></div>` : ''}
  ${t === 'PUR' ? `<div class="row"><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_import" ${b.import ? 'checked' : ''}> Import (VAT paid at customs)</label><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_capital" ${b.capital ? 'checked' : ''}> Capital purchase (fixed asset)</label><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_capz" ${b.capitalise ? 'checked' : ''} onchange="billRecalc()"> Add ledger lines (freight, customs…) to stock cost</label></div>` : ''}
  <h3 style="margin-top:12px">Lines</h3><div class="tw"><table class="t ent"><thead><tr><th>Type</th><th style="min-width:180px">Item / Ledger</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Discount</th><th class="n">Amount</th><th>VAT</th><th>Location</th><th></th></tr></thead><tbody id="bl_rows"></tbody></table></div>
  <button class="btn sm" onclick="addBillRow()">+ Add line</button>
  <div class="grid2" style="margin-top:10px"><div>
   <div class="row"><div><label>TDS %</label><input id="vf_tdsr" value="${h(b.tdsRate || '')}" oninput="billRecalc()" placeholder="${t === 'PUR' ? 'e.g. 1.5 / 10 / 15' : 'if customer deducts'}"></div><div><label>Excise duty</label><input id="vf_excise" value="${h(b.excise || '')}" oninput="billRecalc()"></div></div>
   <div class="row"><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_vatman" ${b.vatManual ? 'checked' : ''} onchange="billRecalc()"> Edit VAT manually</label><label class="fit" style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="vf_round" ${b.autoRound ? 'checked' : ''} onchange="billRecalc()"> Round off total</label></div>
  </div><div class="card" id="bl_tot"></div></div>`;
}
function godownOpts(sel) { return S.E.godowns.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${h(g.name)}</option>`).join(''); }
function addBillRow(r) {
  r = r || { k: 'i', tax: !!S.E.legal.vatReg }; const tr = document.createElement('tr');
  const nm = r.k === 'i' ? (I(r.id) || {}).name : (L(r.id) || {}).name;
  tr.innerHTML = `<td><select class="rk" onchange="rowKind(this)"><option value="i" ${r.k === 'i' ? 'selected' : ''}>Item</option><option value="l" ${r.k === 'l' ? 'selected' : ''}>Ledger</option></select></td>
  <td><input class="rn" list="${r.k === 'i' ? 'dl_item' : 'dl_led'}" value="${h(nm || r.name || '')}" onchange="rowPicked(this)"><input class="rdesc small" placeholder="description (optional)" value="${h(r.desc || '')}" style="margin-top:3px"></td>
  <td><input class="rq" value="${h(r.qty ?? '')}" oninput="billRecalc()" style="width:80px"></td><td><input class="ru" value="${h(r.unit || '')}" style="width:60px"></td>
  <td><input class="rr" value="${h(r.rate ?? '')}" oninput="billRecalc()" style="width:90px"></td><td><input class="rd" value="${h(r.disc || '')}" oninput="billRecalc()" style="width:80px"></td>
  <td><input class="ra n" value="${h(r.amt ?? '')}" oninput="this.dataset.man=1;billRecalc()" style="width:110px"></td>
  <td>${vatSelect(r.vr !== undefined && r.vr !== '' ? num(r.vr) : (r.tax ? defVat() : 0))}</td><td><select class="rg">${godownOpts(r.gd)}</select></td>
  <td><button class="btn sm red" onclick="this.closest('tr').remove();billRecalc()">×</button></td>`;
  $('#bl_rows').appendChild(tr); billRecalc();
}
/* VAT rate picker for a bill line: 13% by default, Exempt, or any other rate */
function vatSelect(v) {
  const d = defVat(); const opts = Array.from(new Set([d, 0, ...(S.E.settings.vatRates || []), num(v)])).filter(x => !isNaN(x));
  return `<select class="rt" onchange="vatChanged(this)" style="width:95px">${opts.map(x => `<option value="${x}" ${num(v) === x ? 'selected' : ''}>${x ? x + '%' : 'Exempt'}</option>`).join('')}<option value="other">Other %…</option></select>`;
}
function vatChanged(sel) {
  if (sel.value === 'other') { const x = prompt('VAT rate % for this line (e.g. 13, 5, 0):', ''); if (x === null || isNaN(parseFloat(x))) { sel.value = String(defVat()); } else { const n = num(x); if (![...sel.options].some(o => o.value === String(n))) sel.add(new Option(n ? n + '%' : 'Exempt', String(n)), sel.options.length - 1); sel.value = String(n); S.E.settings.vatRates = Array.from(new Set([...(S.E.settings.vatRates || []), n])); } }
  billRecalc();
}
function setRowVat(tr, n) { const sel = $('.rt', tr); if (![...sel.options].some(o => o.value === String(n))) sel.add(new Option(n ? n + '%' : 'Exempt', String(n)), sel.options.length - 1); sel.value = String(n); }
function rowKind(sel) { const tr = sel.closest('tr'); $('.rn', tr).setAttribute('list', sel.value === 'i' ? 'dl_item' : 'dl_led'); }
function rowPicked(inp) {
  const tr = inp.closest('tr'); if ($('.rk', tr).value !== 'i') return; const it = itemByName(inp.value); if (!it) return;
  $('.ru', tr).value = it.unit || ''; setRowVat(tr, !S.E.legal.vatReg ? 0 : (it.vr !== undefined && it.vr !== '' ? num(it.vr) : (it.vat !== false ? defVat() : 0)));
  if (!$('.rr', tr).value) $('.rr', tr).value = (F.type === 'SAL' || F.type === 'CN') ? (it.srate || '') : (it.prate || ''); if (it.gd) $('.rg', tr).value = it.gd; billRecalc();
}
function partyChanged() { const l = ledgerByName($('#vf_party').value); if (l) { if (l.pan) $('#vf_pan').value = l.pan; if (l.addr) $('#vf_addr').value = l.addr; if (isCashBank(l)) $('#vf_pay').value = inGroup(l, 'g_cash') ? 'Cash' : 'Bank transfer'; } }
function readBillRows() {
  return $$('#bl_rows tr').map(tr => {
    const k = $('.rk', tr).value, name = $('.rn', tr).value.trim(); const q = $('.rq', tr).value, rate = $('.rr', tr).value;
    const r = { k, name, desc: $('.rdesc', tr).value.trim(), qty: q === '' ? '' : num(q), unit: $('.ru', tr).value.trim(), rate: rate === '' ? '' : num(rate), disc: num($('.rd', tr).value), vr: num($('.rt', tr).value), tax: num($('.rt', tr).value) > 0, gd: $('.rg', tr).value };
    if (k === 'i' || (num(q) && num(rate))) { r.amt = r2(num(q) * num(rate) - r.disc); $('.ra', tr).value = name || q ? r.amt.toFixed(2) : ''; } else r.amt = r2(num($('.ra', tr).value));
    return r;
  }).filter(r => r.name || r.amt);
}
function billRecalc() {
  if (!$('#bl_rows')) return; const rows = readBillRows();
  const b = { rows: clone(rows), vatManual: $('#vf_vatman').checked, vat: num(F.bill.vat), excise: num($('#vf_excise').value), autoRound: $('#vf_round').checked, tdsRate: num($('#vf_tdsr').value), capitalise: $('#vf_capz') && $('#vf_capz').checked };
  if (b.vatManual && $('#bl_vat')) b.vat = num($('#bl_vat').value);
  billTotals(b, S.E); F.bill.vat = b.vat;
  $('#bl_tot').innerHTML = `<div class="kv"><div>Taxable amount</div><div class="right">${fmt(b.taxable)}</div><div>Non-taxable / exempt</div><div class="right">${fmt(b.exempt)}</div>
  <div>VAT ${Object.keys(vatByRate(b, S.E)).map(x => x + '%').join(' + ') || defVat() + '%'}</div><div class="right">${b.vatManual ? `<input id="bl_vat" class="right" value="${b.vat}" onchange="billRecalc()" style="width:120px">` : fmt(b.vat)}</div>
  ${b.excise ? `<div>Excise</div><div class="right">${fmt(b.excise)}</div>` : ''}${b.round ? `<div>Round off</div><div class="right">${fmt(b.round)}</div>` : ''}
  <div><b>Total</b></div><div class="right"><b>${fmt(b.total)}</b></div>${b.tds ? `<div>Less TDS ${b.tdsRate}%</div><div class="right">${fmt(b.tds)}</div><div><b>Net ${F.type === 'PUR' ? 'payable' : 'receivable'}</b></div><div class="right"><b>${fmt(b.total - b.tds)}</b></div>` : ''}</div>
  <div class="small muted" style="margin-top:6px">${inWords(b.total)}</div>`;
}
async function collectBill() {
  const t = F.type, isS = t === 'SAL' || t === 'CN'; const E = S.E;
  const date = readDate('vf_date'); if (!date) { toast('Enter a valid BS date', 1); return null; }
  const pname = $('#vf_party').value.trim(); if (!pname) { toast('Enter party name or Cash', 1); return null; }
  let party = ledgerByName(pname);
  if (!party) { if (!confirmBox(`Create new ${isS ? 'customer' : 'supplier'} "${pname}"?`)) return null; party = { id: uid('l'), name: pname, g: isS ? 'g_debt' : 'g_cred', ob: 0, pan: $('#vf_pan').value.trim(), addr: $('#vf_addr').value.trim() }; E.ledgers.push(party); }
  else if (!party.pan && $('#vf_pan').value.trim() && isParty(party)) party.pan = $('#vf_pan').value.trim();
  const rows = readBillRows(); const out = [];
  for (const r of rows) {
    if (r.k === 'i') {
      let it = itemByName(r.name);
      if (!it) { if (!confirmBox(`Create new item "${r.name}"?`)) return null; it = { id: uid('i'), name: r.name, unit: r.unit || 'Nos', vat: r.tax, vr: r.vr, oq: 0, orate: 0, gd: r.gd }; if (isS) it.srate = r.rate; else it.prate = r.rate; E.items.push(it); }
      if (!isS && r.rate) it.prate = r.rate; if (isS && r.rate && !it.srate) it.srate = r.rate;
      out.push({ k: 'i', id: it.id, desc: r.desc, qty: r.qty, unit: r.unit || it.unit, rate: r.rate, disc: r.disc, amt: r.amt, tax: r.tax, vr: r.vr, gd: r.gd });
    } else {
      let l = ledgerByName(r.name);
      if (!l) { const grp = isS ? 'g_iinc' : 'g_iexp'; if (!confirmBox(`Create new ledger "${r.name}" under ${G(grp).name}? (You can change the group later in Ledgers)`)) return null; l = { id: uid('l'), name: r.name, g: grp, ob: 0 }; E.ledgers.push(l); }
      out.push({ k: 'l', id: l.id, desc: r.desc, qty: r.qty, unit: r.unit, rate: r.rate, disc: r.disc, amt: r.amt, tax: r.tax, vr: r.vr });
    }
  }
  const b = Object.assign(F.bill, {
    party: party.id, pan: $('#vf_pan').value.trim(), partyName: $('#vf_pname').value.trim(), addr: $('#vf_addr').value.trim(), payMode: $('#vf_pay').value, rows: out,
    vatManual: $('#vf_vatman').checked, excise: num($('#vf_excise').value), autoRound: $('#vf_round').checked, tdsRate: num($('#vf_tdsr').value),
  });
  if (b.vatManual && $('#bl_vat')) b.vat = num($('#bl_vat').value);
  if ($('#vf_billno')) b.billNo = $('#vf_billno').value.trim(); if ($('#vf_bdate')) b.billDate = toAD($('#vf_bdate').value) || date;
  if ($('#vf_export')) { b.export = $('#vf_export').checked; if (b.export) b.rows.forEach(r => { r.tax = false; r.vr = 0; }); }
  if ($('#vf_ref')) { b.ref = $('#vf_ref').value.trim(); b.reason = $('#vf_reason').value.trim(); }
  if (t === 'PUR') { b.import = $('#vf_import').checked; b.capital = $('#vf_capital').checked || out.some(r => r.k === 'l' && inGroup(L(r.id), 'g_fa')); b.capitalise = $('#vf_capz').checked; }
  if (t === 'PUR' && b.billNo && E.vouchers.some(v => v.id !== F.id && v.type === 'PUR' && !v.cancelled && v.bill && v.bill.billNo === b.billNo && v.bill.party === party.id)) { if (!confirmBox('A purchase with the same supplier and bill number already exists. Save anyway?')) return null; }
  F.date = date; return F;
}

/* ---------- Simple vouchers (Receipt, Payment, Contra, Journal) ---------- */
function simpleFormHTML() {
  const t = F.type; const head = t === 'PAY' || t === 'RCT';
  let headL = '', rows = F.lines || [];
  if (head && rows.length) { const cb = rows.find(x => isCashBank(L(x.l)) && (t === 'PAY' ? x.cr : x.dr)); if (cb) { headL = L(cb.l).name; rows = rows.filter(x => x !== cb); } }
  if (t === 'PAY' && rows.some(y => y.tdsRate)) { const tp = sysL('tdsPay'); rows = rows.filter(x => !(tp && x.l === tp.id && x.cr)); }
  F._rows = rows;
  return `<div class="row">${dateInput('vf_date', F.date)}${head ? `<div><label>${t === 'PAY' ? 'Paid from' : 'Received in'} (cash / bank)</label><input id="vf_cb" list="dl_cb" value="${h(headL || 'Cash')}"><datalist id="dl_cb">${ledgerOptions(isCashBank)}</datalist></div>` : ''}<div><label>Reference / cheque no.</label><input id="vf_refno" value="${h(F.refNo || '')}"></div></div>
  <h3 style="margin-top:12px">${head ? (t === 'PAY' ? 'Paid to / for' : 'Received from') : 'Ledgers (Dr / Cr)'}</h3>
  <div class="tw"><table class="t ent"><thead><tr><th style="min-width:200px">Ledger</th>${head ? `<th class="n">Amount</th>${t === 'PAY' ? '<th>TDS %</th>' : ''}` : '<th class="n">Debit</th><th class="n">Credit</th>'}<th>Note</th><th></th></tr></thead><tbody id="vl_rows"></tbody></table></div>
  <button class="btn sm" onclick="addLineRow()">+ Add line</button><div class="totbar" id="vl_tot"></div>`;
}
function addLineRow(x) {
  x = x || {}; const t = F.type, head = t === 'PAY' || t === 'RCT'; const tr = document.createElement('tr'); const l = L(x.l);
  const amt = head ? (t === 'PAY' ? num(x.dr) - num(x.cr) : num(x.cr) - num(x.dr)) : 0;
  tr.innerHTML = `<td><input class="ln" list="dl_led" value="${h(l ? l.name : '')}"></td>${head ? `<td><input class="la n" value="${amt || ''}" oninput="simpleRecalc()"></td>${t === 'PAY' ? `<td><input class="lt" value="${h(x.tdsRate || '')}" style="width:70px" oninput="simpleRecalc()"></td>` : ''}` : `<td><input class="ld n" value="${x.dr || ''}" oninput="simpleRecalc()"></td><td><input class="lc n" value="${x.cr || ''}" oninput="simpleRecalc()"></td>`}<td><input class="lnote" value="${h(x.note || '')}"></td><td><button class="btn sm red" onclick="this.closest('tr').remove();simpleRecalc()">×</button></td>`;
  $('#vl_rows').appendChild(tr);
}
function simpleRecalc() {
  const t = F.type; if (!$('#vl_tot')) return;
  if (t === 'PAY' || t === 'RCT') { const tot = sum($$('#vl_rows .la'), i => i.value); const tds = t === 'PAY' ? sum($$('#vl_rows tr'), tr => r2(num($('.la', tr).value) * num(($('.lt', tr) || {}).value) / 100)) : 0; $('#vl_tot').innerHTML = `Total: ${fmt(tot)}${tds ? ` · TDS: ${fmt(tds)} · Net ${t === 'PAY' ? 'paid' : 'received'}: ${fmt(tot - tds)}` : ''}`; }
  else { const d = sum($$('#vl_rows .ld'), i => i.value), c = sum($$('#vl_rows .lc'), i => i.value); $('#vl_tot').innerHTML = `Debit: ${fmt(d)} · Credit: ${fmt(c)} ${Math.abs(d - c) > 0.005 ? `<span class="bad">· Difference: ${fmt(d - c)}</span>` : '<span class="ok">✓ balanced</span>'}`; }
}
async function collectSimple() {
  const t = F.type, E = S.E; const date = readDate('vf_date'); if (!date) { toast('Enter a valid BS date', 1); return null; }
  const lines = []; const tdsL = sysL('tdsPay');
  const getL = name => { const l = ledgerByName(name); if (!l) toast(`Ledger "${name}" not found. Create it in Ledgers first.`, 1); return l; };
  if (t === 'PAY' || t === 'RCT') {
    const cb = getL($('#vf_cb').value); if (!cb) return null; let tot = 0, tdsTot = 0;
    for (const tr of $$('#vl_rows tr')) {
      const n = $('.ln', tr).value.trim(); const a = r2($('.la', tr).value); if (!n && !a) continue; const l = getL(n); if (!l) return null;
      const tr_ = num(($('.lt', tr) || {}).value); const tds = r2(a * tr_ / 100);
      lines.push(t === 'PAY' ? { l: l.id, dr: a, cr: 0, note: $('.lnote', tr).value, tdsRate: tr_ || undefined } : { l: l.id, dr: 0, cr: a, note: $('.lnote', tr).value });
      tot += a; tdsTot += tds;
    }
    if (tdsTot && !tdsL) { toast('TDS Payable ledger missing', 1); return null; }
    if (t === 'PAY') { if (tdsTot) lines.push({ l: tdsL.id, dr: 0, cr: r2(tdsTot) }); lines.push({ l: cb.id, dr: 0, cr: r2(tot - tdsTot) }); }
    else lines.push({ l: cb.id, dr: r2(tot), cr: 0 });
  } else {
    for (const tr of $$('#vl_rows tr')) { const n = $('.ln', tr).value.trim(); const d = r2($('.ld', tr).value), c = r2($('.lc', tr).value); if (!n && !d && !c) continue; const l = getL(n); if (!l) return null; lines.push({ l: l.id, dr: d, cr: c, note: $('.lnote', tr).value }); }
  }
  F.lines = lines; F.date = date; F.refNo = $('#vf_refno').value.trim(); return F;
}

/* ---------- Stock journal ---------- */
function stjFormHTML() {
  setTimeout(() => (F.stock || []).forEach(s => addStjRow(s)), 0);
  return `<div class="row">${dateInput('vf_date', F.date)}<div><label>Purpose</label><select id="vf_purpose">${['Stock adjustment (physical count)', 'Damage / expiry / loss', 'Own consumption / samples', 'Transfer between locations', 'Production / assembly'].map(x => `<option ${F.purpose === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
  <p class="small muted">Positive quantity = stock in, negative = stock out. For transfers add one negative line (from) and one positive line (to). Rate is needed only for stock coming in; leave blank to use current average cost.</p>
  <div class="tw"><table class="t ent"><thead><tr><th style="min-width:200px">Item</th><th>Qty (+in / −out)</th><th>Rate (for in)</th><th>Location</th><th></th></tr></thead><tbody id="sj_rows"></tbody></table></div><button class="btn sm" onclick="addStjRow()">+ Add line</button>
  <p class="small muted">Stock journal changes quantities and closing-stock value only. If you also need an accounting entry (e.g. loss written off), pass a Journal.</p>`;
}
function addStjRow(s) { s = s || {}; const tr = document.createElement('tr'); tr.innerHTML = `<td><input class="sn" list="dl_item" value="${h((I(s.i) || {}).name || '')}"></td><td><input class="sq" value="${h(s.q ?? '')}"></td><td><input class="sr" value="${h(s.rate ?? '')}"></td><td><select class="sg">${godownOpts(s.gd)}</select></td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td>`; $('#sj_rows').appendChild(tr); }
function collectStj() {
  const date = readDate('vf_date'); if (!date) { toast('Enter a valid BS date', 1); return null; }
  const st = []; for (const tr of $$('#sj_rows tr')) { const n = $('.sn', tr).value.trim(); if (!n) continue; const it = itemByName(n); if (!it) { toast('Item not found: ' + n, 1); return null; } st.push({ i: it.id, q: num($('.sq', tr).value), rate: $('.sr', tr).value === '' ? '' : num($('.sr', tr).value), gd: $('.sg', tr).value }); }
  F.stock = st; F.date = date; F.purpose = $('#vf_purpose').value; F.lines = []; return F;
}
async function submitVoucher(again, print) {
  let v; if (VTYPES[F.type].bill) v = await collectBill(); else if (F.type === 'STJ') v = collectStj(); else v = await collectSimple(); if (!v) return;
  v.narration = $('#vf_narr').value.trim(); const type = v.type; const did = v._did; delete v._did;
  const ok = await saveVoucher(v); if (!ok) { v._did = did; return; }
  await deleteDraft(did, true);
  toast(`${VTYPES[type].t} ${v.no} saved`); closeModal();
  if ((type === 'SAL' || type === 'CN') && S.E.settings.cbmsLive && navigator.onLine) cbmsSync([v.id], true);
  if (print) printInvoice(v.id); else if (again) newVoucher(type); else App.render();
}

/* ---------- Voucher view ---------- */
function viewVoucher(id) {
  const v = S.E.vouchers.find(x => x.id === id); if (!v) return; const b = v.bill;
  const lines = (v.lines || []).map(x => ({ n: (L(x.l) || {}).name, dr: x.dr, cr: x.cr, note: x.note }));
  let html = `<div class="kv"><div>Type</div><div>${VTYPES[v.type].t} ${v.cancelled ? '<span class="pill r">CANCELLED</span> ' + h(v.cancelReason) : ''}</div><div>Number</div><div>${h(v.no)}</div><div>Date</div><div>${dBoth(v.date)}</div>
  ${b ? `<div>Party</div><div>${h((L(b.party) || {}).name)} ${b.partyName ? '/ ' + h(b.partyName) : ''} ${b.pan ? '· PAN ' + h(b.pan) : ''}</div>${b.billNo ? `<div>Bill no.</div><div>${h(b.billNo)}</div>` : ''}${b.ref ? `<div>Against invoice</div><div>${h(b.ref)}</div>` : ''}` : ''}
  ${v.refNo ? `<div>Reference</div><div>${h(v.refNo)}</div>` : ''}<div>Narration</div><div>${h(v.narration)}</div><div>Entered by</div><div>${h(v.by)} ${h((v.at || '').slice(0, 16))}${v.mby ? ' · edited by ' + h(v.mby) : ''}</div>
  ${v.printCount ? `<div>Printed</div><div>${v.printCount} time(s)</div>` : ''}${v.cbms ? `<div>CBMS</div><div>${v.cbms.ok ? '<span class="pill g">Synced</span>' : '<span class="pill r">Failed</span>'} ${h(v.cbms.msg || '')}</div>` : ''}</div>`;
  if (b) html += `<h3>Lines</h3>` + table([{ k: 'n', t: 'Item / Ledger' }, { k: 'qty', t: 'Qty', n: 1 }, { k: 'rate', t: 'Rate', n: 1 }, { k: 'amt', t: 'Amount', n: 1, f: v => fmt(v) }, { k: 'tax', t: 'VAT', f: v => v ? '✓' : '' }], b.rows.map(r => ({ ...r, n: r.k === 'i' ? (I(r.id) || {}).name : (L(r.id) || {}).name }))) + `<div class="totbar">Taxable ${fmt(b.taxable)} · Exempt ${fmt(b.exempt)} · VAT ${fmt(b.vat)} · Total ${fmt(b.total)}${b.tds ? ' · TDS ' + fmt(b.tds) : ''}</div>`;
  if (v.type === 'STJ') html += table([{ k: 'n', t: 'Item' }, { k: 'q', t: 'Qty', n: 1 }, { k: 'rate', t: 'Rate', n: 1 }], v.stock.map(s => ({ ...s, n: (I(s.i) || {}).name })));
  else html += `<h3>Accounting entry</h3>` + table([{ k: 'n', t: 'Ledger' }, { k: 'dr', t: 'Debit', n: 1, f: v => fmt(v, 1) }, { k: 'cr', t: 'Credit', n: 1, f: v => fmt(v, 1) }, { k: 'note', t: 'Note' }], lines);
  html += `<div class="btns">${v.type === 'SAL' || v.type === 'CN' ? `<button class="btn pri" onclick="printInvoice('${v.id}')">Print invoice</button>` : `<button class="btn" onclick="printVoucher('${v.id}')">Print voucher</button>`}
  ${!v.cancelled && can('entry') ? `<button class="btn" onclick="closeModal();editVoucher('${v.id}')">Edit</button><button class="btn" onclick="duplicateVoucher('${v.id}')">Duplicate</button>` : ''}
  ${!v.cancelled && can('delete') ? `<button class="btn red" onclick="cancelVoucher('${v.id}')">Cancel</button>` : ''}${can('delete') && !(S.E.settings.billCompliance && ['SAL', 'CN'].includes(v.type)) ? `<button class="btn red" onclick="deleteVoucher('${v.id}')">Delete</button>` : ''}
  ${v.docId ? `<button class="btn" onclick="openDoc('${v.docId}')">View attached bill</button>` : ''}${(v.type === 'SAL' || v.type === 'CN') && !v.cancelled ? `<button class="btn" onclick="cbmsSync(['${v.id}'])">Send to IRD (CBMS)</button>` : ''}</div>`;
  modal(VTYPES[v.type].t + ' ' + h(v.no), html, { wide: true });
}
function duplicateVoucher(id) { const v = clone(S.E.vouchers.find(x => x.id === id)); ['id', 'no', 'printCount', 'cbms', 'by', 'at', 'mby', 'mat', 'docId'].forEach(k => delete v[k]); v.date = todayAD(); closeModal(); F = v; showVoucherForm(); }
function printVoucher(id) {
  const v = S.E.vouchers.find(x => x.id === id); const E = S.E;
  modal('Voucher', `<div class="invoice"><h2>${h(E.name)}</h2><p class="center">${h(E.legal.address || '')} · PAN ${h(E.legal.pan || '')}</p><h3 class="center">${VTYPES[v.type].t} Voucher</h3>
  <table class="noborder"><tr><td>No: <b>${h(v.no)}</b></td><td class="right">Date: ${dTxt(v.date)}</td></tr></table>
  <table><tr><th>Particulars</th><th>Debit</th><th>Credit</th></tr>${v.lines.map(x => `<tr><td>${h((L(x.l) || {}).name)}${x.note ? '<br><small>' + h(x.note) + '</small>' : ''}</td><td class="right">${fmt(x.dr, 1)}</td><td class="right">${fmt(x.cr, 1)}</td></tr>`).join('')}
  <tr><th>Total</th><th class="right">${fmt(sum(v.lines, x => x.dr))}</th><th class="right">${fmt(sum(v.lines, x => x.cr))}</th></tr></table>
  <p>Narration: ${h(v.narration)}</p><p>${inWords(sum(v.lines, x => x.dr))}</p><br><table class="noborder"><tr><td>Prepared by: ${h(v.by)}</td><td>Checked by:</td><td>Approved by:</td></tr></table></div><div class="btns"><button class="btn pri" onclick="printModal()">Print</button></div>`, { wide: true });
}

/* ---------- Day book / voucher list ---------- */
function viewDaybook() {
  const E = S.E; const p = S.params; const fy = p.fy || E.fy || fyOf(todayAD()); const rg = fyRange(fy);
  const from = p.from || rg.from, to = p.to || rg.to, type = p.type || '', q = (p.q || '').toLowerCase();
  let list = E.vouchers.filter(v => v.date >= from && v.date <= to && (!type || v.type === type));
  if (q) list = list.filter(v => (v.no + ' ' + v.narration + ' ' + (v.bill ? (L(v.bill.party) || {}).name + ' ' + (v.bill.billNo || '') + ' ' + (v.bill.partyName || '') : '') + ' ' + v.lines.map(x => (L(x.l) || {}).name).join(' ')).toLowerCase().includes(q));
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.at || '').localeCompare(a.at || ''));
  const rows = list.slice(0, 2000).map(v => ({ date: v.date, no: v.no, type: VTYPES[v.type].t, party: v.bill ? (L(v.bill.party) || {}).name : v.lines.map(x => (L(x.l) || {}).name).slice(0, 2).join(' / '), narr: v.narration, amt: v.bill ? v.bill.total : sum(v.lines, x => x.dr), _click: `viewVoucher('${v.id}')`, _cls: 'click' + (v.cancelled ? ' cancel' : '') }));
  return `<h2>Day book</h2>${periodFilter('daybook', from, to)}
  <div class="row no-print"><div><label>Type</label><select onchange="App.setp({type:this.value})"><option value="">All</option>${Object.entries(VTYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v.t}</option>`).join('')}</select></div><div><label>Search</label><input value="${h(p.q || '')}" placeholder="number, party, narration" onchange="App.setp({q:this.value})"></div></div>
  <div class="btns no-print"><button class="btn" onclick="exportTable('db_t','Daybook')">Export Excel</button><button class="btn" onclick="window.print()">Print</button></div>
  <div id="db_t">${table([{ k: 'date', t: 'Date (BS)', f: dBS }, { k: 'no', t: 'No.' }, { k: 'type', t: 'Type' }, { k: 'party', t: 'Party / ledgers' }, { k: 'narr', t: 'Narration' }, { k: 'amt', t: 'Amount', n: 1, f: v => fmt(v) }], rows)}</div><p class="small muted">${list.length} entries</p>`;
}
function periodFilter(route, from, to) {
  const E = S.E; const fys = fyList(E);
  return `<div class="row no-print card" style="padding:10px"><div><label>Financial year</label><select onchange="App.setp({fy:this.value,from:'',to:''})">${fys.map(f => `<option ${f === (S.params.fy || E.fy) ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
  ${dateInput('pf_from', from, 'From (BS)')}${dateInput('pf_to', to, 'To (BS)')}<div class="fit"><button class="btn" onclick="App.setp({from:readDate('pf_from'),to:readDate('pf_to')})">Apply</button></div></div>`;
}

/* ---------- Bulk entry ---------- */
function viewBulk() {
  if (!can('entry')) return noAccess();
  return `<h2>Bulk entry</h2><p class="muted">Enter many transactions of the same nature in one go, e.g. a month's expense bills, daily cash sales, rent payments. Each row becomes one entry.</p>
  ${ledgerDatalist()}<div class="row card" style="padding:10px"><div><label>Type</label><select id="bk_type" onchange="bulkHeads()"><option value="PAY">Payments (expenses paid)</option><option value="RCT">Receipts</option><option value="PURX">Purchase / expense bills (with VAT)</option><option value="SALX">Sales without items (service / cash sales)</option><option value="JV">Journal (debit ledger / credit ledger)</option></select></div>
  <div><label id="bk_cbl">Paid from (cash/bank)</label><input id="bk_cb" list="dl_party" value="Cash"></div><div><label>Common narration</label><input id="bk_narr"></div></div>
  <div class="tw"><table class="t ent"><thead id="bk_head"></thead><tbody id="bk_rows"></tbody></table></div>
  <div class="btns"><button class="btn sm" onclick="bulkAdd(5)">+ 5 rows</button><button class="btn pri" onclick="bulkSave()">Save all</button></div>`;
}
function bulkHeads() {
  const t = $('#bk_type').value; const cols = { PAY: ['Date (BS)', 'Expense / party ledger', 'Amount', 'TDS %', 'Note'], RCT: ['Date (BS)', 'Received from (ledger)', 'Amount', 'Note'], PURX: ['Date (BS)', 'Expense / purchase ledger', 'Supplier name', 'Supplier PAN', 'Bill no.', 'Taxable amt', 'VAT % (13 / 0 / other)', 'TDS %'], SALX: ['Date (BS)', 'Income ledger', 'Customer name', 'Customer PAN', 'Taxable amt', 'VAT % (13 / 0 / other)'], JV: ['Date (BS)', 'Debit ledger', 'Credit ledger', 'Amount', 'Note'] }[t];
  $('#bk_head').innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`; $('#bk_rows').innerHTML = ''; $('#bk_cbl').textContent = t === 'RCT' ? 'Received in (cash/bank)' : t === 'JV' ? '(not used)' : t === 'SALX' ? 'Received in / customer (cash, bank or party)' : 'Paid from / supplier account (cash, bank or party)'; bulkAdd(8);
}
function bulkAdd(n) { const cols = $$('#bk_head th').length; const lists = { 1: 'dl_led', 2: $('#bk_type').value === 'JV' ? 'dl_led' : '' }; for (let i = 0; i < n; i++) { const tr = document.createElement('tr'); tr.innerHTML = Array.from({ length: cols }, (_, j) => `<td><input ${lists[j] ? `list="${lists[j]}"` : ''} ${j === 0 ? `placeholder="${toBS(todayAD())}"` : ''}></td>`).join(''); $('#bk_rows').appendChild(tr); } }
async function bulkSave() {
  const t = $('#bk_type').value; const cb = ledgerByName($('#bk_cb').value); const narr = $('#bk_narr').value; let n = 0, errs = [];
  if (t !== 'JV' && !cb) return toast('Select the cash / bank / party account at the top', 1);
  const rows = $$('#bk_rows tr').map(tr => $$('input', tr).map(i => i.value.trim())).filter(r => r.slice(1).some(Boolean));
  for (const [idx, r] of rows.entries()) {
    const date = toAD(r[0] || toBS(todayAD())); if (!date) { errs.push(`Row ${idx + 1}: bad date`); continue; }
    const led = ledgerByName(r[1]); if (!led) { errs.push(`Row ${idx + 1}: ledger "${r[1]}" not found`); continue; }
    let v;
    if (t === 'PAY') { const a = num(r[2]), tr_ = num(r[3]), tds = r2(a * tr_ / 100); v = { type: 'PAY', date, narration: r[4] || narr, lines: [{ l: led.id, dr: a, cr: 0, tdsRate: tr_ || undefined }, ...(tds ? [{ l: sysL('tdsPay').id, dr: 0, cr: tds }] : []), { l: cb.id, dr: 0, cr: r2(a - tds) }] }; }
    else if (t === 'RCT') { const a = num(r[2]); v = { type: 'RCT', date, narration: r[3] || narr, lines: [{ l: cb.id, dr: a, cr: 0 }, { l: led.id, dr: 0, cr: a }] }; }
    else if (t === 'JV') { const c = ledgerByName(r[2]); if (!c) { errs.push(`Row ${idx + 1}: ledger "${r[2]}" not found`); continue; } const a = num(r[3]); v = { type: 'JV', date, narration: r[4] || narr, lines: [{ l: led.id, dr: a, cr: 0 }, { l: c.id, dr: 0, cr: a }] }; }
    else if (t === 'PURX') v = { type: 'PUR', date, narration: narr, bill: { party: cb.id, partyName: r[2], pan: r[3], billNo: r[4], billDate: date, rows: [{ k: 'l', id: led.id, amt: num(r[5]), ...parseVat(r[6]) }], tdsRate: num(r[7]), payMode: isCashBank(cb) ? 'Cash' : 'Credit' } };
    else if (t === 'SALX') v = { type: 'SAL', date, narration: narr, bill: { party: cb.id, partyName: r[2], pan: r[3], rows: [{ k: 'l', id: led.id, amt: num(r[4]), ...parseVat(r[5]) }], payMode: isCashBank(cb) ? 'Cash' : 'Credit' } };
    if (await saveVoucher(v)) n++; else errs.push(`Row ${idx + 1}: not saved`);
  }
  toast(`${n} entries saved` + (errs.length ? `, ${errs.length} problems` : '')); if (errs.length) modal('Rows not saved', '<ul>' + errs.map(e => `<li>${h(e)}</li>`).join('') + '</ul>'); else bulkHeads();
}

/* ---------- Masters: ledgers ---------- */
function viewLedgers() {
  const E = S.E; const p = S.params; const q = (p.q || '').toLowerCase(); const rg = fyRange(E.fy || fyOf(todayAD())); const B = ledgerBalances(E, rg.from, '9999-12-31');
  let list = E.ledgers.filter(l => !q || (l.name + ' ' + (l.pan || '') + ' ' + groupPath(l.g).map(g => g.name).join(' ')).toLowerCase().includes(q));
  if (p.g) list = list.filter(l => inGroup(l, p.g));
  return `<h2>Ledgers</h2><p class="muted">Accounts (customers, suppliers, banks, expenses…). Each belongs to a group that decides where it appears in the Balance Sheet / P&L.</p>
  <div class="row no-print"><div><label>Search</label><input value="${h(p.q || '')}" onchange="App.setp({q:this.value})" placeholder="name, PAN, group"></div><div><label>Group</label><select onchange="App.setp({g:this.value})"><option value="">All groups</option>${E.groups.map(g => `<option value="${g.id}" ${g.id === p.g ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select></div></div>
  <div class="btns">${can('masters') ? `<button class="btn pri" onclick="editLedger()">+ New ledger</button><button class="btn" onclick="App.go('groups')">Groups</button><button class="btn" onclick="App.go('mapping')">FS mapping</button>` : ''}<button class="btn" onclick="exportTable('led_t','Ledgers')">Export Excel</button></div>
  <div id="led_t">${table([{ k: 'name', t: 'Ledger' }, { k: 'grp', t: 'Group' }, { k: 'pan', t: 'PAN' }, { k: 'ob', t: 'Opening', n: 1, f: v => fmtDC(num(v)) }, { k: 'bal', t: 'Current balance', n: 1, f: v => fmtDC(v) }],
    list.sort(byName).map(l => ({ ...l, grp: (G(l.g) || {}).name, bal: B[l.id] ? B[l.id].cl : 0, _click: `ledgerReport('${l.id}')`, _cls: 'click' })))}</div>`;
}
function ledgerReport(id) { App.go('ledger', { l: id }); }
function editLedger(id, defG) {
  if (!can('masters')) return toast('No permission', 1);
  const l = L(id) || { g: defG || 'g_iexp', ob: 0 }; const used = id && S.E.vouchers.some(v => (v.lines || []).some(x => x.l === id) || (v.bill && v.bill.party === id));
  modal(id ? 'Edit ledger' : 'New ledger', `<div class="row"><div><label>Name</label><input id="le_name" value="${h(l.name)}"></div><div><label>Group</label>${groupSelect('le_g', l.g)}</div></div>
  <div class="row"><div><label>Opening balance (at books beginning)</label><input id="le_ob" value="${Math.abs(num(l.ob)) || ''}"></div><div><label>Dr / Cr</label><select id="le_dc"><option value="1" ${num(l.ob) >= 0 ? 'selected' : ''}>Debit</option><option value="-1" ${num(l.ob) < 0 ? 'selected' : ''}>Credit</option></select></div></div>
  <div class="row"><div><label>PAN / VAT no.</label><input id="le_pan" value="${h(l.pan || '')}" maxlength="9"></div><div><label>Phone</label><input id="le_ph" value="${h(l.phone || '')}"></div><div><label>Credit days</label><input id="le_cd" value="${h(l.cdays || '')}"></div></div>
  <label>Address</label><input id="le_addr" value="${h(l.addr || '')}"><label>Financial statement head (override)</label>${fsSelect('le_fs', l.fs, true)}
  <label>Bank account details (for banks)</label><input id="le_bank" value="${h(l.bankAc || '')}">
  <div class="btns"><button class="btn pri" onclick="saveLedger('${id || ''}')">Save</button>${id && !used && !l.sys ? `<button class="btn red" onclick="delLedger('${id}')">Delete</button>` : ''}${used ? '<span class="small muted">Ledger has entries – cannot be deleted.</span>' : ''}</div>`);
}
async function saveLedger(id) {
  if (!guardWrite()) return; const name = $('#le_name').value.trim(); if (!name) return toast('Name required', 1);
  const dup = ledgerByName(name); if (dup && dup.id !== id) return toast('A ledger with this name exists', 1);
  const o = { name, g: $('#le_g').value, ob: r2(num($('#le_ob').value) * num($('#le_dc').value)), pan: $('#le_pan').value.trim(), phone: $('#le_ph').value.trim(), cdays: $('#le_cd').value.trim(), addr: $('#le_addr').value.trim(), fs: $('#le_fs').value, bankAc: $('#le_bank').value.trim() };
  if (id) Object.assign(L(id), o); else S.E.ledgers.push({ id: uid('l'), ...o }); audit((id ? 'Edited' : 'Created') + ' ledger', name); invalidate(); await saveE(); closeModal(); toast('Ledger saved'); App.render();
}
async function delLedger(id) { if (!confirmBox('Delete ledger?')) return; S.E.ledgers = S.E.ledgers.filter(l => l.id !== id); invalidate(); await saveE(); closeModal(); App.render(); }

/* ---------- Groups ---------- */
function viewGroups() {
  const E = S.E;
  return `<h2>Groups</h2><p class="muted">Groups work like Tally. Each group has a nature and a financial statement head used in NFRS statements and cash flow.</p><div class="btns">${can('masters') ? `<button class="btn pri" onclick="editGroup()">+ New group</button>` : ''}</div>
  ${table([{ k: 'path', t: 'Group' }, { k: 'nature', t: 'Nature', f: v => ({ A: 'Asset', L: 'Liability', Q: 'Equity', I: 'Income', E: 'Expense' }[v]) }, { k: 'fs', t: 'FS head', f: v => h((FS_HEADS[v] || {}).t || '') }, { k: 'cnt', t: 'Ledgers', n: 1 }],
    E.groups.map(g => ({ ...g, path: groupPath(g.id).map(x => x.name).join(' › '), nature: rootGroup(g.id).nature, cnt: E.ledgers.filter(l => l.g === g.id).length, _click: `editGroup('${g.id}')`, _cls: 'click' })).sort((a, b) => a.path.localeCompare(b.path)))}`;
}
function editGroup(id) {
  if (!can('masters')) return; const g = G(id) || { nature: 'E', fs: 'ADMIN', parent: '' };
  modal(id ? 'Edit group' : 'New group', `<label>Name</label><input id="ge_name" value="${h(g.name)}"><label>Under (parent group)</label><select id="ge_p"><option value="">(Primary group)</option>${S.E.groups.filter(x => x.id !== id).map(x => `<option value="${x.id}" ${x.id === g.parent ? 'selected' : ''}>${h(groupPath(x.id).map(y => y.name).join(' › '))}</option>`).join('')}</select>
  <label>Nature (for primary groups)</label><select id="ge_n">${[['A', 'Asset'], ['L', 'Liability'], ['Q', 'Equity / Capital'], ['I', 'Income'], ['E', 'Expense']].map(([k, t]) => `<option value="${k}" ${g.nature === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <label>Financial statement head</label>${fsSelect('ge_fs', g.fs)}<div class="btns"><button class="btn pri" onclick="saveGroup('${id || ''}')">Save</button>${id && !g.sys && !S.E.ledgers.some(l => l.g === id) && !S.E.groups.some(x => x.parent === id) ? `<button class="btn red" onclick="delGroup('${id}')">Delete</button>` : ''}</div>`);
}
async function saveGroup(id) { const o = { name: $('#ge_name').value.trim(), parent: $('#ge_p').value, nature: $('#ge_n').value, fs: $('#ge_fs').value }; if (!o.name) return; if (id) Object.assign(G(id), o); else S.E.groups.push({ id: uid('g'), ...o }); invalidate(); await saveE(); closeModal(); App.render(); }
async function delGroup(id) { S.E.groups = S.E.groups.filter(g => g.id !== id); await saveE(); closeModal(); App.render(); }

/* ---------- Items & locations ---------- */
function viewItems() {
  const E = S.E; const q = (S.params.q || '').toLowerCase(); const sv = stockValuation(E, '9999-12-31');
  const list = E.items.filter(i => !q || (i.name + ' ' + (i.code || '') + ' ' + (i.cat || '')).toLowerCase().includes(q)).sort(byName);
  return `<h2>Items (stock)</h2><div class="row no-print"><div><label>Search</label><input value="${h(S.params.q || '')}" onchange="App.setp({q:this.value})"></div></div>
  <div class="btns">${can('masters') ? `<button class="btn pri" onclick="editItem()">+ New item</button><button class="btn" onclick="editGodowns()">Locations / godowns</button>` : ''}<button class="btn" onclick="stockUpload()">Upload client stock list</button><button class="btn" onclick="App.go('stock')">Stock summary</button><button class="btn" onclick="exportTable('it_t','Items')">Export Excel</button></div>
  <div id="it_t">${table([{ k: 'name', t: 'Item' }, { k: 'code', t: 'Code' }, { k: 'cat', t: 'Category' }, { k: 'unit', t: 'Unit' }, { k: 'hs', t: 'HS code' }, { k: 'q', t: 'In stock', n: 1, f: (v, r) => `<span class="${v < 0 ? 'bad' : num(r.reorder) && v <= num(r.reorder) ? 'warn' : ''}">${fmtQ(v)}</span>` }, { k: 'v', t: 'Value', n: 1, f: v => fmt(v) }, { k: 'srate', t: 'Sales rate', n: 1 }],
    list.map(i => ({ ...i, q: (sv.items[i.id] || {}).q || 0, v: (sv.items[i.id] || {}).v || 0, _click: `editItem('${i.id}')`, _cls: 'click' })))}</div>`;
}
function editItem(id) {
  if (!can('masters')) return; const i = I(id) || { unit: 'Nos', vat: true, gd: 'gd_main' };
  modal(id ? 'Edit item' : 'New item', `<div class="row"><div><label>Item name</label><input id="ie_name" value="${h(i.name)}"></div><div><label>Code / SKU</label><input id="ie_code" value="${h(i.code || '')}"></div><div><label>Category</label><input id="ie_cat" value="${h(i.cat || '')}"></div></div>
  <div class="row"><div><label>Unit</label><input id="ie_unit" value="${h(i.unit)}" list="dl_units"><datalist id="dl_units">${['Nos', 'Pcs', 'Kg', 'Gm', 'Ltr', 'Mtr', 'Box', 'Ctn', 'Bag', 'Dozen', 'Set', 'Pair', 'Bottle', 'Packet', 'Quintal', 'Ton'].map(u => `<option value="${u}">`).join('')}</datalist></div><div><label>HS code</label><input id="ie_hs" value="${h(i.hs || '')}"></div><div><label>VAT rate % (0 = exempt)</label><input id="ie_vat" value="${i.vr !== undefined && i.vr !== '' ? i.vr : (i.vat === false ? 0 : defVat())}"></div></div>
  <div class="row"><div><label>Opening qty</label><input id="ie_oq" value="${h(i.oq || '')}"></div><div><label>Opening rate (cost)</label><input id="ie_or" value="${h(i.orate || '')}"></div><div><label>Default location</label><select id="ie_gd">${godownOpts(i.gd)}</select></div></div>
  <div class="row"><div><label>Sales rate</label><input id="ie_sr" value="${h(i.srate || '')}"></div><div><label>Purchase rate</label><input id="ie_pr" value="${h(i.prate || '')}"></div><div><label>Re-order level</label><input id="ie_ro" value="${h(i.reorder || '')}"></div></div>
  <div class="btns"><button class="btn pri" onclick="saveItem('${id || ''}')">Save</button>${id ? `<button class="btn" onclick="closeModal();App.go('itemledger',{i:'${id}'})">Item ledger</button>` : ''}${id && !stockMoves(S.E).some(m => m.i === id && m.vid) ? `<button class="btn red" onclick="delItem('${id}')">Delete</button>` : ''}</div>`);
}
async function saveItem(id) {
  if (!guardWrite()) return; const name = $('#ie_name').value.trim(); if (!name) return toast('Name required', 1); const d = itemByName(name); if (d && d.id !== id) return toast('Item exists', 1);
  const o = { name, code: $('#ie_code').value.trim(), cat: $('#ie_cat').value.trim(), unit: $('#ie_unit').value.trim() || 'Nos', hs: $('#ie_hs').value.trim(), vat: num($('#ie_vat').value) > 0, vr: num($('#ie_vat').value), oq: num($('#ie_oq').value), orate: num($('#ie_or').value), gd: $('#ie_gd').value, srate: num($('#ie_sr').value) || '', prate: num($('#ie_pr').value) || '', reorder: num($('#ie_ro').value) || '' };
  if (id) Object.assign(I(id), o); else S.E.items.push({ id: uid('i'), ...o }); invalidate(); await saveE(); closeModal(); toast('Item saved'); App.render();
}
async function delItem(id) { if (!confirmBox('Delete item?')) return; S.E.items = S.E.items.filter(i => i.id !== id); invalidate(); await saveE(); closeModal(); App.render(); }
function editGodowns() { modal('Locations / godowns', `<div id="gdl">${S.E.godowns.map(g => `<div class="row"><input data-id="${g.id}" value="${h(g.name)}"></div>`).join('')}</div><div class="btns"><button class="btn sm" onclick="$('#gdl').insertAdjacentHTML('beforeend','<div class=row><input data-id=new></div>')">+ Add</button><button class="btn pri" onclick="saveGodowns()">Save</button></div>`); }
async function saveGodowns() { $$('#gdl input').forEach(i => { const n = i.value.trim(); if (!n) return; if (i.dataset.id === 'new') S.E.godowns.push({ id: uid('gd'), name: n }); else S.E.godowns.find(g => g.id === i.dataset.id).name = n; }); await saveE(); closeModal(); toast('Saved'); }
