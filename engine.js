/* Accounting engine: posting, numbering, balances, stock valuation, profit */
'use strict';

const VTYPES = {
  SAL: { t: 'Sales', p: 'SI', bill: true }, PUR: { t: 'Purchase', p: 'PB', bill: true }, CN: { t: 'Credit Note (Sales Return)', p: 'CN', bill: true }, DN: { t: 'Debit Note (Purchase Return)', p: 'DN', bill: true },
  RCT: { t: 'Receipt', p: 'RV' }, PAY: { t: 'Payment', p: 'PV' }, CON: { t: 'Contra', p: 'CV' }, JV: { t: 'Journal', p: 'JV' }, STJ: { t: 'Stock Journal', p: 'SJ' },
};
function bsMonthEnd(y, m) { const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return toBS(addDays(toAD(`${ny}-${nm}-01`), -1)); }
function booksStart(E) { return E.settings.booksFrom || fyRange(E.fyStart || E.fy).from; }

/* ---------- numbering ---------- */
function nextNo(E, type, date) {
  const fy = fyOf(date); const key = type + '|' + fy; E.seq[key] = (E.seq[key] || 0) + 1;
  const p = type === 'SAL' ? (E.settings.invPrefix || 'SI') : VTYPES[type].p;
  return `${p}-${String(E.seq[key]).padStart(4, '0')}/${isINTL(E) ? fy.replace('/', '-') : fy.slice(1).replace('/', '-')}`;
}

/* ---------- bill (invoice) maths ---------- */
function defVat(E) { return num((E || S.E).settings.vatRate || 13); }
/* VAT rate of a bill line: explicit r.vr, else default rate when VAT ticked, else 0 */
function rowRate(r, E) { if (r.vr !== undefined && r.vr !== '' && r.vr !== null) return num(r.vr); return r.tax ? defVat(E) : 0; }
/* parse a VAT cell from Excel: 'Y'/'N' or a number like 13 / 0 / 5 */
function parseVat(v, E) { v = String(v ?? '').trim(); if (v === '') return { tax: true, vr: defVat(E) }; if (/^[\d.]+%?$/.test(v)) { const n = num(v); return { tax: n > 0, vr: n }; } const y = /^y/i.test(v); return { tax: y, vr: y ? defVat(E) : 0 }; }
function vatByRate(b, E) { const m = {}; (b.rows || []).forEach(r => { const vr = rowRate(r, E); if (vr > 0) m[vr] = r2((m[vr] || 0) + r.amt * vr / 100); }); return m; }
function billTotals(b, E) {
  (b.rows || []).forEach(r => { if (r.k === 'i' || (num(r.qty) && num(r.rate))) r.amt = r2(num(r.qty) * num(r.rate) - num(r.disc)); else r.amt = r2(r.amt); r.vr = rowRate(r, E); r.tax = r.vr > 0; });
  b.taxable = r2(sum(b.rows.filter(r => r.tax), r => r.amt)); b.exempt = r2(sum(b.rows.filter(r => !r.tax), r => r.amt));
  b.vat = b.vatManual ? r2(b.vat) : r2(sum(b.rows, r => r.amt * r.vr / 100)); b.excise = r2(b.excise);
  const gross = b.taxable + b.exempt + b.vat + b.excise;
  b.round = b.autoRound ? r2(Math.round(gross) - gross) : r2(b.round);
  b.total = r2(gross + b.round); b.tds = b.tdsRate ? r2((b.tdsOn === 'total' ? b.total : b.taxable + b.exempt) * num(b.tdsRate) / 100) : r2(b.tds);
  return b;
}
function buildBillLines(v, E) {
  const b = v.bill; billTotals(b, E); const lines = []; const S2 = k => (E.ledgers.find(l => l.sys === k) || {}).id;
  const add = (l, amt) => { if (!l || Math.abs(amt) < 0.005) return; lines.push({ l, dr: amt > 0 ? r2(amt) : 0, cr: amt < 0 ? r2(-amt) : 0 }); };
  const rowLedger = (r, kind) => {
    if (r.k === 'l') return r.id;
    const it = E.items.find(i => i.id === r.id) || {};
    if (kind === 'SAL') return it.salesL || S2('sales'); if (kind === 'PUR') return it.purL || S2('purchase');
    if (kind === 'CN') return S2('salesRet') || S2('sales'); if (kind === 'DN') return S2('purRet') || S2('purchase');
  };
  const sign = { SAL: -1, CN: 1, PUR: 1, DN: -1 }[v.type]; // sign of row lines (Dr +)
  b.rows.forEach(r => add(rowLedger(r, v.type), sign * r.amt));
  add(S2('vat'), sign * b.vat); add(S2('excise'), sign * b.excise); add(S2('round'), sign * b.round);
  const tds = r2(b.tds || 0);
  if (tds) { if (v.type === 'PUR') add(S2('tdsPay'), -tds); if (v.type === 'SAL') add(S2('tdsRec'), tds); }
  const partyAmt = v.type === 'PUR' ? -(b.total - tds) : v.type === 'SAL' ? (b.total - tds) : -sign * b.total;
  add(b.party, partyAmt);
  return mergeLines(lines);
}
function mergeLines(lines) { const m = {}; lines.forEach(x => { m[x.l] = r2((m[x.l] || 0) + num(x.dr) - num(x.cr)); }); return Object.entries(m).filter(([, a]) => Math.abs(a) >= 0.005).map(([l, a]) => ({ l, dr: a > 0 ? a : 0, cr: a < 0 ? -a : 0 })); }

/* Stock movements created by a voucher: [{i, q(+in/-out), v(value for inward or null), gd}] */
function voucherStock(v, E) {
  if (v.cancelled) return [];
  if (v.mig && v.stock) return v.stock.map(s => ({ i: s.i, q: num(s.q), v: num(s.q) > 0 && s.v !== null && s.v !== undefined ? num(s.v) : null, gd: s.gd || 'gd_main' }));
  if (v.type === 'STJ') return (v.stock || []).map(s => ({ i: s.i, q: num(s.q), v: s.rate !== '' && s.rate !== undefined && num(s.q) > 0 ? r2(num(s.q) * num(s.rate)) : null, gd: s.gd }));
  if (!v.bill || !VTYPES[v.type].bill) return [];
  const b = v.bill; const items = b.rows.filter(r => r.k === 'i' && r.id);
  let extra = 0; if (v.type === 'PUR' && b.capitalise) extra = sum(b.rows.filter(r => r.k === 'l'), r => r.amt);
  const base = sum(items, r => r.amt) || 1;
  return items.map(r => {
    const q = num(r.qty);
    if (v.type === 'PUR') return { i: r.id, q, v: r2(r.amt + extra * r.amt / base), gd: r.gd };
    if (v.type === 'CN') return { i: r.id, q, v: null, gd: r.gd };
    if (v.type === 'DN') return { i: r.id, q: -q, v: r2(r.amt), fixed: true, gd: r.gd };
    return { i: r.id, q: -q, v: null, gd: r.gd };
  });
}

/* ---------- validation & save ---------- */
function validateVoucher(v, E) {
  if (!v.date) return 'Enter a valid date';
  if (E.settings.lockDate && v.date <= E.settings.lockDate) return `Books are locked up to ${toBS(E.settings.lockDate)}.`;
  if (v.type !== 'STJ') {
    if (!v.lines || v.lines.length < 2) return 'An entry needs at least two ledgers (debit and credit)';
    if (v.lines.some(x => !E.ledgers.find(l => l.id === x.l))) return 'One of the ledgers does not exist';
    const d = r2(sum(v.lines, x => x.dr)), c = r2(sum(v.lines, x => x.cr)); if (Math.abs(d - c) > 0.009) return `Debit (${fmt(d)}) and credit (${fmt(c)}) are not equal`;
    if (d <= 0) return 'Amount must be more than zero';
  } else if (!(v.stock || []).length) return 'Add at least one item';
  if (v.bill && VTYPES[v.type].bill) { if (!v.bill.party) return 'Select the party (customer / supplier) or cash/bank'; if (!v.bill.rows.length) return 'Add at least one line'; }
  return '';
}
async function saveVoucher(v) {
  const E = S.E; if (!guardWrite()) return false; if (!can('entry')) { toast('You do not have permission to make entries', 1); return false; }
  if (v.bill && VTYPES[v.type].bill) v.lines = buildBillLines(v, E);
  if (!(await unlockIfNeeded(v.date))) return false;
  const err = validateVoucher(v, E); if (err) { toast(err, 1); return false; }
  const old = v.id ? E.vouchers.find(x => x.id === v.id) : null;
  if (old && old.date !== v.date && !(await unlockIfNeeded(old.date))) return false;
  if (!old) { v.id = uid('v'); if (!v.no || v.autoNo !== false) v.no = nextNo(E, v.type, v.date); v.by = S.user.email; v.at = new Date().toISOString(); E.vouchers.push(v); audit('Created ' + VTYPES[v.type].t, v.no); }
  else { v.mby = S.user.email; v.mat = new Date().toISOString(); Object.assign(old, v); audit('Modified ' + VTYPES[v.type].t, v.no); }
  invalidate(); await saveE();
  if (E.settings.negativeStockWarn) { const neg = negativeItems(E); if (neg.length) toast('Warning: negative stock for ' + neg.slice(0, 3).join(', '), 1); }
  return true;
}
/* If the date is inside the locked period, offer to move the lock date right here (no need to open Settings) */
async function unlockIfNeeded(date) {
  const E = S.E; const lk = E.settings.lockDate; if (!lk || !date || date > lk) return true;
  if (!can('settings')) { toast(`Books are locked up to ${toBS(lk)}. Ask the administrator to unlock.`, 1); return false; }
  const nl = addDays(date, -1);
  const ans = prompt(`Books are locked up to ${toBS(lk)} BS.\n\nType 1 – move lock to ${toBS(nl)} (day before this entry) and continue\nType 2 – remove the lock completely and continue\nCancel – do not save`, '1');
  if (ans === null || !['1', '2'].includes(ans.trim())) return false;
  E.settings.lockDate = ans.trim() === '2' ? '' : nl; audit('Lock date changed', ans.trim() === '2' ? 'removed' : toBS(nl)); await saveE(); toast(ans.trim() === '2' ? 'Lock removed' : 'Books now locked up to ' + toBS(nl)); return true;
}
async function deleteVoucher(id) {
  const E = S.E; const v = E.vouchers.find(x => x.id === id); if (!v) return;
  if (!can('delete')) return toast('No permission to delete', 1); if (!guardWrite()) return;
  if (!(await unlockIfNeeded(v.date))) return;
  if (E.settings.billCompliance && ['SAL', 'CN'].includes(v.type)) return toast('IRD billing rule: sales invoices cannot be deleted. Use "Cancel" instead.', 1);
  if (!confirmBox(`Delete ${v.no}?`)) return;
  E.trash = E.trash || []; E.trash.unshift({ ...v, delBy: S.user.email, delAt: new Date().toISOString() }); if (E.trash.length > 500) E.trash.length = 500;
  E.vouchers = E.vouchers.filter(x => x.id !== id); audit('Deleted ' + VTYPES[v.type].t, v.no + ' ' + fmt(sum(v.lines || [], x => x.dr))); invalidate(); await saveE(); closeModal(); toast('Deleted'); App.render();
}
async function cancelVoucher(id) {
  const E = S.E; const v = E.vouchers.find(x => x.id === id); if (!v || !can('delete') || !guardWrite()) return;
  const reason = prompt('Reason for cancelling ' + v.no + ':'); if (!reason) return;
  v.cancelled = true; v.cancelReason = reason; v.cancelAt = new Date().toISOString(); v.cancelBy = S.user.email; audit('Cancelled ' + VTYPES[v.type].t, v.no + ' – ' + reason);
  invalidate(); await saveE(); closeModal(); toast('Cancelled'); App.render();
}

/* ---------- caches ---------- */
let _cache = {}; function invalidate() { _cache = {}; }
function activeVouchers(E) { return E.vouchers.filter(v => !v.cancelled); }

/* ---------- balances ---------- */
function ledgerBalances(E, from, to) {
  const key = 'lb|' + from + '|' + to; if (_cache[key]) return _cache[key];
  const start = booksStart(E); const B = {};
  E.ledgers.forEach(l => {
    const nat = natureOf(l); const ob = num(l.ob);
    const ie = nat === 'I' || nat === 'E';
    let op = 0, pdr = 0, pcr = 0;
    if (!ie || start < from) op = ob; else if (start <= to) { if (ob > 0) pdr = ob; else pcr = -ob; }
    B[l.id] = { op, dr: pdr, cr: pcr, cl: 0, nat };
  });
  const py = E.pyFig; if (py && py.l && to < start && (!from || from < start)) E.ledgers.forEach(l => { const b = B[l.id]; if (b.nat !== 'I' && b.nat !== 'E') return; const v = num(py.l[l.id]); if (v > 0) b.dr += v; else b.cr += -v; });
  activeVouchers(E).forEach(v => {
    if (v.date > to) return; const before = from && v.date < from;
    (v.lines || []).forEach(x => { const b = B[x.l]; if (!b) return; if (before) b.op += num(x.dr) - num(x.cr); else { b.dr += num(x.dr); b.cr += num(x.cr); } });
  });
  Object.values(B).forEach(b => { b.op = r2(b.op); b.dr = r2(b.dr); b.cr = r2(b.cr); b.cl = r2(b.op + b.dr - b.cr); });
  return (_cache[key] = B);
}
/* ---------- stock ---------- */
function openingStockValue(E) { return r2(sum(E.items, i => num(i.oq) * num(i.orate))); }
function stockMoves(E) {
  if (_cache.moves) return _cache.moves;
  const start = booksStart(E); const mv = [];
  E.items.forEach(i => { if (num(i.oq)) mv.push({ d: '0000', i: i.id, q: num(i.oq), v: r2(num(i.oq) * num(i.orate)), gd: i.gd || 'gd_main', ref: 'Opening', o: -1 }); });
  E.vouchers.forEach((v, idx) => voucherStock(v, E).forEach(m => mv.push({ ...m, d: v.date, ref: v.no, vid: v.id, vt: v.type, party: v.bill ? (v.bill.partyName || (L(v.bill.party) || {}).name) : '', o: idx })));
  mv.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.q > 0 && b.q < 0 ? -1 : a.q < 0 && b.q > 0 ? 1 : a.o - b.o));
  return (_cache.moves = mv);
}
/* Runs valuation up to a date. Returns {items:{id:{q,v,rate,in,out,inV,outV,oq,ov}}, total} ; from optional to get opening */
function stockValuation(E, to, from) {
  const key = 'sv|' + to + '|' + from + '|' + E.settings.stockMethod; if (_cache[key]) return _cache[key];
  const fifo = E.settings.stockMethod === 'FIFO'; const R = {};
  E.items.forEach(i => R[i.id] = { q: 0, v: 0, layers: [], oq: 0, ov: 0, inq: 0, inv: 0, outq: 0, outv: 0, gd: {} });
  stockMoves(E).forEach(m => {
    if (to && m.d > to) return; const r = R[m.i]; if (!r) return;
    if (from && m.d >= from && !r._opDone) { r.oq = r.q; r.ov = r.v; r._opDone = true; }
    const inPeriod = !from || m.d >= from;
    r.gd[m.gd || 'gd_main'] = r2((r.gd[m.gd || 'gd_main'] || 0) + m.q);
    if (m.q > 0) {
      const val = m.v !== null && m.v !== undefined ? m.v : (r.q > 0 ? r.v / r.q * m.q : (r.lastRate || 0) * m.q);
      r.q += m.q; r.v += val; if (fifo) r.layers.push({ q: m.q, c: val / m.q }); if (m.q) r.lastRate = val / m.q;
      if (inPeriod) { r.inq += m.q; r.inv += val; }
    } else if (m.q < 0) {
      let out = -m.q, val = 0;
      if (m.fixed && !fifo) val = m.v;
      else if (fifo) { while (out > 1e-9 && r.layers.length) { const L0 = r.layers[0]; const t = Math.min(out, L0.q); val += t * L0.c; L0.q -= t; out -= t; if (L0.q <= 1e-9) r.layers.shift(); } if (out > 1e-9) val += out * (r.lastRate || 0); }
      else val = r.q > 0 ? r.v / r.q * (-m.q) : (r.lastRate || 0) * (-m.q);
      r.q += m.q; r.v -= val; if (Math.abs(r.q) < 1e-9) { r.q = 0; r.v = 0; }
      if (inPeriod) { r.outq += -m.q; r.outv += val; }
    }
  });
  let total = 0; Object.entries(R).forEach(([id, r]) => { if (from && !r._opDone) { r.oq = r.q - r.inq + r.outq; r.ov = r.v - r.inv + r.outv; } r.v = r2(r.q < 0 ? 0 : r.v); r.rate = r.q ? r.v / r.q : 0; total += r.v; });
  return (_cache[key] = { items: R, total: r2(total) });
}
function stockValueAt(E, date) { if (date < booksStart(E)) { if (E.pyFig && E.pyFig.opStock !== undefined && date < addDays(booksStart(E), -1)) return num(E.pyFig.opStock); return openingStockValue(E); } return stockValuation(E, date).total; }
function negativeItems(E) { const sv = stockValuation(E, '9999-12-31'); return E.items.filter(i => sv.items[i.id] && sv.items[i.id].q < -1e-9).map(i => i.name); }

/* ---------- profit ---------- */
function ieNet(E, from, to) { const B = ledgerBalances(E, from, to); let n = 0; E.ledgers.forEach(l => { const b = B[l.id]; if (b.nat === 'I' || b.nat === 'E') n += b.dr - b.cr; }); return -n; } // income - expense in period
function cumProfit(E, upto) { // profit from books start up to date (incl.)
  if (upto < booksStart(E)) return 0; const B = ledgerBalances(E, '', upto); let n = 0;
  E.ledgers.forEach(l => { const b = B[l.id]; if (b.nat === 'I' || b.nat === 'E') n += b.cl; });
  return r2(-n + stockValueAt(E, upto) - openingStockValue(E));
}
function openingDiff(E) { return r2(sum(E.ledgers, l => l.ob) + openingStockValue(E)); }
function periodProfit(E, from, to) { return r2(ieNet(E, from, to) + stockValueAt(E, to) - stockValueAt(E, addDays(from, -1))); }

/* group totals for a period: returns {gid: amount (Dr+)} including sub-groups; useClosing for BS */
function groupTotals(E, B, field) { const T = {}; E.ledgers.forEach(l => { const val = field === 'period' ? B[l.id].dr - B[l.id].cr : B[l.id][field]; groupPath(l.g).forEach(g => T[g.id] = r2((T[g.id] || 0) + val)); }); return T; }
function fsTotals(E, B, field) { const T = {}; E.ledgers.forEach(l => { const val = field === 'period' ? B[l.id].dr - B[l.id].cr : B[l.id][field]; const k = fsOf(l); T[k] = r2((T[k] || 0) + val); }); return T; }
