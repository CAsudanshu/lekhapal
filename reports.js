/* Reports: ledger, trial balance, P&L, balance sheet, NFRS statements, cash flow, ratios, projections, aging, stock, health check, BRS */
'use strict';

function period() { const E = S.E; const p = S.params; const fy = p.fy || E.fy || fyOf(todayAD()); const rg = fyRange(fy); return { fy, from: p.from || rg.from, to: p.to || rg.to }; }
function rptBtns(id, name) { return `<div class="btns no-print"><button class="btn" onclick="exportTable('${id}','${name}')">Export Excel</button><button class="btn" onclick="window.print()">Print / PDF</button></div>`; }
function rptHead(title, from, to, asAt) { const E = S.E; return `<div class="print-only center"><h2>${h(E.name)}</h2><div>${h(E.legal.address || '')} ${E.legal.pan ? '· PAN ' + h(E.legal.pan) : ''}</div><h3>${title}</h3><div>${asAt ? 'As at ' + toBS(to) + ' (' + to + ')' : 'From ' + toBS(from) + ' to ' + toBS(to)}</div></div>`; }
const amtCell = v => fmt(v, 1);

/* ---------- Ledger report ---------- */
function viewLedgerRpt() {
  const E = S.E; const { from, to } = period(); const l = L(S.params.l);
  const pick = `<div class="row no-print"><div><label>Ledger</label><input list="dl_led" value="${h(l ? l.name : '')}" onchange="const x=ledgerByName(this.value); if(x) App.setp({l:x.id})"></div></div>${ledgerDatalist()}`;
  if (!l) return `<h2>Ledger statement</h2>${pick}<p class="muted">Choose a ledger.</p>`;
  const B = ledgerBalances(E, from, to)[l.id]; let bal = B.op; const nat = natureOf(l); const ie = nat === 'I' || nat === 'E';
  const rows = [{ date: '', no: '', part: 'Opening balance', dr: B.op > 0 ? B.op : 0, cr: B.op < 0 ? -B.op : 0, bal: B.op }];
  if (ie && booksStart(E) >= from && booksStart(E) <= to && num(l.ob)) { bal += num(l.ob); rows.push({ date: booksStart(E), part: 'Opening (books beginning)', dr: l.ob > 0 ? l.ob : 0, cr: l.ob < 0 ? -l.ob : 0, bal }); }
  activeVouchers(E).filter(v => v.date >= from && v.date <= to && (v.lines || []).some(x => x.l === l.id)).sort((a, b) => a.date.localeCompare(b.date)).forEach(v => {
    v.lines.filter(x => x.l === l.id).forEach(x => {
      bal = r2(bal + num(x.dr) - num(x.cr)); const other = v.lines.filter(y => y.l !== l.id).map(y => (L(y.l) || {}).name).slice(0, 2).join(', ');
      rows.push({ date: v.date, no: v.no, type: VTYPES[v.type].t, part: other + (v.narration ? ' – ' + v.narration : '') + (v.bill && v.bill.billNo ? ' (Bill ' + v.bill.billNo + ')' : ''), dr: x.dr, cr: x.cr, bal, _click: `viewVoucher('${v.id}')`, _cls: 'click' });
    });
  });
  rows.push({ part: 'Closing balance', dr: sum(rows, r => r.dr), cr: sum(rows, r => r.cr), bal, _cls: 'tot' });
  return `<h2>Ledger: ${h(l.name)}</h2>${pick}${periodFilter('ledger', from, to)}${rptBtns('lr_t', 'Ledger_' + l.name)}
  ${can('masters') ? `<button class="btn sm no-print" onclick="editLedger('${l.id}')">Edit ledger</button>` : ''}${rptHead('Ledger: ' + h(l.name), from, to)}
  <div id="lr_t">${table([{ k: 'date', t: 'Date (BS)', f: dBS }, { k: 'no', t: 'Voucher' }, { k: 'type', t: 'Type' }, { k: 'part', t: 'Particulars' }, { k: 'dr', t: 'Debit', n: 1, f: amtCell }, { k: 'cr', t: 'Credit', n: 1, f: amtCell }, { k: 'bal', t: 'Balance', n: 1, f: fmtDC }], rows)}</div>`;
}

/* ---------- Trial balance ---------- */
function tbRows(E, from, to, detailed) {
  const B = ledgerBalances(E, from, to); const vals = {};
  E.ledgers.forEach(l => { const b = B[l.id]; const ie = b.nat === 'I' || b.nat === 'E'; vals[l.id] = ie ? { op: 0, dr: b.dr, cr: b.cr, cl: r2(b.dr - b.cr) } : { op: b.op, dr: b.dr, cr: b.cr, cl: b.cl }; });
  const out = [];
  const walk = (g, lvl) => {
    const kids = E.groups.filter(x => x.parent === g.id); const leds = E.ledgers.filter(l => l.g === g.id);
    const ids = E.ledgers.filter(l => inGroup(l, g.id)).map(l => l.id); const t = { op: 0, dr: 0, cr: 0, cl: 0 };
    ids.forEach(id => { ['op', 'dr', 'cr', 'cl'].forEach(k => t[k] = r2(t[k] + vals[id][k])); });
    if (!ids.some(id => vals[id].op || vals[id].dr || vals[id].cr)) return;
    out.push({ name: g.name, ...t, _cls: lvl === 0 ? 'grp' : '', _ind: Math.min(lvl, 2) || undefined, g: g.id });
    if (detailed || lvl === 0) { kids.forEach(k => walk(k, lvl + 1)); leds.sort(byName).forEach(l => { const v = vals[l.id]; if (v.op || v.dr || v.cr) out.push({ name: l.name, ...v, _ind: Math.min(lvl + 1, 2), _click: `App.go('ledger',{l:'${l.id}',from:'${from}',to:'${to}'})`, _cls: 'click' }); }); }
  };
  E.groups.filter(g => !g.parent).forEach(g => walk(g, 0));
  const opStock = stockValueAt(E, addDays(from, -1)); const pbf = -cumProfit(E, addDays(from, -1)); const diff = openingDiff(E);
  if (opStock) out.push({ name: 'Opening stock', op: opStock, dr: 0, cr: 0, cl: opStock, _cls: 'grp' });
  if (Math.abs(pbf) > 0.005) out.push({ name: 'Profit & Loss A/c (brought forward)', op: pbf, dr: 0, cr: 0, cl: pbf, _cls: 'grp' });
  if (Math.abs(diff) > 0.005) out.push({ name: 'Difference in opening balances', op: -diff, dr: 0, cr: 0, cl: -diff, _cls: 'grp bad' });
  return out;
}
/* previous period for comparatives: previous FY when a full FY is shown, else same dates one BS year earlier */
function shiftBSYear(iso, n) { const b = bsParts(iso); for (let d = b.d; d >= 28; d--) { const a = toAD(`${b.y + n}-${b.m}-${d}`); if (a) return a; } return toAD(`${b.y + n}-${b.m}-28`) || iso; }
function prevPeriod(E, from, to) {
  const fy = fyOf(from); const rg = fyRange(fy);
  if (rg.from === from && rg.to === to) { const y = fyStartYear(fy) - 1; const pfy = y + '/' + String((y + 1) % 100).padStart(2, '0'); const p = fyRange(pfy); return { from: p.from, to: p.to, label: 'FY ' + pfy }; }
  const pf = shiftBSYear(from, -1), pt = shiftBSYear(to, -1); return { from: pf, to: pt, label: toBS(pf) + ' – ' + toBS(pt) };
}
function curLabel(from, to) { const fy = fyOf(from); const rg = fyRange(fy); return rg.from === from && rg.to === to ? 'FY ' + fy : toBS(from) + ' – ' + toBS(to); }
const pyNote = (E, P) => P.to < booksStart(E) && !E.pyFig ? `<p class="small muted no-print">Previous-year figures come from opening balances. To show last year's profit & loss as comparatives for a new client, enter them in <a href="#" onclick="App.go('migrate');return false">Migrate › Previous year figures</a>.</p>` : '';

function viewTB() {
  const E = S.E; const { from, to } = period(); const det = S.params.det === '1'; const rows = tbRows(E, from, to, det); const P = prevPeriod(E, from, to);
  const pm = {}; tbRows(E, P.from, P.to, true).forEach(r => pm[r.name + '|' + (r._ind || 0)] = r.cl); rows.forEach(r => r.pcl = pm[r.name + '|' + (r._ind || 0)] || 0);
  const top = rows.filter(r => r._cls && r._cls.includes('grp'));
  const tot = { name: 'Total', op: 0, dr: sum(top, r => r.dr), cr: sum(top, r => r.cr), _cls: 'tot' }; tot.cld = sum(top, r => r.cl > 0 ? r.cl : 0); tot.clc = sum(top, r => r.cl < 0 ? -r.cl : 0);
  const cs = stockValueAt(E, to);
  return `<h2>Trial balance</h2>${periodFilter('tb', from, to)}<div class="seg no-print"><button class="${!det ? 'on' : ''}" onclick="App.setp({det:''})">Group summary</button><button class="${det ? 'on' : ''}" onclick="App.setp({det:'1'})">Detailed (all ledgers)</button></div>${rptBtns('tb_t', 'Trial_Balance')}${rptHead('Trial Balance', from, to)}
  <div id="tb_t">${table([{ k: 'name', t: 'Particulars' }, { k: 'op', t: 'Opening', n: 1, f: v => v ? fmtDC(v) : '' }, { k: 'dr', t: 'Debit', n: 1, f: amtCell }, { k: 'cr', t: 'Credit', n: 1, f: amtCell }, { k: 'cl', t: 'Closing Dr', n: 1, f: (v, r) => r._cls === 'tot' ? fmt(r.cld) : v > 0 ? fmt(v) : '' }, { k: 'cl2', t: 'Closing Cr', n: 1, f: (v, r) => r._cls === 'tot' ? fmt(r.clc) : r.cl < 0 ? fmt(-r.cl) : '' }, { k: 'pcl', t: P.label + ' closing', n: 1, f: (v, r) => r._cls === 'tot' ? '' : v ? fmtDC(v) : '' }], [...rows, tot])}</div>
  <p class="small muted">Closing stock (memo, valued by ${E.settings.stockMethod === 'FIFO' ? 'FIFO' : 'weighted average'}): <b>${fmt(cs)}</b> · ${P.label}: ${fmt(stockValueAt(E, P.to))}. ${Math.abs(tot.cld - tot.clc) > 0.01 ? '<span class="bad">Trial balance does not tally – check opening balances.</span>' : '<span class="ok">Trial balance tallies.</span>'}</p>${pyNote(E, P)}`;
}

/* ---------- P&L (Tally style) with comparatives ---------- */
function sectionOf(l) { const f = fsOf(l); if (f === 'REV') return 'rev'; if (f === 'GRANT') return 'grant'; if (f === 'OI') return 'oi'; if (f === 'PURCH' || f === 'DIRECT') return 'cos'; if (f === 'TAX') return 'tax'; if (f === 'OCI') return 'oci'; const n = natureOf(l); return n === 'I' ? 'oi' : 'exp'; }
function plData(E, from, to) {
  const B = ledgerBalances(E, from, to); const sec = {};
  E.ledgers.forEach(l => { const b = B[l.id]; if (b.nat !== 'I' && b.nat !== 'E') return; const amt = r2(b.dr - b.cr); if (!amt) return; const s = sectionOf(l); (sec[s] = sec[s] || []).push({ l, amt }); });
  const tot = s => r2(sum(sec[s] || [], x => x.amt));
  const op = stockValueAt(E, addDays(from, -1)), cl = stockValueAt(E, to);
  const rev = -tot('rev'), grant = -tot('grant'), cos = r2(op + tot('cos') - cl), gp = r2(rev - cos), oi = -tot('oi'), exp = tot('exp'), pbt = r2(gp + grant + oi - exp), tax = tot('tax'), pat = r2(pbt - tax), oci = -tot('oci');
  return { sec, op, cl, rev, grant, cos, gp, oi, exp, pbt, tax, pat, oci, tci: r2(pat + oci), purch: tot('cos') };
}
function secRows(list, plist, sign, det) {
  const by = {}; const add = (x, k) => { const g = (G(x.l.g) || {}).name || 'Other'; const o = by[g] = by[g] || { c: 0, p: 0, L: {} }; o[k] += x.amt; const lo = o.L[x.l.id] = o.L[x.l.id] || { l: x.l, c: 0, p: 0 }; lo[k] += x.amt; };
  (list || []).forEach(x => add(x, 'c')); (plist || []).forEach(x => add(x, 'p'));
  const out = []; Object.entries(by).forEach(([g, o]) => { out.push({ name: g, amt: r2(sign * o.c), pamt: r2(sign * o.p), _ind: 1 }); if (det) Object.values(o.L).forEach(x => out.push({ name: x.l.name, amt: r2(sign * x.c), pamt: r2(sign * x.p), _ind: 2, _click: `App.go('ledger',{l:'${x.l.id}'})`, _cls: 'click muted' })); });
  return out;
}
function plRows(E, d, p, det) {
  const npo = isNPO(E); const R = []; const T = (name, k, cls, neg) => ({ name, amt: neg ? -d[k] : d[k], pamt: neg ? -p[k] : p[k], _cls: cls });
  R.push(T(npo ? 'Income' : 'Sales / revenue', 'rev', 'grp'), ...secRows(d.sec.rev, p.sec.rev, -1, det));
  if (!npo || d.cos || p.cos) { R.push(T('Less: cost of goods sold', 'cos', 'grp', 1), { name: 'Opening stock', amt: d.op, pamt: p.op, _ind: 1 }, ...secRows(d.sec.cos, p.sec.cos, 1, det), { name: 'Less: closing stock', amt: -d.cl, pamt: -p.cl, _ind: 1 }, T('Gross profit', 'gp', 'tot')); }
  if (d.grant || p.grant) R.push(T('Grants & donations', 'grant', 'grp'), ...secRows(d.sec.grant, p.sec.grant, -1, det));
  R.push(T('Add: other / indirect income', 'oi', 'grp'), ...secRows(d.sec.oi, p.sec.oi, -1, det));
  R.push(T('Less: indirect expenses', 'exp', 'grp', 1), ...secRows(d.sec.exp, p.sec.exp, 1, det));
  R.push(T(npo ? 'Surplus / (deficit) before tax' : 'Net profit before tax', 'pbt', 'tot'));
  if (d.tax || p.tax) R.push(T('Less: income tax expense', 'tax', 'grp', 1), ...secRows(d.sec.tax, p.sec.tax, 1, det));
  R.push(T(npo ? 'Surplus / (deficit) for the year' : 'Net profit / (loss) for the year', 'pat', 'tot'));
  return R;
}
function viewPL() {
  const E = S.E; const { from, to } = period(); const det = S.params.det === '1'; const d = plData(E, from, to); const P = prevPeriod(E, from, to); const p = plData(E, P.from, P.to); const npo = isNPO(E);
  const R = plRows(E, d, p, det); const pct = (a, b) => b ? (a / b * 100).toFixed(2) + '%' : '–';
  return `<h2>${npo ? 'Income & expenditure' : 'Profit & loss'}</h2>${periodFilter('pl', from, to)}<div class="seg no-print"><button class="${!det ? 'on' : ''}" onclick="App.setp({det:''})">Summary</button><button class="${det ? 'on' : ''}" onclick="App.setp({det:'1'})">Detailed</button></div>${rptBtns('pl_t', 'Profit_Loss')}${rptHead(npo ? 'Income & Expenditure Account' : 'Profit & Loss Account', from, to)}
  <div id="pl_t">${table([{ k: 'name', t: 'Particulars' }, { k: 'amt', t: curLabel(from, to), n: 1, f: v => fmt(v) }, { k: 'pamt', t: P.label, n: 1, f: v => fmt(v) }, { k: 'chg', t: 'Change %', n: 1, f: (v, r) => r.pamt ? ((r.amt - r.pamt) / Math.abs(r.pamt) * 100).toFixed(1) + '%' : '' }], R)}</div>
  <p class="small muted">Gross margin ${pct(d.gp, d.rev)} (previous ${pct(p.gp, p.rev)}) · Net margin ${pct(d.pat, d.rev)} (previous ${pct(p.pat, p.rev)})</p>${pyNote(E, P)}`;
}

/* ---------- Balance sheet (Tally style) with comparatives ---------- */
function bsSide(E, B, Bp, natures, sign, det) {
  const out = []; const nz = l => B[l.id].cl || Bp[l.id].cl; const tt = (ls, BB) => r2(sign * sum(ls, l => BB[l.id].cl));
  E.groups.filter(g => !g.parent && natures.includes(g.nature)).forEach(g => {
    const leds = E.ledgers.filter(l => inGroup(l, g.id)); if (!leds.some(nz) && g.id !== 'g_ca') return;
    out.push({ name: g.name, amt: tt(leds, B), pamt: tt(leds, Bp), _cls: 'grp', g: g.id });
    E.groups.filter(x => x.parent === g.id).forEach(sg => { const sl = E.ledgers.filter(l => inGroup(l, sg.id)); if (!sl.some(nz)) return; out.push({ name: sg.name, amt: tt(sl, B), pamt: tt(sl, Bp), _ind: 1 }); if (det) sl.filter(nz).forEach(l => out.push({ name: l.name, amt: sign * B[l.id].cl, pamt: sign * Bp[l.id].cl, _ind: 2, _cls: 'click muted', _click: `App.go('ledger',{l:'${l.id}'})` })); });
    E.ledgers.filter(l => l.g === g.id && nz(l)).forEach(l => out.push({ name: l.name, amt: sign * B[l.id].cl, pamt: sign * Bp[l.id].cl, _ind: 1, _cls: det ? 'click' : '', _click: `App.go('ledger',{l:'${l.id}'})` }));
  });
  return out;
}
function bsProfit(E, from, to) { if (to < booksStart(E)) return { pbf: 0, cur: 0 }; return { pbf: cumProfit(E, addDays(from, -1)), cur: periodProfit(E, from, to) }; }
function viewBS() {
  const E = S.E; const { from, to } = period(); const det = S.params.det === '1'; const P = prevPeriod(E, from, to); const B = ledgerBalances(E, '', to), Bp = ledgerBalances(E, '', P.to);
  const liab = bsSide(E, B, Bp, ['Q', 'L'], -1, det); const c = bsProfit(E, from, to), pp = bsProfit(E, P.from, P.to); const diff = openingDiff(E);
  liab.push({ name: isNPO(E) ? 'Income & Expenditure A/c (accumulated)' : 'Profit & Loss A/c', amt: r2(c.pbf + c.cur), pamt: r2(pp.pbf + pp.cur), _cls: 'grp' }, { name: 'Opening balance', amt: c.pbf, pamt: pp.pbf, _ind: 1 }, { name: 'Current period', amt: c.cur, pamt: pp.cur, _ind: 1 });
  if (Math.abs(diff) > 0.005) liab.push({ name: 'Difference in opening balances', amt: diff, pamt: diff, _cls: 'grp bad' });
  const assets = bsSide(E, B, Bp, ['A'], 1, det); const cs = stockValueAt(E, to), pcs = stockValueAt(E, P.to);
  const ca = assets.find(r => r.g === 'g_ca'); if (ca) { ca.amt = r2(ca.amt + cs); ca.pamt = r2(ca.pamt + pcs); const i = assets.indexOf(ca); assets.splice(i + 1, 0, { name: 'Closing stock', amt: cs, pamt: pcs, _ind: 1 }); } else assets.push({ name: 'Closing stock', amt: cs, pamt: pcs, _cls: 'grp' });
  const tg = (rows, k) => r2(sum(rows.filter(r => r._cls && r._cls.includes('grp')), r => r[k]));
  const cols = [{ k: 'name', t: 'Particulars' }, { k: 'amt', t: 'As at ' + toBS(to), n: 1, f: v => fmt(v) }, { k: 'pamt', t: 'As at ' + toBS(P.to), n: 1, f: v => fmt(v) }];
  const tl = tg(liab, 'amt'), ta = tg(assets, 'amt');
  return `<h2>Balance sheet</h2>${periodFilter('bs', from, to)}<div class="seg no-print"><button class="${!det ? 'on' : ''}" onclick="App.setp({det:''})">Summary</button><button class="${det ? 'on' : ''}" onclick="App.setp({det:'1'})">Detailed</button></div>${rptBtns('bs_t', 'Balance_Sheet')}${rptHead('Balance Sheet', from, to, true)}
  <div id="bs_t"><h3>Capital & liabilities</h3>${table(cols, [...liab, { name: 'Total', amt: tl, pamt: tg(liab, 'pamt'), _cls: 'tot' }])}
  <h3>Assets</h3>${table(cols, [...assets, { name: 'Total', amt: ta, pamt: tg(assets, 'pamt'), _cls: 'tot' }])}</div>
  ${Math.abs(tl - ta) > 0.01 ? `<div class="alert r">Balance sheet difference ${fmt(tl - ta)} – check opening balances.</div>` : ''}${pyNote(E, P)}`;
}

/* ---------- NFRS statements ---------- */
function fsData(E, from, to) {
  const B = ledgerBalances(E, '', to); const T = {}; const L2 = {};
  E.ledgers.forEach(l => { const n = natureOf(l); if (n === 'I' || n === 'E') return; const k = fsOf(l); const v = B[l.id].cl; T[k] = r2((T[k] || 0) + v); (L2[k] = L2[k] || []).push({ n: l.name, v }); });
  T.INVENT = r2((T.INVENT || 0) + stockValueAt(E, to)); (L2.INVENT = L2.INVENT || []).push({ n: 'Closing stock (inventory)', v: stockValueAt(E, to) });
  const cp = cumProfit(E, to); T.RESERVE = r2((T.RESERVE || 0) - cp); (L2.RESERVE = L2.RESERVE || []).push({ n: 'Accumulated profit / (loss)', v: -cp });
  const pl = plData(E, from, to); const PB = ledgerBalances(E, from, to); const PLL = {};
  E.ledgers.forEach(l => { const n = natureOf(l); if (n !== 'I' && n !== 'E') return; const k = fsOf(l); const v = r2(PB[l.id].dr - PB[l.id].cr); if (v) (PLL[k] = PLL[k] || []).push({ n: l.name, v }); });
  const P = {}; Object.entries(PLL).forEach(([k, xs]) => P[k] = r2(sum(xs, x => x.v)));
  return { T, L: L2, P, PLL, pl, diff: openingDiff(E) };
}
function viewNFRS() {
  const E = S.E; const { fy, from, to } = period(); const fmtType = S.params.f || (isNPO(E) ? 'npo' : 'sme');
  const py = (fyStartYear(fy) - 1) + '/' + String(fyStartYear(fy) % 100).padStart(2, '0'); const prg = fyRange(py); const hasPy = true;
  const C = fsData(E, from, to), Pv = hasPy ? fsData(E, prg.from, prg.to) : null; const npo = fmtType === 'npo';
  const notes = {}; let nn = 1; const note = k => k;
  const line = (k, sign, label) => ({ name: label || FS_HEADS[k].t, note: note(k), c: r2(sign * (C.T[k] || 0)), p: Pv ? r2(sign * (Pv.T[k] || 0)) : '' });
  const pline = (k, sign, label) => ({ name: label || FS_HEADS[k].t, note: note('pl:' + k), c: r2(sign * (C.P[k] || 0)), p: Pv ? r2(sign * (Pv.P[k] || 0)) : '' });
  const tot = (name, rows) => ({ name, c: r2(sum(rows, r => r.c)), p: Pv ? r2(sum(rows, r => r.p)) : '', _cls: 'tot' });
  const nz = r => Math.abs(num(r.c)) > 0.005 || Math.abs(num(r.p)) > 0.005;
  const byCls = (cls, sign) => Object.keys(FS_HEADS).filter(k => FS_HEADS[k].c === cls).map(k => line(k, sign)).filter(nz);
  const nca = byCls('NCA', 1), ca = byCls('CA', 1), eq = byCls('EQ', -1), ncl = byCls('NCL', -1), cl = byCls('CL', -1);
  const tA = tot('Total assets', [...nca, ...ca]), tE = tot(npo ? 'Total funds' : 'Total equity', eq), tL = tot('Total liabilities', [...ncl, ...cl]);
  const sofp = [{ name: 'ASSETS', _cls: 'grp' }, { name: 'Non-current assets', _cls: 'grp' }, ...nca, tot('Total non-current assets', nca), { name: 'Current assets', _cls: 'grp' }, ...ca, tot('Total current assets', ca), tA,
  { name: npo ? 'FUNDS AND LIABILITIES' : 'EQUITY AND LIABILITIES', _cls: 'grp' }, { name: npo ? 'Funds' : 'Equity', _cls: 'grp' }, ...eq, tE, { name: 'Non-current liabilities', _cls: 'grp' }, ...ncl, { name: 'Current liabilities', _cls: 'grp' }, ...cl, tL, tot(npo ? 'Total funds and liabilities' : 'Total equity and liabilities', [...eq, ...ncl, ...cl])];
  if (Math.abs(C.diff) > 0.005) sofp.push({ name: 'Difference in opening balances (to be corrected)', c: C.diff, _cls: 'bad' });
  // Profit or loss
  const pl = C.pl, pp = Pv ? Pv.pl : {}; const L_ = (name, c, p, cls) => ({ name, c, p: Pv ? p : '', _cls: cls });
  const plr = []; const exHeads = ['EMP', 'ADMIN', 'SELL', 'PROG', 'DEP'];
  if (!npo) { plr.push(L_('Revenue from operations', pl.rev, pp.rev), L_('Cost of sales', -pl.cos, -(pp.cos || 0)), L_('Gross profit', pl.gp, pp.gp, 'tot')); }
  else plr.push(L_('Grants and donations', pl.grant, pp.grant), L_('Revenue from operations / programme income', pl.rev, pp.rev));
  plr.push(pline('OI', -1));
  exHeads.forEach(k => plr.push(pline(k, -1)));
  const other = Object.keys(C.P).filter(k => !['REV', 'GRANT', 'OI', 'PURCH', 'DIRECT', 'TAX', 'OCI', 'FIN', ...exHeads].includes(k)); other.forEach(k => plr.push(pline(k, -1)));
  plr.push(pline('FIN', -1));
  plr.push(L_(npo ? 'Surplus / (deficit) before tax' : 'Profit before tax', pl.pbt, pp.pbt, 'tot'));
  if (!npo) { plr.push(L_('Income tax expense', -pl.tax, -(pp.tax || 0)), L_('Profit / (loss) for the year', pl.pat, pp.pat, 'tot')); if (fmtType === 'full') { plr.push(L_('Other comprehensive income', pl.oci, pp.oci), L_('Total comprehensive income for the year', pl.tci, pp.tci, 'tot')); const sh = num(E.legal.shares); if (sh) plr.push(L_('Basic & diluted earnings per share (Rs)', r2(pl.pat / sh), Pv ? r2(pp.pat / sh) : '')); } }
  else plr.push(L_('Surplus / (deficit) for the year', pl.pat, pp.pat, 'tot'));
  const plFiltered = plr.filter(r => r._cls || nz(r));
  [...sofp, ...plFiltered].forEach(r => { if (r.note) { notes[r.note] = notes[r.note] || nn++; r.note = notes[r.note]; } });
  // Cash flow & SOCE
  const cf = cashFlowData(E, from, to), cfp = prg.from >= booksStart(E) ? cashFlowData(E, prg.from, prg.to) : null;
  const soce = soceData(E, from, to);
  // Notes
  const noteHtml = Object.entries(notes).sort((a, b) => a[1] - b[1]).map(([k, n]) => {
    const isP = k.startsWith('pl:'); const key = isP ? k.slice(3) : k; const sign = isP ? (FS_HEADS[key].s === 'I' ? -1 : 1) : (FS_HEADS[key].s === 'A' ? 1 : -1);
    const cur = (isP ? C.PLL[key] : C.L[key]) || [], prv = Pv ? ((isP ? Pv.PLL[key] : Pv.L[key]) || []) : [];
    const names = Array.from(new Set([...cur.map(x => x.n), ...prv.map(x => x.n)]));
    const rows = names.map(nm => ({ name: nm, c: r2(sign * sum(cur.filter(x => x.n === nm), x => x.v)), p: Pv ? r2(sign * sum(prv.filter(x => x.n === nm), x => x.v)) : '' })).filter(nz);
    if (!rows.length) return ''; return `<h3>Note ${n}: ${FS_HEADS[key].t}</h3>` + table(cols2(fy, py, Pv), [...rows, tot('Total', rows)]);
  }).join('');
  const titles = isINTL() ? { full: ['Statement of Financial Position', 'Statement of Profit or Loss and Other Comprehensive Income', 'IFRS Accounting Standards as issued by the International Accounting Standards Board (IASB)'], sme: ['Statement of Financial Position', 'Statement of Profit or Loss', 'the IFRS for SMEs Accounting Standard issued by the IASB'], micro: ['Statement of Financial Position', 'Statement of Profit or Loss', 'the IFRS for SMEs Accounting Standard (simplified presentation)'], npo: ['Statement of Financial Position', 'Statement of Income and Expenditure', 'the financial reporting framework applicable to not-for-profit entities'] }[fmtType] : { full: ['Statement of Financial Position', 'Statement of Profit or Loss and Other Comprehensive Income', 'Nepal Financial Reporting Standards (NFRS) as pronounced by the Accounting Standards Board, Nepal'], sme: ['Statement of Financial Position', 'Statement of Profit or Loss', 'NFRS for SMEs as pronounced by the Accounting Standards Board, Nepal'], micro: ['Statement of Financial Position', 'Statement of Income', 'Nepal Accounting Standard for Micro Entities (NAS for MEs)'], npo: ['Statement of Financial Position', 'Statement of Income and Expenditure', 'NPO accounting guidance / NFRS for NPOs as applicable (ASB Nepal)'] }[fmtType];
  return `<h2>Financial statements (NFRS)</h2>${periodFilter('nfrs', from, to)}
  <div class="seg no-print">${(isINTL() ? [['full', 'Full IFRS'], ['sme', 'IFRS for SMEs'], ['npo', 'Not-for-profit']] : [['full', 'Full NFRS'], ['sme', 'NFRS for SMEs'], ['micro', 'NAS for Micro Entities'], ['npo', 'NPO / NGO']]).map(([k, t]) => `<button class="${fmtType === k ? 'on' : ''}" onclick="App.setp({f:'${k}'})">${t}</button>`).join('')}</div>
  <div class="btns no-print"><button class="btn" onclick="exportNFRS()">Export all to Excel</button><button class="btn" onclick="window.print()">Print / PDF</button></div>
  <div id="nfrs_all"><div class="center"><h2>${h(E.name)}</h2><div>${h(E.legal.address || '')} ${E.legal.pan ? '· PAN ' + h(E.legal.pan) : ''}</div><div class="small">Financial statements for FY ${fy} (${toBS(from)} to ${toBS(to)}) · Amounts in NPR</div></div>
  <h3>${titles[0]} as at ${toBS(to)}</h3><div id="nf1">${table(cols2(fy, py, Pv, true), sofp)}</div>
  <h3>${titles[1]} for the year ended ${toBS(to)}</h3><div id="nf2">${table(cols2(fy, py, Pv, true), plFiltered)}</div>
  ${npo ? '' : `<h3>Statement of Changes in Equity</h3><div id="nf3">${table([{ k: 'name', t: 'Particulars' }, { k: 'sc', t: 'Share capital', n: 1, f: v => fmt(v) }, { k: 're', t: 'Retained earnings', n: 1, f: v => fmt(v) }, { k: 'or', t: 'Other reserves', n: 1, f: v => fmt(v) }, { k: 'tt', t: 'Total', n: 1, f: v => fmt(v) }], soce)}</div>`}
  <h3>Statement of Cash Flows (indirect method)</h3><div id="nf4">${table(cols2(fy, py, cfp), cfRows(cf, cfp))}</div>
  <h3>Notes to the financial statements</h3><div class="card"><b>1. Basis of preparation.</b> These financial statements are prepared under the historical cost convention on accrual basis in accordance with ${titles[2]} and ${isINTL() ? 'applicable company law' : 'the Companies Act, 2063 / applicable law'}. Inventories are valued at lower of cost (${E.settings.stockMethod === 'FIFO' ? 'FIFO' : 'weighted average'}) and net realisable value. Revenue is recognised when control of goods/services is transferred, net of VAT and discounts. Property, plant and equipment are stated at cost less accumulated depreciation.</div>
  <div id="nf5">${noteHtml}</div></div>`;
}
function cols2(fy, py, Pv, withNote) { return [{ k: 'name', t: 'Particulars' }, ...(withNote ? [{ k: 'note', t: 'Note' }] : []), { k: 'c', t: 'FY ' + fy, n: 1, f: v => v === '' || v === undefined ? '' : fmt(v) }, ...(Pv ? [{ k: 'p', t: 'FY ' + py, n: 1, f: v => v === '' || v === undefined ? '' : fmt(v) }] : [])]; }
function exportNFRS() { const wb = XLSX.utils.book_new(); [['nf1', 'Financial Position'], ['nf2', 'Profit or Loss'], ['nf3', 'Changes in Equity'], ['nf4', 'Cash Flows'], ['nf5', 'Notes']].forEach(([id, n]) => { const el = document.getElementById(id); if (!el) return; const tbs = el.querySelectorAll('table'); if (!tbs.length) return; const div = document.createElement('table'); tbs.forEach(t => div.innerHTML += t.innerHTML); XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(div), n); }); XLSX.writeFile(wb, S.E.name.replace(/\W+/g, '_') + '_Financial_Statements.xlsx'); }

function cashFlowData(E, from, to) {
  const prev = addDays(from, -1); const A = ledgerBalances(E, '', prev), Z = ledgerBalances(E, '', to); const P = ledgerBalances(E, from, to);
  const profit = periodProfit(E, from, to); let dep = 0, tax = 0, fin = 0; const op = {}, inv = {}, fn = {}; let cash0 = 0, cash1 = 0;
  E.ledgers.forEach(l => {
    const n = natureOf(l); const k = fsOf(l);
    if (n === 'I' || n === 'E') { const v = P[l.id].dr - P[l.id].cr; if (k === 'DEP') dep += v; return; }
    const d = r2(Z[l.id].cl - A[l.id].cl); const cf = (FS_HEADS[k] || {}).cf || 'op';
    if (cf === 'cash') { cash0 += A[l.id].cl; cash1 += Z[l.id].cl; return; }
    const bucket = cf === 'inv' ? inv : cf === 'fin' ? fn : op; bucket[k] = r2((bucket[k] || 0) - d);
  });
  const dInv = r2(stockValueAt(E, to) - stockValueAt(E, prev)); op.INVENT = r2((op.INVENT || 0) - dInv);
  if (inv.PPE !== undefined || dep) inv.PPE = r2((inv.PPE || 0) - dep);
  const cfo = r2(profit + dep + sum(Object.values(op))), cfi = r2(sum(Object.values(inv))), cff = r2(sum(Object.values(fn)));
  return { profit, dep, op, inv, fn, cfo, cfi, cff, net: r2(cfo + cfi + cff), cash0: r2(cash0), cash1: r2(cash1) };
}
function cfRows(c, p) {
  const keys = o => Object.keys(o); const lab = { PPE: 'Purchase (net of sale) of property, plant & equipment', INTANG: 'Purchase of intangible assets', LTINV: 'Investments made / (sold)', STINV: 'Short-term investments', INVPROP: 'Investment property', ONCA: 'Other non-current assets', SHARECAP: 'Capital introduced / (withdrawn)', RESERVE: 'Dividends / drawings / other equity movements', LTBORR: 'Long-term borrowings received / (repaid)', STBORR: 'Short-term borrowings received / (repaid)', FUND: 'Fund movements', OCIRES: 'Other reserves' };
  const wc = k => '(Increase) / decrease in ' + FS_HEADS[k].t.toLowerCase();
  const R = []; const row = (name, a, b, cls) => R.push({ name, c: a, p: p ? b : '', _cls: cls });
  row('A. Cash flow from operating activities', '', '', 'grp'); row('Profit / (loss) for the period', c.profit, p && p.profit); row('Add: depreciation & amortisation', c.dep, p && p.dep);
  Array.from(new Set([...keys(c.op), ...(p ? keys(p.op) : [])])).forEach(k => { if (c.op[k] || (p && p.op[k])) row(['TRADEPAY', 'OCL', 'CTL', 'STPROV', 'LTPROV', 'DTL'].includes(k) ? 'Increase / (decrease) in ' + FS_HEADS[k].t.toLowerCase() : wc(k), c.op[k] || 0, p && (p.op[k] || 0)); });
  row('Net cash from operating activities', c.cfo, p && p.cfo, 'tot');
  row('B. Cash flow from investing activities', '', '', 'grp'); Array.from(new Set([...keys(c.inv), ...(p ? keys(p.inv) : [])])).forEach(k => (c.inv[k] || (p && p.inv[k])) && row(lab[k] || FS_HEADS[k].t, c.inv[k] || 0, p && (p.inv[k] || 0))); row('Net cash from investing activities', c.cfi, p && p.cfi, 'tot');
  row('C. Cash flow from financing activities', '', '', 'grp'); Array.from(new Set([...keys(c.fn), ...(p ? keys(p.fn) : [])])).forEach(k => (c.fn[k] || (p && p.fn[k])) && row(lab[k] || FS_HEADS[k].t, c.fn[k] || 0, p && (p.fn[k] || 0))); row('Net cash from financing activities', c.cff, p && p.cff, 'tot');
  row('Net increase / (decrease) in cash (A+B+C)', c.net, p && p.net, 'tot'); row('Cash & cash equivalents at beginning', c.cash0, p && p.cash0); row('Cash & cash equivalents at end', c.cash1, p && p.cash1, 'tot');
  if (Math.abs(c.cash0 + c.net - c.cash1) > 0.01) row('Unreconciled difference (check ledger mapping)', r2(c.cash1 - c.cash0 - c.net), '', 'bad');
  return R;
}
function viewCashflow() { const E = S.E; const { from, to } = period(); const c = cashFlowData(E, from, to); const P = prevPeriod(E, from, to); const p = P.from >= booksStart(E) ? cashFlowData(E, P.from, P.to) : null; return `<h2>Cash flow statement</h2>${periodFilter('cf', from, to)}${rptBtns('cf_t', 'Cash_Flow')}${rptHead('Statement of Cash Flows', from, to)}<div id="cf_t">${table([{ k: 'name', t: 'Particulars' }, { k: 'c', t: curLabel(from, to), n: 1, f: v => v === '' ? '' : fmt(v) }, { k: 'p', t: P.label, n: 1, f: v => v === '' || v === undefined || v === null ? '' : fmt(v) }], cfRows(c, p))}</div><p class="small muted">Classification follows each ledger's financial statement head (Ledgers › FS mapping). ${p ? '' : 'Previous-year cash flow needs two years of balances in LekhaPal (or the previous year\'s opening balance sheet), so that column is blank for the first year.'}</p>`; }
function soceData(E, from, to) {
  const prev = addDays(from, -1); const A = ledgerBalances(E, '', prev), Z = ledgerBalances(E, '', to); const g = (B, k) => -sum(E.ledgers.filter(l => fsOf(l) === k && natureOf(l) === 'Q'), l => B[l.id].cl);
  const sc0 = g(A, 'SHARECAP') + g(A, 'FUND'), sc1 = g(Z, 'SHARECAP') + g(Z, 'FUND'), or0 = g(A, 'OCIRES'), or1 = g(Z, 'OCIRES'); const re0 = g(A, 'RESERVE') + cumProfit(E, prev), re1 = g(Z, 'RESERVE') + cumProfit(E, to); const pr = periodProfit(E, from, to);
  const row = (name, sc, re, or, cls) => ({ name, sc: r2(sc), re: r2(re), or: r2(or), tt: r2(sc + re + or), _cls: cls });
  return [row('Balance at beginning of year', sc0, re0, or0), row('Profit / (loss) for the year', 0, pr, 0), row('Capital issued / (withdrawn)', sc1 - sc0, 0, 0), row('Dividends / transfers / other', 0, re1 - re0 - pr, or1 - or0), row('Balance at end of year', sc1, re1, or1, 'tot')];
}

/* ---------- Ratios ---------- */
function ratioSet(E, from, to) {
  const C = fsData(E, from, to); const T = k => num(C.T[k]); const pl = C.pl;
  const ca = ['INVENT', 'TRADEREC', 'ADV', 'CTA', 'STINV', 'CASH'].reduce((a, k) => a + T(k), 0), cl = -['STBORR', 'TRADEPAY', 'OCL', 'CTL', 'STPROV'].reduce((a, k) => a + T(k), 0);
  const eq = -['SHARECAP', 'RESERVE', 'OCIRES', 'FUND'].reduce((a, k) => a + T(k), 0), debt = -(T('LTBORR') + T('STBORR')); const days = Math.max(1, (new Date(to) - new Date(from)) / 864e5 + 1);
  return [ca / cl, (ca - T('INVENT')) / cl, debt / eq, pl.gp / pl.rev * 100, pl.pat / pl.rev * 100, pl.pat / eq * 100, pl.cos / T('INVENT'), T('INVENT') / pl.cos * days, T('TRADEREC') / pl.rev * days, -T('TRADEPAY') / (pl.purch || pl.cos) * days, (pl.pbt + num(C.P.FIN)) / num(C.P.FIN)];
}
function viewRatios() {
  const E = S.E; const { from, to } = period(); const P = prevPeriod(E, from, to); const c = ratioSet(E, from, to), p = ratioSet(E, P.from, P.to);
  const meta = [['Current ratio', ' : 1', 'Current assets ÷ current liabilities (ideal ≈ 2)'], ['Quick ratio', ' : 1', 'Excludes inventory (ideal ≈ 1)'], ['Debt-equity ratio', ' : 1', 'Borrowings ÷ equity'], ['Gross profit margin', '%', ''], ['Net profit margin', '%', ''], ['Return on equity', '%', ''], ['Inventory turnover', ' times', ''], ['Inventory days', ' days', ''], ['Debtor days', ' days', ''], ['Creditor days', ' days', ''], ['Interest coverage', ' times', '']];
  const f = (v, s) => isFinite(v) ? v.toFixed(2) + s : '–';
  const rows = meta.map(([n, s, note], i) => ({ n, v: f(c[i], s), pv: f(p[i], s), note }));
  return `<h2>Ratio analysis</h2>${periodFilter('ratios', from, to)}${rptBtns('ra_t', 'Ratios')}<div id="ra_t">${table([{ k: 'n', t: 'Ratio' }, { k: 'v', t: curLabel(from, to), n: 1 }, { k: 'pv', t: P.label, n: 1 }, { k: 'note', t: 'Meaning' }], rows)}</div>`;
}

/* ---------- Projections ---------- */
function viewProjection() {
  const E = S.E; const { fy, from, to } = period(); const P = E.projection || { years: 3, g: 15, gp: '', eg: 10, capex: 0, dep: 15, tax: 25, dd: 30, sd: 45, cd: 30, repay: 0, int: 11, div: 0 };
  const C = fsData(E, from, to); const pl = C.pl; const base = { sales: pl.rev, cos: pl.cos, exp: r2(pl.exp - num(C.P.DEP) - num(C.P.FIN)), oi: pl.oi };
  if (P.gp === '' || P.gp === undefined) P.gp = pl.rev ? r2(pl.gp / pl.rev * 100) : 20;
  const T = k => num(C.T[k]); let ppe = T('PPE') + T('INTANG'), rec = T('TRADEREC'), inv = T('INVENT'), cash = T('CASH'), oth = T('ADV') + T('CTA') + T('LTINV') + T('STINV') + T('ONCA') + T('INVPROP') + T('DTA'), pay = -T('TRADEPAY'), borr = -(T('LTBORR') + T('STBORR')), othL = -(T('OCL') + T('CTL') + T('STPROV') + T('LTPROV') + T('DTL')), eq = -(T('SHARECAP') + T('RESERVE') + T('OCIRES') + T('FUND')) - C.diff;
  const yrs = []; let s = base.sales, ex = base.exp; let y0 = fyStartYear(fy);
  for (let i = 1; i <= Math.min(10, num(P.years) || 3); i++) {
    s = s * (1 + num(P.g) / 100); const cos = s * (1 - num(P.gp) / 100); ex = ex * (1 + num(P.eg) / 100); const dep = (ppe + num(P.capex)) * num(P.dep) / 100; const it = borr * num(P.int) / 100;
    const pbt = s - cos + base.oi - ex - dep - it; const tax = Math.max(0, pbt * num(P.tax) / 100); const pat = pbt - tax;
    ppe = ppe + num(P.capex) - dep; borr = Math.max(0, borr - num(P.repay)); const nrec = s * num(P.dd) / 365, ninv = cos * num(P.sd) / 365, npay = cos * num(P.cd) / 365; const div = num(P.div);
    const cfo = pat + dep - (nrec - rec) - (ninv - inv) + (npay - pay); const cfi = -num(P.capex); const cff = -Math.min(num(P.repay), borr + num(P.repay)) - div;
    rec = nrec; inv = ninv; pay = npay; eq = eq + pat - div; cash = cash + cfo + cfi + cff;
    const yl = (y0 + i) + '/' + String((y0 + i + 1) % 100).padStart(2, '0');
    yrs.push({ yl, s, cos, gp: s - cos, oi: base.oi, ex, dep, it, pbt, tax, pat, ppe, rec, inv, cash, oth, ta: ppe + rec + inv + cash + oth, eq, borr, pay, othL, tl: eq + borr + pay + othL, cfo, cfi, cff });
  }
  const tbl = (rows) => `<div class="tw"><table class="t"><thead><tr><th>Particulars</th><th class="n">FY ${fy} (actual)</th>${yrs.map(y => `<th class="n">FY ${y.yl}</th>`).join('')}</tr></thead><tbody>${rows.map(([n, k, a, cls]) => `<tr class="${cls || ''}"><td>${n}</td><td class="n">${a === undefined ? '' : fmt(a)}</td>${yrs.map(y => `<td class="n">${fmt(y[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const inp = (k, t) => `<div><label>${t}</label><input id="pj_${k}" value="${h(P[k])}"></div>`;
  return `<h2>Financial projection</h2><p class="muted">Based on actual figures of FY ${fy}. Change assumptions and click Calculate. Useful for bank loan proposals and business plans.</p>${periodFilter('projection', from, to)}
  <div class="card no-print"><div class="grid3">${inp('years', 'Years to project (1–10)')}${inp('g', 'Sales growth % p.a.')}${inp('gp', 'Gross margin %')}${inp('eg', 'Expense growth % p.a.')}${inp('capex', 'Capital expenditure per year (Rs)')}${inp('dep', 'Depreciation rate % (WDV)')}${inp('int', 'Interest rate on borrowings %')}${inp('repay', 'Loan repayment per year (Rs)')}${inp('tax', 'Income tax rate %')}${inp('dd', 'Debtor days')}${inp('sd', 'Stock days')}${inp('cd', 'Creditor days')}${inp('div', 'Dividend / drawings per year (Rs)')}</div>
  <div class="btns"><button class="btn pri" onclick="saveProjection()">Calculate</button><button class="btn" onclick="exportTable('pj_all','Projection')">Export Excel</button><button class="btn" onclick="window.print()">Print</button></div></div>
  <div id="pj_all"><h3>Projected profit & loss</h3>${tbl([['Sales', 's', pl.rev], ['Cost of sales', 'cos', pl.cos], ['Gross profit', 'gp', pl.gp, 'tot'], ['Other income', 'oi', pl.oi], ['Operating expenses', 'ex', base.exp], ['Depreciation', 'dep', num(C.P.DEP)], ['Interest', 'it', num(C.P.FIN)], ['Profit before tax', 'pbt', pl.pbt, 'tot'], ['Income tax', 'tax', pl.tax], ['Profit after tax', 'pat', pl.pat, 'tot']])}
  <h3>Projected balance sheet</h3>${tbl([['Fixed assets (net)', 'ppe', T('PPE') + T('INTANG')], ['Trade receivables', 'rec', T('TRADEREC')], ['Inventory', 'inv', T('INVENT')], ['Other assets', 'oth'], ['Cash & bank', 'cash', T('CASH')], ['Total assets', 'ta', undefined, 'tot'], ['Equity / net worth', 'eq'], ['Borrowings', 'borr', -(T('LTBORR') + T('STBORR'))], ['Trade payables', 'pay', -T('TRADEPAY')], ['Other liabilities', 'othL'], ['Total liabilities & equity', 'tl', undefined, 'tot']])}
  <h3>Projected cash flow</h3>${tbl([['Cash from operations', 'cfo'], ['Cash from investing', 'cfi'], ['Cash from financing', 'cff'], ['Closing cash', 'cash', T('CASH'), 'tot']])}</div>`;
}
async function saveProjection() { const P = {}; ['years', 'g', 'gp', 'eg', 'capex', 'dep', 'tax', 'dd', 'sd', 'cd', 'repay', 'int', 'div'].forEach(k => P[k] = num($('#pj_' + k).value)); S.E.projection = P; await saveE(); App.render(); }

/* ---------- Aging (receivables / payables) ---------- */
function viewAging() {
  const E = S.E; const to = S.params.to || todayAD(); const kind = S.params.k || 'debt'; const parties = E.ledgers.filter(l => inGroup(l, kind === 'debt' ? 'g_debt' : 'g_cred'));
  const sign = kind === 'debt' ? 1 : -1; const buckets = [30, 60, 90, 180, Infinity]; const rows = [];
  parties.forEach(l => {
    const tx = []; if (num(l.ob)) tx.push({ d: booksStart(E), a: sign * num(l.ob) });
    activeVouchers(E).filter(v => v.date <= to).forEach(v => v.lines.filter(x => x.l === l.id).forEach(x => tx.push({ d: v.date, a: sign * (num(x.dr) - num(x.cr)) })));
    tx.sort((a, b) => a.d.localeCompare(b.d)); const open = []; let credit = 0;
    tx.forEach(t => { if (t.a > 0) open.push({ d: t.d, a: t.a }); else credit += -t.a; });
    open.forEach(o => { const u = Math.min(o.a, credit); o.a -= u; credit -= u; });
    const b = [0, 0, 0, 0, 0]; open.forEach(o => { if (o.a < 0.005) return; const age = (new Date(to) - new Date(o.d)) / 864e5; b[buckets.findIndex(x => age <= x)] += o.a; });
    const tot = sum(b) - credit; if (Math.abs(tot) < 0.005) return;
    rows.push({ name: l.name, b0: b[0], b1: b[1], b2: b[2], b3: b[3], b4: b[4], adv: credit, tot, _click: `App.go('ledger',{l:'${l.id}'})`, _cls: 'click' });
  });
  rows.sort((a, b) => b.tot - a.tot); const T = { name: 'Total', _cls: 'tot' }; ['b0', 'b1', 'b2', 'b3', 'b4', 'adv', 'tot'].forEach(k => T[k] = sum(rows, r => r[k]));
  return `<h2>Ageing – ${kind === 'debt' ? 'receivables (debtors)' : 'payables (creditors)'}</h2><div class="seg no-print"><button class="${kind === 'debt' ? 'on' : ''}" onclick="App.setp({k:'debt'})">Receivables</button><button class="${kind === 'cred' ? 'on' : ''}" onclick="App.setp({k:'cred'})">Payables</button></div>
  <div class="row no-print">${dateInput('ag_to', to, 'As on (BS)')}<div class="fit"><button class="btn" onclick="App.setp({to:readDate('ag_to')})">Apply</button></div></div>${rptBtns('ag_t', 'Ageing')}
  <div id="ag_t">${table([{ k: 'name', t: 'Party' }, { k: 'b0', t: '0–30 days', n: 1, f: amtCell }, { k: 'b1', t: '31–60', n: 1, f: amtCell }, { k: 'b2', t: '61–90', n: 1, f: amtCell }, { k: 'b3', t: '91–180', n: 1, f: amtCell }, { k: 'b4', t: '> 180', n: 1, f: amtCell }, { k: 'adv', t: 'Unadjusted advance', n: 1, f: amtCell }, { k: 'tot', t: 'Net balance', n: 1, f: v => fmt(v) }], [...rows, T])}</div><p class="small muted">Payments are adjusted against the oldest bills first (FIFO).</p>`;
}

/* ---------- Stock reports ---------- */
function viewStock() {
  const E = S.E; const { from, to } = period(); const sv = stockValuation(E, to, from); const cat = S.params.cat || ''; const gd = S.params.gd || '';
  const cats = Array.from(new Set(E.items.map(i => i.cat).filter(Boolean))).sort();
  const rows = E.items.filter(i => !cat || i.cat === cat).sort(byName).map(i => { const r = sv.items[i.id]; const q = gd ? (r.gd[gd] || 0) : r.q; return { name: i.name, unit: i.unit, oq: r.oq, ov: r.ov, inq: r.inq, inv: r.inv, outq: r.outq, outv: r.outv, q, v: gd ? '' : r.v, rate: r.rate, _cls: 'click' + (q < 0 ? ' bad' : ''), _click: `App.go('itemledger',{i:'${i.id}'})`, low: num(i.reorder) && q <= num(i.reorder) }; }).filter(r => r.oq || r.inq || r.outq || r.q);
  const T = { name: 'Total', _cls: 'tot' }; ['ov', 'inv', 'outv', 'v'].forEach(k => T[k] = sum(rows, r => r[k]));
  const low = rows.filter(r => r.low), neg = rows.filter(r => r.q < 0);
  return `<h2>Stock summary</h2>${periodFilter('stock', from, to)}<div class="row no-print"><div><label>Category</label><select onchange="App.setp({cat:this.value})"><option value="">All</option>${cats.map(c => `<option ${c === cat ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></div><div><label>Location</label><select onchange="App.setp({gd:this.value})"><option value="">All locations</option>${E.godowns.map(g => `<option value="${g.id}" ${g.id === gd ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select></div><div><label>Valuation method</label><input disabled value="${E.settings.stockMethod === 'FIFO' ? 'FIFO' : 'Weighted average'} (change in Settings)"></div></div>
  ${neg.length ? `<div class="alert r">Negative stock: ${neg.map(r => h(r.name)).join(', ')} – a purchase may be missing.</div>` : ''}${low.length ? `<div class="alert y">At or below re-order level: ${low.map(r => h(r.name)).join(', ')}</div>` : ''}
  <div class="btns no-print"><button class="btn" onclick="exportTable('st_t','Stock_Summary')">Export Excel</button><button class="btn" onclick="window.print()">Print</button><button class="btn" onclick="physicalStock()">Physical stock verification</button></div>${rptHead('Stock Summary', from, to)}
  <div id="st_t">${table([{ k: 'name', t: 'Item' }, { k: 'unit', t: 'Unit' }, { k: 'oq', t: 'Opening qty', n: 1, f: fmtQ }, { k: 'ov', t: 'Opening value', n: 1, f: amtCell }, { k: 'inq', t: 'In qty', n: 1, f: fmtQ }, { k: 'inv', t: 'In value', n: 1, f: amtCell }, { k: 'outq', t: 'Out qty', n: 1, f: fmtQ }, { k: 'outv', t: 'Cost of out', n: 1, f: amtCell }, { k: 'q', t: 'Closing qty', n: 1, f: fmtQ }, { k: 'rate', t: 'Rate', n: 1, f: amtCell }, { k: 'v', t: 'Closing value', n: 1, f: amtCell }], [...rows, T])}</div>`;
}
function viewItemLedger() {
  const E = S.E; const it = I(S.params.i); const { from, to } = period();
  const pick = `<div class="row no-print"><div><label>Item</label><input list="dl_item" value="${h(it ? it.name : '')}" onchange="const x=itemByName(this.value); if(x) App.setp({i:x.id})"></div></div>${ledgerDatalist()}`;
  if (!it) return `<h2>Item ledger</h2>${pick}`;
  const op = stockValuation(E, addDays(from, -1)).items[it.id]; let q = from > booksStart(E) || true ? op.q : 0, v = op.v;
  const rows = [{ d: '', ref: 'Opening', party: '', inq: '', outq: '', q, v }];
  const mv = stockMoves(E).filter(m => m.i === it.id && m.d >= from && m.d <= to && m.d !== '0000');
  mv.forEach(m => { q += m.q; const sv = stockValuation(E, m.d).items[it.id]; rows.push({ d: m.d, ref: m.ref, type: m.vt ? VTYPES[m.vt].t : '', party: m.party, inq: m.q > 0 ? m.q : '', outq: m.q < 0 ? -m.q : '', q, v: sv.v, _click: m.vid ? `viewVoucher('${m.vid}')` : '', _cls: m.vid ? 'click' : '' }); });
  return `<h2>Item ledger: ${h(it.name)}</h2>${pick}${periodFilter('itemledger', from, to)}${rptBtns('il_t', 'Item_' + it.name)}
  <div id="il_t">${table([{ k: 'd', t: 'Date (BS)', f: dBS }, { k: 'ref', t: 'Voucher' }, { k: 'type', t: 'Type' }, { k: 'party', t: 'Party' }, { k: 'inq', t: 'In', n: 1, f: v => v === '' ? '' : fmtQ(v) }, { k: 'outq', t: 'Out', n: 1, f: v => v === '' ? '' : fmtQ(v) }, { k: 'q', t: 'Balance qty', n: 1, f: fmtQ }, { k: 'v', t: 'Balance value (day end)', n: 1, f: v => fmt(v) }], rows)}</div>`;
}
function physicalStock() {
  const E = S.E; const sv = stockValuation(E, todayAD());
  modal('Physical stock verification', `<p class="small muted">Enter counted quantity. Differences are posted as a stock journal dated today.</p><div class="tw" style="max-height:60vh"><table class="t ent"><thead><tr><th>Item</th><th class="n">Book qty</th><th>Physical qty</th></tr></thead><tbody>${E.items.slice().sort(byName).map(i => `<tr><td>${h(i.name)}</td><td class="n">${fmtQ(sv.items[i.id].q)}</td><td><input class="pq" data-i="${i.id}" data-b="${sv.items[i.id].q}"></td></tr>`).join('')}</tbody></table></div>
  <div class="btns"><button class="btn pri" onclick="postPhysical()">Post differences</button></div>`, { wide: true });
}
async function postPhysical() { const st = $$('.pq').filter(i => i.value !== '').map(i => ({ i: i.dataset.i, q: r2(num(i.value) - num(i.dataset.b)), rate: '', gd: (I(i.dataset.i) || {}).gd || 'gd_main' })).filter(s => Math.abs(s.q) > 1e-6); if (!st.length) return toast('No differences'); if (await saveVoucher({ type: 'STJ', date: todayAD(), stock: st, purpose: 'Stock adjustment (physical count)', narration: 'Physical stock verification', lines: [] })) { closeModal(); toast('Stock adjusted'); App.render(); } }

/* ---------- Health check / cross-check ---------- */
function viewHealth() {
  const E = S.E; const { from, to } = period(); const B = ledgerBalances(E, '', to); const issues = []; const add = (lvl, t, d) => issues.push({ lvl, t, d });
  const diff = openingDiff(E); if (Math.abs(diff) > 0.005) add('r', 'Opening balances do not tally', `Difference ${fmtDC(diff)} (including opening stock ${fmt(openingStockValue(E))}). Correct ledger or item opening balances.`);
  const ab = []; E.ledgers.forEach(l => { const c = B[l.id].cl; if (inGroup(l, 'g_cash') && c < -0.005) ab.push(l.name + ' (cash in credit)'); if (inGroup(l, 'g_bank') && c < -0.005) ab.push(l.name + ' (bank overdrawn – move to Bank OD if it is an OD account)'); });
  if (ab.length) add('r', 'Abnormal balances', ab.join('; '));
  const dc = E.ledgers.filter(l => inGroup(l, 'g_debt') && B[l.id].cl < -0.005).map(l => l.name), cd = E.ledgers.filter(l => inGroup(l, 'g_cred') && B[l.id].cl > 0.005).map(l => l.name);
  if (dc.length) add('y', `${dc.length} debtor(s) with credit balance (advance received)`, dc.slice(0, 15).join(', ')); if (cd.length) add('y', `${cd.length} creditor(s) with debit balance (advance paid)`, cd.slice(0, 15).join(', '));
  const neg = negativeItems(E); if (neg.length) add('r', 'Negative stock', neg.join(', '));
  const vr = vatCrossCheck(E, from, to); if (Math.abs(vr.diff) > 1) add('y', 'VAT ledger vs VAT registers differ', `Registers: ${fmt(vr.reg)} · VAT ledger movement: ${fmt(vr.led)} · Difference ${fmt(vr.diff)} (usually from VAT posted through journals).`);
  const susp = E.ledgers.filter(l => inGroup(l, 'g_susp') && Math.abs(B[l.id].cl) > 0.005); if (susp.length) add('y', 'Balance in suspense', susp.map(l => l.name + ' ' + fmtDC(B[l.id].cl)).join(', '));
  const nopan = activeVouchers(E).filter(v => v.date >= from && v.date <= to && v.type === 'PUR' && v.bill && v.bill.taxable > 0 && !v.bill.import && !(v.bill.pan || (L(v.bill.party) || {}).pan)); if (nopan.length) add('y', `${nopan.length} VAT purchase bill(s) without supplier PAN`, 'Input VAT may be disallowed. ' + nopan.slice(0, 10).map(v => v.no).join(', '));
  const seen = {}, dup = []; activeVouchers(E).filter(v => v.type === 'PUR' && v.bill && v.bill.billNo).forEach(v => { const k = v.bill.party + '|' + v.bill.billNo; if (seen[k]) dup.push(v.bill.billNo); seen[k] = 1; }); if (dup.length) add('r', 'Possible duplicate purchase bills', dup.join(', '));
  const big = isINTL() ? [] : activeVouchers(E).filter(v => v.date >= from && v.date <= to && v.lines.some(x => isCashBank(L(x.l)) && inGroup(L(x.l), 'g_cash') && num(x.cr) > 50000) && v.lines.some(x => { const l = L(x.l); return l && natureOf(l) === 'E'; })); if (big.length) add('y', `${big.length} cash expense payment(s) above Rs 50,000`, 'Income Tax Act may disallow such cash expenses – check current limit. ' + big.slice(0, 10).map(v => v.no).join(', '));
  let cash = 0, negDay = ''; const cashIds = E.ledgers.filter(l => inGroup(l, 'g_cash')).map(l => l.id); cash = sum(cashIds, id => num(L(id).ob)); activeVouchers(E).filter(v => v.date <= to).sort((a, b) => a.date.localeCompare(b.date)).forEach(v => { v.lines.forEach(x => { if (cashIds.includes(x.l)) cash += num(x.dr) - num(x.cr); }); if (cash < -0.005 && !negDay) negDay = v.date; }); if (negDay) add('r', 'Cash went negative', 'First on ' + toBS(negDay) + ' – a receipt or withdrawal entry may be missing.');
  const unm = E.ledgers.filter(l => !E.groups.find(g => g.id === l.g)); if (unm.length) add('r', 'Ledgers with missing group', unm.map(l => l.name).join(', '));
  const cf = cashFlowData(E, from, to); if (Math.abs(cf.cash0 + cf.net - cf.cash1) > 0.01) add('y', 'Cash flow does not reconcile', 'Check FS heads in mapping.');
  return `<h2>Health check & cross-verification</h2>${periodFilter('health', from, to)}${issues.length ? issues.map(i => `<div class="alert ${i.lvl}"><b>${h(i.t)}</b><br>${h(i.d)}</div>`).join('') : '<div class="alert g"><b>All checks passed.</b> Trial balance tallies, no negative stock or cash, VAT matches.</div>'}
  <p class="small muted">Checks: opening balance tally, abnormal balances, negative stock & cash, VAT ledger vs registers, suspense, purchases without PAN, duplicate bills, large cash payments, cash flow reconciliation.</p>`;
}

/* ---------- FS mapping ---------- */
function viewMapping() {
  const E = S.E; const { from, to } = period(); const B = ledgerBalances(E, from, to);
  const rows = E.ledgers.slice().sort((a, b) => fsOf(a).localeCompare(fsOf(b)) || byName(a, b)).map(l => ({ id: l.id, name: l.name, grp: groupPath(l.g).map(g => g.name).join(' › '), cl: B[l.id].cl, fs: fsOf(l), own: !!l.fs }));
  return `<h2>Financial statement mapping</h2><p class="muted">Each ledger flows to a line in the NFRS statements through its group. Override any single ledger here, then cross-check with Health check.</p>
  <div class="btns"><button class="btn pri" onclick="saveMapping()">Save mapping</button><button class="btn" onclick="App.go('health')">Run health check</button></div>
  <div class="tw"><table class="t ent"><thead><tr><th>Ledger</th><th>Group</th><th class="n">Balance</th><th>FS head</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.name)}</td><td class="small">${h(r.grp)}</td><td class="n">${fmtDC(r.cl)}</td><td><select class="mp" data-id="${r.id}">${Object.entries(FS_HEADS).map(([k, v]) => `<option value="${k}" ${k === r.fs ? 'selected' : ''}>${v.t}</option>`).join('')}</select>${r.own ? ' <span class="pill b">custom</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
async function saveMapping() { $$('.mp').forEach(s => { const l = L(s.dataset.id); const gfs = (() => { let g = G(l.g); while (g) { if (g.fs) return g.fs; g = g.parent ? G(g.parent) : null; } })(); l.fs = s.value === gfs ? '' : s.value; }); invalidate(); await saveE(); toast('Mapping saved'); App.render(); }

/* ---------- Bank reconciliation ---------- */
function viewBRS() {
  const E = S.E; const banks = E.ledgers.filter(l => inGroup(l, 'g_bank') || inGroup(l, 'g_od')); const bl = L(S.params.l) || banks[0]; const to = S.params.to || todayAD();
  if (!bl) return `<h2>Bank reconciliation</h2><p>Create a bank ledger under "Bank Accounts" first.</p>`;
  const entries = []; activeVouchers(E).filter(v => v.date <= to).forEach(v => v.lines.forEach((x, idx) => { if (x.l === bl.id) entries.push({ v, x, idx }); }));
  entries.sort((a, b) => a.v.date.localeCompare(b.v.date)); const book = r2(num(bl.ob) + sum(entries, e => num(e.x.dr) - num(e.x.cr)));
  const un = entries.filter(e => !e.x.bd || e.x.bd > to); const notPresented = sum(un, e => num(e.x.cr)), notCredited = sum(un, e => num(e.x.dr)); const bank = r2(book + notPresented - notCredited);
  return `<h2>Bank reconciliation</h2><div class="row no-print"><div><label>Bank</label><select onchange="App.setp({l:this.value})">${banks.map(b => `<option value="${b.id}" ${b.id === bl.id ? 'selected' : ''}>${h(b.name)}</option>`).join('')}</select></div>${dateInput('br_to', to, 'As on (BS)')}<div class="fit"><button class="btn" onclick="App.setp({to:readDate('br_to')})">Apply</button></div></div>
  <div class="card"><div class="kv"><div>Balance as per books</div><div>${fmtDC(book)}</div><div>Add: cheques issued but not presented</div><div>${fmt(notPresented)}</div><div>Less: deposits not yet credited by bank</div><div>${fmt(notCredited)}</div><div><b>Balance as per bank statement</b></div><div><b>${fmtDC(bank)}</b></div></div></div>
  <div class="btns no-print"><button class="btn" onclick="brsImport('${bl.id}')">Auto-match with bank statement (Excel)</button><button class="btn pri" onclick="brsSave('${bl.id}')">Save bank dates</button></div>
  <p class="small muted">Enter the date each entry appears in the bank statement (BS). Entries without a bank date are treated as unreconciled.</p>
  <div class="tw"><table class="t ent"><thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th class="n">Deposit</th><th class="n">Withdrawal</th><th>Bank date (BS)</th></tr></thead><tbody>${entries.filter(e => !e.x.bd || e.x.bd >= addDays(to, -90)).map(e => `<tr><td>${toBS(e.v.date)}</td><td>${h(e.v.no)}</td><td>${h(e.v.lines.filter(y => y.l !== bl.id).map(y => (L(y.l) || {}).name).join(', '))} ${h(e.v.refNo || '')}</td><td class="n">${fmt(e.x.dr, 1)}</td><td class="n">${fmt(e.x.cr, 1)}</td><td><input class="bd" data-v="${e.v.id}" data-i="${e.idx}" value="${e.x.bd ? toBS(e.x.bd) : ''}" style="width:120px"></td></tr>`).join('')}</tbody></table></div>`;
}
async function brsSave() { $$('.bd').forEach(i => { const v = S.E.vouchers.find(x => x.id === i.dataset.v); const x = v.lines[+i.dataset.i]; x.bd = i.value ? toAD(i.value) : ''; }); await saveE(); toast('Saved'); App.render(); }
async function brsImport(lid) {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; const rows = await readSheetFile(f); let m = 0;
  const entries = []; activeVouchers(S.E).forEach(v => v.lines.forEach(x => { if (x.l === lid && !x.bd) entries.push({ v, x }); }));
  rows.forEach(r => { const d = parseAnyDate(rowGet(r, 'date', 'txn date', 'value date', 'transaction date')); const dep = num(rowGet(r, 'credit', 'deposit', 'cr')), wd = num(rowGet(r, 'debit', 'withdrawal', 'dr')); if (!d) return; const e = entries.find(e => !e.x.bd && ((dep && Math.abs(num(e.x.dr) - dep) < 0.01) || (wd && Math.abs(num(e.x.cr) - wd) < 0.01)) && Math.abs(new Date(e.v.date) - new Date(d)) <= 10 * 864e5); if (e) { e.x.bd = d; m++; } });
  await saveE(); toast(`${m} entries matched`); App.render();
}
