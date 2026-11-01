/* VAT registers, VAT return, VAT reconciliation, Annex 13 (1 lakh), missing reco, TDS, CBMS e-billing, invoices, tax tools */
'use strict';

/* ---------- registers ---------- */
function vatRegister(E, kind, from, to, incCancelled) {
  const types = kind === 'S' ? ['SAL', 'CN'] : ['PUR', 'DN'];
  return E.vouchers.filter(v => types.includes(v.type) && v.bill && v.date >= from && v.date <= to && (incCancelled || !v.cancelled)).sort((a, b) => a.date.localeCompare(b.date) || String(a.no).localeCompare(String(b.no))).map(v => {
    const b = v.bill; const sg = (v.type === 'CN' || v.type === 'DN') ? -1 : 1; const p = L(b.party) || {}; const c = v.cancelled ? 0 : sg;
    const items = b.rows.map(r => r.k === 'i' ? (I(r.id) || {}).name : (r.desc || (L(r.id) || {}).name)).filter(Boolean);
    const qty = b.rows.filter(r => r.k === 'i').reduce((a, r) => a + num(r.qty), 0);
    const base = { id: v.id, date: v.date, no: kind === 'S' ? v.no : (b.billNo || v.no), vno: v.no, type: v.type, name: b.partyName || (isCashBank(p) ? 'Cash' : p.name), pan: b.pan || p.pan || '', items: items.join(', ').slice(0, 80), qty: qty || '', unit: (b.rows.find(r => r.k === 'i') || {}).unit || '', cancelled: v.cancelled, ref: b.ref || '' };
    const taxable = r2(c * b.taxable), vat = r2(c * b.vat), exempt = r2(c * b.exempt), total = r2(c * b.total);
    if (kind === 'S') return { ...base, total, exempt: b.export ? 0 : exempt, taxable, vat, export: b.export ? exempt : 0 };
    const imp = !!b.import, cap = !!b.capital && !imp;
    return { ...base, total, exempt, taxable: imp || cap ? 0 : taxable, vat: imp || cap ? 0 : vat, impT: imp ? taxable : 0, impV: imp ? vat : 0, capT: cap ? taxable : 0, capV: cap ? vat : 0 };
  });
}
function vatSummary(E, from, to) {
  const s = vatRegister(E, 'S', from, to), p = vatRegister(E, 'P', from, to); const S2 = k => r2(sum(s, r => r[k])), P2 = k => r2(sum(p, r => r[k]));
  const o = { sTax: S2('taxable'), sVat: S2('vat'), sEx: S2('exempt'), sExp: S2('export'), pTax: P2('taxable'), pVat: P2('vat'), pEx: P2('exempt'), iTax: P2('impT'), iVat: P2('impV'), cTax: P2('capT'), cVat: P2('capV') };
  o.inVat = r2(o.pVat + o.iVat + o.cVat); o.net = r2(o.sVat - o.inVat); return o;
}
function vatCrossCheck(E, from, to) { const v = vatSummary(E, from, to); const vl = sysL('vat'); const B = ledgerBalances(E, from, to)[vl.id]; const led = r2(B.cr - B.dr); return { reg: v.net, led, diff: r2(led - v.net) }; }

function viewVAT() {
  const E = S.E; const { fy, from, to } = period(); const tab = S.params.tab || 'sales';
  const tabs = isINTL() ? [['sales', 'Sales book'], ['purchase', 'Purchase book'], ['return', 'VAT return'], ['reco', 'VAT reconciliation'], ['missing', 'Third-party / supplier reconciliation'], ['tds', 'Withholding tax'], ['mv', 'Invoice register & audit trail']] : [['sales', 'Sales book'], ['purchase', 'Purchase book'], ['return', 'Monthly VAT return'], ['reco', 'VAT reconciliation'], ['annex13', '1 lakh details (Annex 13)'], ['missing', 'Missing sales / purchase reco'], ['tds', 'TDS report'], ['cbms', 'IRD e-billing (CBMS)'], ['mv', 'Bill register (IRD view)']];
  const seg = `<div class="seg no-print">${tabs.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" onclick="App.setp({tab:'${k}'})">${t}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'sales') { const R = vatRegister(E, 'S', from, to, true); const T = { name: 'Total', _cls: 'tot' }; ['total', 'exempt', 'taxable', 'vat', 'export'].forEach(k => T[k] = sum(R, r => r[k]));
    body = `${rptBtns('vs_t', 'Sales_Book_' + fy)}${rptHead('Sales Book (बिक्री खाता)', from, to)}<div id="vs_t">${table([{ k: 'date', t: 'Date (BS)', f: dBS }, { k: 'no', t: 'Invoice no.' }, { k: 'name', t: 'Buyer' }, { k: 'pan', t: 'Buyer PAN' }, { k: 'items', t: 'Goods / services' }, { k: 'qty', t: 'Qty', n: 1 }, { k: 'unit', t: 'Unit' }, { k: 'total', t: 'Total sales', n: 1, f: amtCell }, { k: 'exempt', t: 'Exempt sales', n: 1, f: amtCell }, { k: 'taxable', t: 'Taxable amount', n: 1, f: amtCell }, { k: 'vat', t: 'VAT', n: 1, f: amtCell }, { k: 'export', t: 'Export', n: 1, f: amtCell }], [...R.map(r => ({ ...r, _cls: 'click' + (r.cancelled ? ' cancel' : ''), _click: `viewVoucher('${r.id}')` })), T])}</div>`; }
  if (tab === 'purchase') { const R = vatRegister(E, 'P', from, to); const T = { name: 'Total', _cls: 'tot' }; ['total', 'exempt', 'taxable', 'vat', 'impT', 'impV', 'capT', 'capV'].forEach(k => T[k] = sum(R, r => r[k]));
    body = `${rptBtns('vp_t', 'Purchase_Book_' + fy)}${rptHead('Purchase Book (खरिद खाता)', from, to)}<div id="vp_t">${table([{ k: 'date', t: 'Date (BS)', f: dBS }, { k: 'no', t: 'Bill no.' }, { k: 'name', t: 'Supplier' }, { k: 'pan', t: 'Supplier PAN' }, { k: 'items', t: 'Goods / services' }, { k: 'qty', t: 'Qty', n: 1 }, { k: 'total', t: 'Total purchase', n: 1, f: amtCell }, { k: 'exempt', t: 'Exempt purchase', n: 1, f: amtCell }, { k: 'taxable', t: 'Taxable purchase', n: 1, f: amtCell }, { k: 'vat', t: 'VAT', n: 1, f: amtCell }, { k: 'impT', t: 'Taxable import', n: 1, f: amtCell }, { k: 'impV', t: 'Import VAT', n: 1, f: amtCell }, { k: 'capT', t: 'Capital purchase', n: 1, f: amtCell }, { k: 'capV', t: 'Capital VAT', n: 1, f: amtCell }], [...R.map(r => ({ ...r, _cls: 'click', _click: `viewVoucher('${r.id}')` })), T])}</div>`; }
  if (tab === 'return') {
    let cf = num(E.settings.vatCreditBF); const rows = vatPeriods(fy).map(r => { const v = vatSummary(E, r.from, r.to); const bf = cf; const net = r2(v.net - bf); cf = net < 0 ? -net : 0; return { m: r.label, ...v, bf, pay: net > 0 ? net : 0, cf }; });
    body = `<p class="small muted">${isINTL() ? 'Figures for each return period (' + ((S.E.intl || {}).freq === 'M' ? 'monthly' : 'quarterly') + ' – change in Settings).' : 'Figures for each BS month as they go into the IRD VAT return (Annex / D-03).'} VAT credit brought forward at start of FY: <input style="width:120px" value="${num(E.settings.vatCreditBF)}" onchange="S.E.settings.vatCreditBF=num(this.value);saveE().then(()=>App.render())"></p>${rptBtns('vr_t', 'VAT_Return_' + fy)}
    <div id="vr_t">${table([{ k: 'm', t: 'Month' }, { k: 'sTax', t: 'Taxable sales', n: 1, f: amtCell }, { k: 'sVat', t: 'Output VAT', n: 1, f: amtCell }, { k: 'sEx', t: 'Exempt sales', n: 1, f: amtCell }, { k: 'sExp', t: 'Export', n: 1, f: amtCell }, { k: 'pTax', t: 'Taxable purchase', n: 1, f: amtCell }, { k: 'pVat', t: 'Input VAT', n: 1, f: amtCell }, { k: 'iTax', t: 'Import', n: 1, f: amtCell }, { k: 'iVat', t: 'Import VAT', n: 1, f: amtCell }, { k: 'cTax', t: 'Capital', n: 1, f: amtCell }, { k: 'cVat', t: 'Capital VAT', n: 1, f: amtCell }, { k: 'pEx', t: 'Exempt purchase', n: 1, f: amtCell }, { k: 'bf', t: 'Credit b/f', n: 1, f: amtCell }, { k: 'pay', t: 'VAT payable', n: 1, f: amtCell }, { k: 'cf', t: 'Credit c/f', n: 1, f: amtCell }], rows)}</div>`;
  }
  if (tab === 'reco') body = vatRecoHTML(E, fy, from, to);
  if (tab === 'annex13') body = annex13HTML(E, fy, from, to);
  if (tab === 'missing') body = missingRecoHTML(E, fy, from, to);
  if (tab === 'tds') body = tdsHTML(E, from, to);
  if (tab === 'cbms') body = cbmsHTML(E, from, to);
  if (tab === 'mv') body = mvHTML(E, from, to);
  return `<h2>VAT, TDS & IRD</h2>${periodFilter('vat', from, to)}${seg}${body}`;
}

function vatPeriods(fy) { const ms = fyMonths(fy); const per = isINTL() && (S.E.intl || {}).freq !== 'M' ? 3 : 1; const out = []; for (let i = 0; i < 12; i += per) { const a = monthRange(ms[i]), b = monthRange(ms[i + per - 1]); out.push({ key: ms[i], from: a.from, to: b.to, label: per > 1 ? `Q${i / 3 + 1} (${monthLabel(ms[i])} – ${monthLabel(ms[i + per - 1])})` : monthLabel(ms[i]) }); } return out; }
/* ---------- VAT reconciliation ---------- */
function vatRecoHTML(E, fy, from, to) {
  const rows = vatPeriods(fy).map(r => { const mk = r.key; const v = vatSummary(E, r.from, r.to); const f = E.vatFiled[mk] || {}; return { mk, m: r.label, bS: r2(v.sTax + v.sEx + v.sExp), fS: f.sales, bO: v.sVat, fO: f.outVat, bP: r2(v.pTax + v.iTax + v.cTax + v.pEx), fP: f.purchase, bI: v.inVat, fI: f.inVat }; });
  const d = (a, b) => b === undefined || b === '' ? '' : r2(a - num(b));
  const cell = (mk, k, v) => `<input class="vf" data-m="${mk}" data-k="${k}" value="${v ?? ''}" style="width:110px">`;
  const pl = plData(E, from, to); const vs = vatSummary(E, from, to); const regSales = r2(vs.sTax + vs.sEx + vs.sExp); const cc = vatCrossCheck(E, from, to);
  return `<p class="muted">Compare books with the VAT returns actually filed. Type the filed figures (or upload an Excel with columns Month (YYYY-MM BS), Sales, Output VAT, Purchase, Input VAT).</p>
  <div class="btns no-print"><button class="btn pri" onclick="saveVatFiled()">Save filed figures</button><button class="btn" onclick="importVatFiled()">Upload filed returns (Excel)</button><button class="btn" onclick="exportTable('vreco_t','VAT_Reconciliation')">Export Excel</button></div>
  <div id="vreco_t"><div class="tw"><table class="t ent"><thead><tr><th>Month</th><th class="n">Sales (books)</th><th>Sales (return)</th><th class="n">Diff</th><th class="n">Output VAT (books)</th><th>Output VAT (return)</th><th class="n">Diff</th><th class="n">Purchase (books)</th><th>Purchase (return)</th><th class="n">Diff</th><th class="n">Input VAT (books)</th><th>Input VAT (return)</th><th class="n">Diff</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${r.m}</td><td class="n">${fmt(r.bS)}</td><td>${cell(r.mk, 'sales', r.fS)}</td><td class="n ${d(r.bS, r.fS) ? 'bad' : ''}">${d(r.bS, r.fS) === '' ? '' : fmt(d(r.bS, r.fS))}</td><td class="n">${fmt(r.bO)}</td><td>${cell(r.mk, 'outVat', r.fO)}</td><td class="n ${d(r.bO, r.fO) ? 'bad' : ''}">${d(r.bO, r.fO) === '' ? '' : fmt(d(r.bO, r.fO))}</td><td class="n">${fmt(r.bP)}</td><td>${cell(r.mk, 'purchase', r.fP)}</td><td class="n ${d(r.bP, r.fP) ? 'bad' : ''}">${d(r.bP, r.fP) === '' ? '' : fmt(d(r.bP, r.fP))}</td><td class="n">${fmt(r.bI)}</td><td>${cell(r.mk, 'inVat', r.fI)}</td><td class="n ${d(r.bI, r.fI) ? 'bad' : ''}">${d(r.bI, r.fI) === '' ? '' : fmt(d(r.bI, r.fI))}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h3>Annual cross-check</h3><div class="kv"><div>Revenue as per P&L</div><div>${fmt(pl.rev)}</div><div>Sales as per sales book (taxable + exempt + export)</div><div>${fmt(regSales)}</div><div>Difference (explain: other income in sales head, adjustments)</div><div class="${Math.abs(pl.rev - regSales) > 1 ? 'bad' : 'ok'}">${fmt(pl.rev - regSales)}</div>
  <div>Net VAT as per registers</div><div>${fmt(cc.reg)}</div><div>Net VAT credited to VAT ledger in period</div><div>${fmt(cc.led)}</div><div>Difference</div><div class="${Math.abs(cc.diff) > 1 ? 'bad' : 'ok'}">${fmt(cc.diff)}</div></div></div>`;
}
async function saveVatFiled() { $$('.vf').forEach(i => { const m = i.dataset.m, k = i.dataset.k; S.E.vatFiled[m] = S.E.vatFiled[m] || {}; S.E.vatFiled[m][k] = i.value === '' ? '' : num(i.value); }); await saveE(); toast('Saved'); App.render(); }
async function importVatFiled() { const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); let n = 0; rows.forEach(r => { let m = String(rowGet(r, 'month', 'period')).trim().replace(/[./]/g, '-'); const p = m.split('-'); if (p.length < 2) return; m = p[0] + '-' + String(p[1]).padStart(2, '0'); S.E.vatFiled[m] = { sales: num(rowGet(r, 'sales', 'total sales')), outVat: num(rowGet(r, 'output vat', 'sales vat', 'outvat')), purchase: num(rowGet(r, 'purchase', 'total purchase')), inVat: num(rowGet(r, 'input vat', 'purchase vat', 'invat')) }; n++; }); await saveE(); toast(n + ' months imported'); App.render(); }

/* ---------- Annex 13 / 1 lakh ---------- */
function annex13Data(E, from, to, limit = 100000) {
  const m = {}; const addR = (r, kind) => { const key = (r.pan || ('NOPAN:' + r.name)) + '|' + kind; const o = m[key] = m[key] || { pan: r.pan, name: r.name, kind, taxable: 0, exempt: 0 }; o.taxable = r2(o.taxable + num(r.taxable) + num(r.impT) + num(r.capT)); o.exempt = r2(o.exempt + num(r.exempt) + num(r.export)); };
  vatRegister(E, 'S', from, to).forEach(r => addR(r, 'S')); vatRegister(E, 'P', from, to).forEach(r => addR(r, 'P'));
  return Object.values(m).map(o => ({ ...o, total: r2(o.taxable + o.exempt) })).filter(o => o.total >= limit).sort((a, b) => a.kind.localeCompare(b.kind) || b.total - a.total);
}
function annex13HTML(E, fy, from, to) {
  const R = annex13Data(E, from, to); const nopan = R.filter(r => !r.pan);
  return `<p class="muted">Parties with sales or purchases of Rs 1,00,000 or more in the year (excluding VAT) – for the annual "1 lakh" details (Annex 13) submitted to IRD.</p>${nopan.length ? `<div class="alert y">${nopan.length} party(ies) above 1 lakh have no PAN recorded – add PAN in the ledger.</div>` : ''}
  <div class="btns no-print"><button class="btn" onclick="exportRows(annex13Data(S.E,'${from}','${to}').map(r=>({PAN:r.pan,Name:r.name,'Purchase/Sales':r.kind,'Taxable amount':r.taxable,'Exempt amount':r.exempt,Total:r.total})),'Annex13_${fy.replace('/', '-')}')">Export in IRD upload format</button><button class="btn" onclick="window.print()">Print</button></div>
  ${table([{ k: 'pan', t: 'PAN' }, { k: 'name', t: 'Name' }, { k: 'kind', t: 'P / S', f: v => v === 'S' ? 'Sales' : 'Purchase' }, { k: 'taxable', t: 'Taxable amount', n: 1, f: v => fmt(v) }, { k: 'exempt', t: 'Exempt / non-taxable', n: 1, f: v => fmt(v) }, { k: 'total', t: 'Total', n: 1, f: v => fmt(v) }], R)}`;
}

/* ---------- Missing sales / purchase reconciliation ---------- */
function missingRecoHTML(E, fy, from, to) {
  const tp = (E.thirdParty || []).filter(r => r.fy === fy); const kind = S.params.mk || 'P';
  const books = {}; vatRegister(E, kind === 'P' ? 'P' : 'S', from, to).forEach(r => { const k = r.pan || 'NOPAN'; const o = books[k] = books[k] || { pan: r.pan, name: r.name, amt: 0, inv: {} }; const a = r2(num(r.taxable) + num(r.exempt) + num(r.impT) + num(r.capT) + num(r.export)); o.amt = r2(o.amt + a); o.inv[String(r.no).trim().toLowerCase()] = a; });
  const ird = {}; tp.filter(r => r.kind === kind).forEach(r => { const k = r.pan || 'NOPAN'; const o = ird[k] = ird[k] || { pan: r.pan, name: r.name, amt: 0, inv: {} }; o.amt = r2(o.amt + num(r.amt)); if (r.inv) o.inv[String(r.inv).trim().toLowerCase()] = num(r.amt); });
  const keys = Array.from(new Set([...Object.keys(books), ...Object.keys(ird)])).filter(k => k !== 'NOPAN');
  const rows = keys.map(k => { const b = books[k] || {}, i = ird[k] || {}; const diff = r2(num(b.amt) - num(i.amt)); const missB = Object.keys(i.inv || {}).filter(x => !(b.inv || {})[x]), missI = Object.keys(b.inv || {}).filter(x => !(i.inv || {})[x]); return { pan: k, name: b.name || i.name, b: num(b.amt), i: num(i.amt), diff, status: !b.amt ? 'Missing in books' : !i.amt ? 'Not in IRD data' : Math.abs(diff) < 1 ? 'Matched' : 'Amount differs', miss: (missB.length ? 'Not in books: ' + missB.slice(0, 8).join(', ') : '') + (missI.length && Object.keys(i.inv || {}).length ? ' · Not in IRD: ' + missI.slice(0, 8).join(', ') : '') }; }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return `<p class="muted">Upload the data IRD holds about you (e.g. purchases reported by your suppliers / sales reported by buyers through Annex 13 or CBMS, downloaded from the IRD taxpayer portal). The app matches it with your books by PAN and invoice number to find missing or wrong entries.</p>
  <div class="seg no-print"><button class="${kind === 'P' ? 'on' : ''}" onclick="App.setp({mk:'P'})">Purchases (suppliers' declared sales)</button><button class="${kind === 'S' ? 'on' : ''}" onclick="App.setp({mk:'S'})">Sales (buyers' declared purchases)</button></div>
  <div class="btns no-print"><button class="btn pri" onclick="importThirdParty('${fy}','${kind}')">Upload IRD / third-party file</button><button class="btn" onclick="downloadTemplate('thirdparty')">Download template</button>${tp.length ? `<button class="btn red" onclick="S.E.thirdParty=S.E.thirdParty.filter(r=>!(r.fy==='${fy}'&&r.kind==='${kind}'));saveE().then(()=>App.render())">Clear uploaded data</button>` : ''}<button class="btn" onclick="exportTable('mr_t','Missing_Reco')">Export Excel</button></div>
  ${tp.filter(r => r.kind === kind).length ? '' : '<div class="alert b">No third-party data uploaded yet for this FY.</div>'}
  <div id="mr_t">${table([{ k: 'pan', t: 'PAN' }, { k: 'name', t: 'Party' }, { k: 'b', t: 'As per books', n: 1, f: v => fmt(v) }, { k: 'i', t: 'As per IRD / party', n: 1, f: v => fmt(v) }, { k: 'diff', t: 'Difference', n: 1, f: v => `<span class="${Math.abs(v) > 1 ? 'bad' : 'ok'}">${fmt(v)}</span>` }, { k: 'status', t: 'Status', f: v => `<span class="pill ${v === 'Matched' ? 'g' : v === 'Amount differs' ? 'y' : 'r'}">${v}</span>` }, { k: 'miss', t: 'Invoices' }], rows)}</div>`;
}
async function importThirdParty(fy, kind) {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); let n = 0;
  rows.forEach(r => { const pan = String(rowGet(r, 'pan', 'seller pan', 'buyer pan', 'vat no', 'pan no')).replace(/\D/g, ''); const amt = num(rowGet(r, 'taxable amount', 'amount', 'total', 'taxable', 'total amount')) + num(rowGet(r, 'exempt amount', 'exempt', 'non taxable')); if (!pan || !amt) return; S.E.thirdParty.push({ fy, kind, pan, name: rowGet(r, 'name', 'party name', 'seller name', 'buyer name'), inv: rowGet(r, 'invoice no', 'bill no', 'invoice number', 'invoice'), date: parseAnyDate(rowGet(r, 'date', 'invoice date')), amt: r2(amt) }); n++; });
  await saveE(); toast(n + ' rows uploaded'); App.render();
}

/* ---------- TDS ---------- */
function tdsData(E, from, to) {
  const rows = []; activeVouchers(E).filter(v => v.date >= from && v.date <= to).forEach(v => {
    if (v.type === 'PAY') v.lines.filter(x => x.tdsRate).forEach(x => { const l = L(x.l) || {}; rows.push({ d: v.date, no: v.no, party: l.name, pan: l.pan || '', amt: num(x.dr), rate: x.tdsRate, tds: r2(num(x.dr) * x.tdsRate / 100), kind: 'Deducted', id: v.id }); });
    if (v.type === 'PUR' && v.bill && v.bill.tds) { const l = L(v.bill.party) || {}; rows.push({ d: v.date, no: v.no, party: v.bill.partyName || l.name, pan: v.bill.pan || l.pan || '', amt: v.bill.taxable + v.bill.exempt, rate: v.bill.tdsRate, tds: v.bill.tds, kind: 'Deducted', id: v.id }); }
    if (v.type === 'SAL' && v.bill && v.bill.tds) { const l = L(v.bill.party) || {}; rows.push({ d: v.date, no: v.no, party: v.bill.partyName || l.name, pan: v.bill.pan || l.pan || '', amt: v.bill.taxable + v.bill.exempt, rate: v.bill.tdsRate, tds: v.bill.tds, kind: 'Deducted by customer', id: v.id }); }
  }); return rows;
}
function tdsHTML(E, from, to) {
  const R = tdsData(E, from, to); const by = {}; R.filter(r => r.kind === 'Deducted').forEach(r => { const k = monthKeyBS(r.d) + '|' + r.rate; by[k] = by[k] || { m: monthLabel(monthKeyBS(r.d)), rate: r.rate, amt: 0, tds: 0 }; by[k].amt += r.amt; by[k].tds += r.tds; });
  const tp = sysL('tdsPay'); const B = ledgerBalances(E, from, to)[tp.id];
  return `<p class="muted">TDS deducted on payments and purchase bills (enter TDS % in the entry). Use for monthly e-TDS filing. ${isINTL() ? 'Rates depend on local law and any tax treaty.' : 'Common rates (verify current Finance Act): rent 10%, service fee from VAT-registered person 1.5%, other service fee 15%, contract 1.5%, interest 15%, commission 15%, dividend 5%.'}</p>
  <div class="kv card"><div>TDS deducted in period (register)</div><div>${fmt(sum(R.filter(r => r.kind === 'Deducted'), r => r.tds))}</div><div>TDS Payable ledger – credited in period</div><div>${fmt(B.cr)}</div><div>TDS deposited (debits) in period</div><div>${fmt(B.dr)}</div><div>TDS payable balance</div><div>${fmtDC(B.cl)}</div></div>
  <h3>Month & rate summary</h3>${table([{ k: 'm', t: 'Month' }, { k: 'rate', t: 'Rate %', n: 1 }, { k: 'amt', t: 'Payment amount', n: 1, f: v => fmt(v) }, { k: 'tds', t: 'TDS', n: 1, f: v => fmt(v) }], Object.values(by))}
  <h3>Details</h3>${rptBtns('tds_t', 'TDS_Register')}<div id="tds_t">${table([{ k: 'd', t: 'Date (BS)', f: dBS }, { k: 'no', t: 'Voucher' }, { k: 'party', t: 'Payee' }, { k: 'pan', t: 'PAN' }, { k: 'amt', t: 'Amount', n: 1, f: v => fmt(v) }, { k: 'rate', t: 'Rate %', n: 1 }, { k: 'tds', t: 'TDS', n: 1, f: v => fmt(v) }, { k: 'kind', t: 'Type' }], R.map(r => ({ ...r, _cls: 'click', _click: `viewVoucher('${r.id}')` })))}</div>`;
}

/* ---------- IRD CBMS (real-time e-billing) ---------- */
function cbmsHTML(E, from, to) {
  const inv = E.vouchers.filter(v => (v.type === 'SAL' || v.type === 'CN') && v.date >= from && v.date <= to && !v.cancelled);
  const pending = inv.filter(v => !(v.cbms && v.cbms.ok));
  return `<div class="alert b">Taxpayers notified by IRD must send each sales invoice and credit note to IRD's Central Billing Monitoring System (CBMS) in real time. Ask IRD for your CBMS API username & password and enter them in <a href="#" onclick="App.go('settings');return false">Settings</a>. LekhaPal can send invoices directly (needs internet) or export them in CBMS format.</div>
  <div class="kv card"><div>CBMS user</div><div>${h(E.settings.cbmsUser || '(not set)')}</div><div>Endpoint</div><div>${h(cbmsBase(E))}</div><div>Automatic sending on save</div><div>${E.settings.cbmsLive ? 'On' : 'Off'}</div><div>Invoices in period</div><div>${inv.length}</div><div>Not yet synced</div><div>${pending.length}</div></div>
  <div class="btns no-print"><button class="btn pri" onclick="cbmsSync(${h(JSON.stringify(pending.map(v => v.id)))})" ${pending.length ? '' : 'disabled'}>Send ${pending.length} pending to IRD</button><button class="btn" onclick="exportRows(${h(JSON.stringify(inv.map(v => v.id)))}.map(id=>cbmsPayload(S.E,S.E.vouchers.find(v=>v.id===id),true)),'CBMS_export')">Export in CBMS format (Excel)</button></div>
  ${table([{ k: 'date', t: 'Date', f: dBS }, { k: 'no', t: 'Invoice' }, { k: 'type', t: 'Type' }, { k: 'total', t: 'Total', n: 1, f: v => fmt(v) }, { k: 'st', t: 'CBMS status' }], inv.map(v => ({ date: v.date, no: v.no, type: VTYPES[v.type].t, total: v.bill.total, st: v.cbms ? (v.cbms.ok ? '<span class="pill g">Synced</span>' : `<span class="pill r">Failed</span> ${h(v.cbms.msg || '')}`) : '<span class="pill">Pending</span>', _cls: 'click', _click: `viewVoucher('${v.id}')` })))}`;
}
function cbmsBase(E) { return (E.settings.cbmsUrl || 'https://cbapi.ird.gov.np').replace(/\/+$/, ''); }
function cbmsPayload(E, v, forExport) {
  const b = v.bill; const fy = fyOf(v.date).replace('/', '.0'); const bs = toBS(v.date).replace(/-/g, '.'); const p = L(b.party) || {};
  const base = { username: forExport ? undefined : E.settings.cbmsUser, password: forExport ? undefined : E.settings.cbmsPass, seller_pan: E.legal.pan, buyer_pan: b.pan || p.pan || '', fiscal_year: fy, buyer_name: b.partyName || (isCashBank(p) ? 'Cash' : p.name), total_sales: b.total, taxable_sales_vat: b.taxable, vat: b.vat, excisable_amount: b.excise ? b.taxable : 0, excise: b.excise || 0, taxable_sales_hst: 0, hst: 0, amount_for_esf: 0, esf: 0, export_sales: b.export ? b.exempt : 0, tax_exempted_sales: b.export ? 0 : b.exempt, isrealtime: true, datetimeClient: new Date().toISOString() };
  if (v.type === 'SAL') return { ...base, invoice_number: v.no, invoice_date: bs };
  return { ...base, ref_invoice_number: b.ref || '', credit_note_number: v.no, credit_note_date: bs, reason_for_return: b.reason || 'Sales return' };
}
async function cbmsSync(ids, quiet) {
  const E = S.E; if (!E.settings.cbmsUser) return toast('Enter CBMS username & password in Settings first', 1);
  if (!navigator.onLine) return toast('No internet. Invoices stay pending and can be sent later.', 1);
  let ok = 0, bad = 0;
  for (const id of ids) {
    const v = E.vouchers.find(x => x.id === id); if (!v) continue; const url = cbmsBase(E) + (v.type === 'SAL' ? '/api/bill' : '/api/billreturn');
    try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cbmsPayload(E, v)) }); const t = (await r.text()).trim(); const code = parseInt(t.replace(/\D/g, '') || r.status, 10);
      const msgs = { 200: 'Success', 100: 'API credentials do not match', 101: 'Bill already exists', 102: 'Error while saving', 103: 'Unknown exception', 104: 'Invalid data', 105: 'Original bill not found' };
      v.cbms = { ok: code === 200 || code === 101, code, msg: msgs[code] || t.slice(0, 80), at: new Date().toISOString() }; v.cbms.ok ? ok++ : bad++;
    } catch (e) { v.cbms = { ok: false, msg: 'Could not reach IRD server (' + e.message + '). Try later or use export.', at: new Date().toISOString() }; bad++; }
  }
  await saveE(); toast(`CBMS: ${ok} sent, ${bad} failed`, bad > 0); if (!quiet) { closeModal(); App.render(); }
}
function mvHTML(E, from, to) {
  const R = E.vouchers.filter(v => (v.type === 'SAL' || v.type === 'CN') && v.date >= from && v.date <= to).map(v => { const b = v.bill, p = L(b.party) || {}; return { Fiscal_Year: fyOf(v.date), Bill_no: v.no, Customer_name: b.partyName || p.name, Customer_pan: b.pan || p.pan || '', Bill_Date: toBS(v.date), Amount: r2(b.taxable + b.exempt + sum(b.rows, r => r.disc)), Discount: r2(sum(b.rows, r => r.disc)), Taxable_Amount: b.taxable, Tax_Amount: b.vat, Total_Amount: b.total, Sync_with_IRD: v.cbms && v.cbms.ok ? 'Yes' : 'No', IS_Bill_Printed: v.printCount ? 'Yes' : 'No', Is_Bill_Active: v.cancelled ? 'No' : 'Yes', Printed_Time: (v.printedAt || '').replace('T', ' ').slice(0, 19), Entered_By: v.by, Printed_By: v.printedBy || '', Is_realtime: E.settings.cbmsLive ? 'Yes' : 'No', Payment_Method: b.payMode || '', VAT_refund_amount: 0 }; });
  const cols = R.length ? Object.keys(R[0]).map(k => ({ k, t: k.replace(/_/g, ' '), n: /Amount|Discount/.test(k), f: /Amount|Discount/.test(k) ? (v => fmt(v)) : undefined })) : [{ k: 'x', t: 'No invoices' }];
  return `<p class="muted">Materialised view of all sales bills with print, cancel and sync status, as required for IRD-registered billing software. Sales invoices cannot be deleted – only cancelled – and reprints are marked "Copy of original".</p>${rptBtns('mv_t', 'Bill_Register')}<div id="mv_t">${table(cols, R)}</div><h3>Activity log (latest 200)</h3>${table([{ k: 't', t: 'Time', f: v => h(v.replace('T', ' ').slice(0, 19)) }, { k: 'u', t: 'User' }, { k: 'a', t: 'Action' }, { k: 'r', t: 'Reference' }], (E.audit || []).slice(0, 200))}`;
}

/* ---------- Invoice printing (IRD tax invoice format) ---------- */
async function printInvoice(id) {
  const E = S.E; const v = E.vouchers.find(x => x.id === id); if (!v) return; const b = v.bill; const p = L(b.party) || {}; const Lg = E.legal;
  const copy = v.printCount ? `Copy of Original (${v.printCount})` : 'Original';
  v.printCount = (v.printCount || 0) + 1; if (v.printCount === 1) { v.printedAt = new Date().toISOString(); v.printedBy = S.user.email; } audit('Printed ' + VTYPES[v.type].t, v.no + ' – ' + copy); await saveE();
  const title = v.type === 'CN' ? 'CREDIT NOTE' : (Lg.vatReg ? (b.taxable ? 'TAX INVOICE' : 'INVOICE') : (isINTL() ? 'INVOICE' : 'INVOICE (PAN BILL)'));
  const rows = b.rows.map((r, i) => { const it = r.k === 'i' ? I(r.id) || {} : {}; return `<tr><td>${i + 1}</td><td>${h(it.hs || '')}</td><td>${h(r.k === 'i' ? it.name : (r.desc || (L(r.id) || {}).name))}${r.k === 'i' && r.desc ? '<br><small>' + h(r.desc) + '</small>' : ''}</td><td class="right">${r.qty !== '' && r.qty !== undefined ? fmtQ(r.qty) : ''} ${h(r.unit || '')}</td><td class="right">${r.rate !== '' && r.rate !== undefined ? fmt(r.rate) : ''}</td><td class="right">${r.disc ? fmt(r.disc) : ''}</td><td class="right">${fmt(r.amt)}</td></tr>`; }).join('');
  modal('Invoice ' + h(v.no), `<div class="invoice">
  <table class="noborder"><tr><td style="width:65%"><b style="font-size:17px">${h(E.name)}</b><br>${h([Lg.address, Lg.district].filter(Boolean).join(', '))}<br>${Lg.phone ? 'Phone: ' + h(Lg.phone) : ''} ${Lg.email ? ' · ' + h(Lg.email) : ''}<br><b>${isINTL() ? h(CFG().taxId) + ':' : (Lg.vatReg ? 'VAT' : 'PAN') + ' No:'} ${h(Lg.pan || '')}</b></td><td class="right"><b>${copy}</b>${v.cancelled ? '<br><b style="color:red">CANCELLED</b>' : ''}</td></tr></table>
  <h2>${title}</h2>
  <table class="noborder"><tr><td>${v.type === 'CN' ? 'Credit note' : 'Invoice'} No: <b>${h(v.no)}</b><br>Transaction date: ${dTxt(v.date)}<br>Invoice issue date: ${toBS(todayAD())} BS${b.ref ? '<br>Against invoice: ' + h(b.ref) : ''}</td>
  <td>Buyer: <b>${h(b.partyName || (isCashBank(p) ? 'Cash' : p.name))}</b><br>Address: ${h(b.addr || p.addr || '')}<br>Buyer's PAN/VAT: ${h(b.pan || p.pan || '')}<br>Mode of payment: ${h(b.payMode || '')}</td></tr></table>
  <table style="margin-top:6px"><tr><th>S.N.</th><th>HS code</th><th>Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Amount</th></tr>${rows}
  <tr><td colspan="6" class="right">Taxable amount</td><td class="right">${fmt(b.taxable)}</td></tr>${b.exempt ? `<tr><td colspan="6" class="right">${b.export ? 'Export (zero rated)' : 'Non-taxable / exempt amount'}</td><td class="right">${fmt(b.exempt)}</td></tr>` : ''}
  ${Lg.vatReg ? (() => { const m = vatByRate(b, E); const ks = Object.keys(m); if (b.vatManual || ks.length < 2) return `<tr><td colspan="6" class="right">VAT ${ks.length ? ks[0] : defVat(E)}%</td><td class="right">${fmt(b.vat)}</td></tr>`; return ks.map(k => `<tr><td colspan="6" class="right">VAT ${k}%</td><td class="right">${fmt(m[k])}</td></tr>`).join(''); })() : ''}${b.excise ? `<tr><td colspan="6" class="right">Excise duty</td><td class="right">${fmt(b.excise)}</td></tr>` : ''}${b.round ? `<tr><td colspan="6" class="right">Round off</td><td class="right">${fmt(b.round)}</td></tr>` : ''}
  <tr><th colspan="6" class="right">Grand total${isINTL() ? ' (' + CFG().cur + ')' : ''}</th><th class="right">${fmt(b.total)}</th></tr></table>
  <p>In words: <b>${inWords(b.total)}</b></p>${v.narration ? `<p>Remarks: ${h(v.narration)}</p>` : ''}${b.reason ? `<p>Reason: ${h(b.reason)}</p>` : ''}
  <table class="noborder" style="margin-top:30px"><tr><td>Printed by: ${h(S.user.name)}<br>Printed on: ${toBS(todayAD())} ${new Date().toTimeString().slice(0, 8)}</td><td class="right">_____________________<br>Authorised signature</td></tr></table>
  <p class="center small">${h(E.settings.invFooter || '')}</p><p class="center" style="font-size:10px;color:#777">Generated by LekhaPal – developed by CA Sudanshu Mallick</p></div>
  <div class="btns no-print"><button class="btn pri" onclick="printModal()">Print / Save PDF</button></div>`, { wide: true });
}

/* ---------- Tax tools ---------- */
function viewTaxTools() {
  const E = S.E; const P = E.taxdep || { A: { op: 0 }, B: { op: 0 }, C: { op: 0 }, D: { op: 0 } };
  const rates = { A: 5, B: 25, C: 20, D: 15 }; const names = { A: 'A – Buildings, structures', B: 'B – Computers, office equipment, furniture', C: 'C – Vehicles', D: 'D – Plant & machinery, other assets' };
  const rows = Object.keys(rates).map(k => { const x = P[k] || {}; const base = num(x.op) + num(x.a1) + num(x.a2) * 2 / 3 + num(x.a3) / 3 - num(x.sale); const dep = Math.max(0, base * rates[k] / 100); const cl = num(x.op) + num(x.a1) + num(x.a2) + num(x.a3) - num(x.sale) - dep; return { k, ...x, dep, cl }; });
  const inp = (k, f, v) => `<input class="td" data-k="${k}" data-f="${f}" value="${v || ''}" style="width:110px">`;
  const ti = num(E.taxEst && E.taxEst.income), tr = num(E.taxEst && E.taxEst.rate) || 25; const tax = ti * tr / 100;
  return `<h2>Income tax tools</h2><div class="card"><h3>Tax depreciation (pool system, Income Tax Act Schedule 2)</h3><p class="small muted">Additions: full in Shrawan–Poush, 2/3 in Magh–Chaitra, 1/3 in Baisakh–Ashadh. Rates as per Act (verify for amendments). Pool E (intangibles) is amortised over useful life separately.</p>
  <div class="tw"><table class="t ent"><thead><tr><th>Pool</th><th>Rate</th><th>Opening WDV</th><th>Additions Shrawan–Poush</th><th>Magh–Chaitra</th><th>Baisakh–Ashadh</th><th>Sale proceeds</th><th class="n">Depreciation</th><th class="n">Closing WDV</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${names[r.k]}</td><td>${rates[r.k]}%</td><td>${inp(r.k, 'op', r.op)}</td><td>${inp(r.k, 'a1', r.a1)}</td><td>${inp(r.k, 'a2', r.a2)}</td><td>${inp(r.k, 'a3', r.a3)}</td><td>${inp(r.k, 'sale', r.sale)}</td><td class="n">${fmt(r.dep)}</td><td class="n">${fmt(r.cl)}</td></tr>`).join('')}
  <tr class="tot"><td colspan="7">Total</td><td class="n">${fmt(sum(rows, r => r.dep))}</td><td class="n">${fmt(sum(rows, r => r.cl))}</td></tr></tbody></table></div><div class="btns"><button class="btn pri" onclick="saveTaxDep()">Calculate & save</button></div></div>
  <div class="card"><h3>Advance tax instalments</h3><div class="row"><div><label>Estimated taxable income (Rs)</label><input id="te_inc" value="${ti || ''}"></div><div><label>Tax rate %</label><select id="te_rate">${[[25, '25% – general company'], [30, '30% – bank, insurance, telecom, tobacco/alcohol etc.'], [20, '20% – special industry / concessional'], [0, '0% – exempt']].map(([v, t]) => `<option value="${v}" ${v === tr ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="fit"><button class="btn" onclick="S.E.taxEst={income:num($('#te_inc').value),rate:num($('#te_rate').value)};saveE().then(()=>App.render())">Calculate</button></div></div>
  ${tax ? `<div class="kv" style="margin-top:10px"><div>Estimated tax</div><div>${fmt(tax)}</div><div>By end of Poush (40%)</div><div>${fmt(tax * .4)}</div><div>By end of Chaitra (cumulative 70%)</div><div>${fmt(tax * .7)}</div><div>By end of Ashadh (100%)</div><div>${fmt(tax)}</div></div>` : ''}
  <p class="small muted">Individuals and proprietors are taxed at slab rates that change each budget – check the current Finance Act.</p></div>`;
}
async function saveTaxDep() { const P = S.E.taxdep = S.E.taxdep || {}; $$('.td').forEach(i => { P[i.dataset.k] = P[i.dataset.k] || {}; P[i.dataset.k][i.dataset.f] = num(i.value); }); await saveE(); App.render(); }
