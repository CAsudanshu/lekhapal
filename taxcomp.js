/* IRD depreciation schedule (pool system) with JE posting, and income tax computation */
'use strict';
const POOLS = { A: 'Buildings, structures & similar', B: 'Computers, office equipment, furniture & fixtures', C: 'Vehicles (auto, bus, minibus etc.)', D: 'Plant, machinery & other tangible assets' };
const POOL_RATES = { A: 5, B: 25, C: 20, D: 15 };

/* =================== DEPRECIATION =================== */
function depFY() { return S.params.fy || S.E.fy || fyOf(todayAD()); }
function depGet(fy) { const E = S.E; E.depn = E.depn || {}; return E.depn[fy] = E.depn[fy] || { pools: { A: {}, B: {}, C: {}, D: {} }, intang: [], rates: { ...POOL_RATES }, credit: 'acc' }; }
function depCalc(D) {
  const out = {}; let tot = 0;
  Object.keys(POOLS).forEach(k => {
    const p = D.pools[k] || {}; const rate = num((D.rates || POOL_RATES)[k]); const adds = num(p.a1) + num(p.a2) + num(p.a3);
    const base = r2(num(p.op) + num(p.a1) + num(p.a2) * 2 / 3 + num(p.a3) / 3 - num(p.sale));
    const dep = base > 0 ? r2(base * rate / 100) : 0; const gain = base < 0 ? r2(-base) : 0;
    const repAllowed = r2(Math.min(num(p.rep), Math.max(0, base) * 0.07)); const repExcess = r2(num(p.rep) - repAllowed);
    const close = r2(Math.max(0, num(p.op) + adds - num(p.sale) - dep) + repExcess);
    out[k] = { ...p, rate, adds, base, dep, gain, repAllowed, repExcess, close }; tot += dep;
  });
  const intang = (D.intang || []).map(x => { const am = num(x.life) ? r2(Math.min(num(x.cost) / num(x.life), Math.max(0, num(x.cost) - num(x.accum)))) : 0; return { ...x, am, close: r2(num(x.cost) - num(x.accum) - am) }; });
  const am = r2(sum(intang, x => x.am));
  return { pools: out, intang, poolDep: r2(tot), am, total: r2(tot + am) };
}
function viewDepreciation() {
  const E = S.E; const fy = depFY(); const D = depGet(fy); const C = depCalc(D); const posted = D.posted && E.vouchers.find(v => v.id === D.posted);
  const fas = E.ledgers.filter(l => inGroup(l, 'g_fa')).sort(byName);
  const inp = (k, f, v) => `<input class="dp" data-k="${k}" data-f="${f}" value="${v === undefined || v === '' ? '' : v}" style="width:105px">`;
  return `<h2>Depreciation schedule (Income Tax Act – pool system)</h2>
  <div class="row no-print card" style="padding:10px"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})">${fyList(E).map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
  <div class="fit"><button class="btn" onclick="depPull('${fy}')">Fill from books</button></div><div class="fit"><button class="btn" onclick="depMapLedgers()">Map asset ledgers to pools (${fas.filter(l => l.pool).length}/${fas.length})</button></div></div>
  <p class="small muted">Additions are counted in full if made in Shrawan–Poush, 2/3 in Magh–Chaitra and 1/3 in Baisakh–Ashadh; the rest goes into next year's opening. Repairs up to 7% of the pool's depreciation base are allowed; any excess is added to the base. Pool rates are editable (check the current Act). "Fill from books" takes opening WDV from last year's schedule (or ledger balances in the first year) and additions/disposals from entries in asset ledgers.</p>
  <div class="tw"><table class="t ent"><thead><tr><th>Pool</th><th>Rate %</th><th>Opening WDV</th><th>Additions Shrawan–Poush</th><th>Magh–Chaitra</th><th>Baisakh–Ashadh</th><th>Sale / disposal</th><th>Repairs incurred</th><th class="n">Depreciation base</th><th class="n">Depreciation</th><th class="n">Repairs allowed</th><th class="n">Closing WDV</th></tr></thead><tbody>
  ${Object.keys(POOLS).map(k => { const r = C.pools[k]; return `<tr><td><b>${k}</b> – ${POOLS[k]}</td><td>${inp(k, 'rate', (D.rates || POOL_RATES)[k])}</td><td>${inp(k, 'op', D.pools[k].op)}</td><td>${inp(k, 'a1', D.pools[k].a1)}</td><td>${inp(k, 'a2', D.pools[k].a2)}</td><td>${inp(k, 'a3', D.pools[k].a3)}</td><td>${inp(k, 'sale', D.pools[k].sale)}</td><td>${inp(k, 'rep', D.pools[k].rep)}</td><td class="n">${fmt(r.base)}${r.gain ? `<br><span class="bad small">Gain ${fmt(r.gain)} taxable</span>` : ''}</td><td class="n">${fmt(r.dep)}</td><td class="n">${fmt(r.repAllowed)}</td><td class="n">${fmt(r.close)}</td></tr>`; }).join('')}
  <tr class="tot"><td colspan="9">Total pools A–D</td><td class="n">${fmt(C.poolDep)}</td><td class="n">${fmt(sum(Object.values(C.pools), r => r.repAllowed))}</td><td class="n">${fmt(sum(Object.values(C.pools), r => r.close))}</td></tr></tbody></table></div>
  <h3>Pool E – intangible assets (amortised over useful life)</h3>
  <div class="tw"><table class="t ent"><thead><tr><th>Asset</th><th>Cost</th><th>Useful life (years)</th><th>Amortised till last year</th><th class="n">This year</th><th class="n">Closing</th><th></th></tr></thead><tbody id="dp_e">${C.intang.map((x, i) => `<tr><td><input data-k="name" value="${h(x.name || '')}"></td><td><input data-k="cost" value="${x.cost || ''}"></td><td><input data-k="life" value="${x.life || ''}"></td><td><input data-k="accum" value="${x.accum || ''}"></td><td class="n">${fmt(x.am)}</td><td class="n">${fmt(x.close)}</td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div>
  <button class="btn sm" onclick="addRowTo('dp_e',['name','cost','life','accum'])">+ Add intangible</button>
  <div class="card" style="margin-top:12px"><div class="kv"><div>Depreciation (pools A–D)</div><div>${fmt(C.poolDep)}</div><div>Amortisation (pool E)</div><div>${fmt(C.am)}</div><div><b>Total charge for FY ${fy}</b></div><div><b>${fmt(C.total)}</b></div><div>Posted journal</div><div>${posted ? `<a href="#" onclick="viewVoucher('${posted.id}');return false">${h(posted.no)}</a> (${fmt(sum(posted.lines, x => x.dr))})${Math.abs(sum(posted.lines, x => x.dr) - C.total) > 0.01 ? ' <span class="pill y">differs – post again to update</span>' : ' <span class="pill g">up to date</span>'}` : 'Not posted yet'}</div></div>
  <div class="row"><div><label>Credit the depreciation to</label><select id="dp_cr"><option value="acc" ${D.credit !== 'asset' ? 'selected' : ''}>"Accumulated Depreciation – Pool X" ledgers (recommended)</option><option value="asset" ${D.credit === 'asset' ? 'selected' : ''}>Directly to the asset ledgers of each pool</option></select></div>${dateInput('dp_date', D.jeDate || fyRange(fy).to, 'Journal date (BS)')}</div>
  <div class="btns no-print"><button class="btn" onclick="depSave('${fy}')">Save & recalculate</button><button class="btn pri" onclick="depPost('${fy}')">${posted ? 'Update' : 'Post'} depreciation journal</button><button class="btn" onclick="window.print()">Print schedule</button></div></div>`;
}
function depRead(fy) {
  const D = depGet(fy); D.rates = D.rates || { ...POOL_RATES };
  $$('.dp').forEach(i => { const k = i.dataset.k, f = i.dataset.f; if (f === 'rate') D.rates[k] = num(i.value); else D.pools[k][f] = i.value === '' ? '' : num(i.value); });
  D.intang = $$('#dp_e tr').map(tr => { const o = {}; $$('input', tr).forEach(i => o[i.dataset.k] = i.dataset.k === 'name' ? i.value.trim() : num(i.value)); return o; }).filter(o => o.name || o.cost);
  D.credit = $('#dp_cr').value; D.jeDate = readDate('dp_date') || fyRange(fy).to; return D;
}
async function depSave(fy) { depRead(fy); await saveE(); toast('Saved'); App.render(); }
function depMapLedgers() {
  const fas = S.E.ledgers.filter(l => inGroup(l, 'g_fa')).sort(byName);
  modal('Map asset ledgers to IRD pools', `<p class="small muted">Tell LekhaPal which pool each fixed-asset ledger belongs to. Mark accumulated depreciation ledgers so they are netted, not counted as additions.</p>${fas.length ? `<div class="tw"><table class="t ent"><thead><tr><th>Ledger</th><th>Pool</th><th>Accumulated depreciation ledger?</th></tr></thead><tbody>${fas.map(l => `<tr><td>${h(l.name)}</td><td><select class="pm" data-id="${l.id}"><option value="">(not depreciable / land)</option>${['A', 'B', 'C', 'D', 'E'].map(k => `<option ${l.pool === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td><td class="center"><input type="checkbox" class="pa" data-id="${l.id}" ${l.accDep ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>` : '<p>No ledgers under Fixed Assets yet.</p>'}
  <div class="btns"><button class="btn pri" onclick="$$('.pm').forEach(s=>L(s.dataset.id).pool=s.value);$$('.pa').forEach(c=>L(c.dataset.id).accDep=c.checked);saveE().then(()=>{closeModal();App.render()})">Save</button></div>`, { wide: true });
}
async function depPull(fy) {
  const E = S.E; const D = depRead(fy); const rg = fyRange(fy); const pfy = (fyStartYear(fy) - 1) + '/' + String(fyStartYear(fy) % 100).padStart(2, '0');
  const prev = E.depn && E.depn[pfy] ? depCalc(E.depn[pfy]) : null; const B = ledgerBalances(E, rg.from, rg.to);
  const mapped = E.ledgers.filter(l => l.pool && inGroup(l, 'g_fa')); if (!mapped.length) { toast('First map your asset ledgers to pools', 1); return depMapLedgers(); }
  Object.keys(POOLS).forEach(k => { const p = D.pools[k] = D.pools[k] || {}; p.op = prev ? prev.pools[k].close : r2(sum(mapped.filter(l => l.pool === k), l => B[l.id].op)); p.a1 = 0; p.a2 = 0; p.a3 = 0; p.sale = 0; });
  activeVouchers(E).filter(v => v.date >= rg.from && v.date <= rg.to && !v.depnFy).forEach(v => (v.lines || []).forEach(x => { const l = L(x.l); if (!l || !l.pool || l.accDep || l.pool === 'E') return; const p = D.pools[l.pool]; const m = bsParts(v.date).m; if (num(x.dr)) { const f = m >= 4 && m <= 9 ? 'a1' : m >= 10 ? 'a2' : 'a3'; p[f] = r2(num(p[f]) + num(x.dr)); } if (num(x.cr)) p.sale = r2(num(p.sale) + num(x.cr)); }));
  if (prev && !D.intang.length) D.intang = prev.intang.map(x => ({ name: x.name, cost: x.cost, life: x.life, accum: r2(num(x.accum) + x.am) }));
  await saveE(); toast('Filled from books – review additions & disposals'); App.render();
}
async function depPost(fy) {
  const E = S.E; const D = depRead(fy); const C = depCalc(D); if (!C.total) return toast('Nothing to post', 1);
  const depL = sysL('depn') || E.ledgers.find(l => l.id === 'l_depn') || (() => { const l = { id: uid('l'), name: 'Depreciation', g: 'g_depn', ob: 0 }; E.ledgers.push(l); return l; })();
  const getAcc = (k, nm, grp) => { let l = E.ledgers.find(x => x.accDep && x.pool === k); if (!l) { l = { id: uid('l'), name: nm, g: grp, ob: 0, pool: k, accDep: true }; E.ledgers.push(l); } return l; };
  const lines = [{ l: depL.id, dr: C.total, cr: 0 }]; const date = D.jeDate || fyRange(fy).to; const B = ledgerBalances(E, '', date);
  Object.keys(POOLS).forEach(k => { const dep = C.pools[k].dep; if (!dep) return;
    if (D.credit === 'asset') { const ls = E.ledgers.filter(l => l.pool === k && !l.accDep && B[l.id].cl > 0); const tot = sum(ls, l => B[l.id].cl); if (ls.length && tot) { let left = dep; ls.forEach((l, i) => { const a = i === ls.length - 1 ? r2(left) : r2(dep * B[l.id].cl / tot); left -= a; lines.push({ l: l.id, dr: 0, cr: a }); }); return; } }
    lines.push({ l: getAcc(k, 'Accumulated Depreciation – Pool ' + k, 'g_fa').id, dr: 0, cr: dep }); });
  if (C.am) lines.push({ l: getAcc('E', 'Accumulated Amortisation – Intangibles', 'g_intang').id, dr: 0, cr: C.am });
  const old = D.posted && E.vouchers.find(v => v.id === D.posted);
  const v = old ? { ...clone(old), date, lines } : { type: 'JV', date, lines, depnFy: fy, narration: `Depreciation for FY ${fy} as per Income Tax Act pool system` };
  if (await saveVoucher(v)) { D.posted = v.id; await saveE(); toast(`Depreciation journal ${v.no} ${old ? 'updated' : 'posted'}`); App.render(); }
}

/* =================== INCOME TAX COMPUTATION =================== */
const TAX_NATURES = {
  company: { t: 'Company, partnership firm or other entity (general)', rate: 25 },
  special30: { t: 'Bank, financial institution, insurance, telecom / ISP, tobacco & alcohol, capital-market business', rate: 30 },
  special20: { t: 'Special industry / concessional business (check eligibility)', rate: 20 },
  coop: { t: 'Cooperative (rate depends on location / type – edit)', rate: 10 },
  npo: { t: 'Tax-exempt NPO (with IRD exemption certificate)', rate: 0 },
  nonres: { t: 'Non-resident person', rate: 25 },
  indiv: { t: 'Resident individual / sole proprietorship (slab rates)', rate: null },
  custom: { t: 'Custom flat rate', rate: 25 },
};
/* Default slabs (Finance Act – verify each year and edit on screen) */
const DEF_SLABS = { single: [[500000, 1], [200000, 10], [300000, 20], [1000000, 30], [3000000, 36], [0, 39]], couple: [[600000, 1], [200000, 10], [300000, 20], [900000, 30], [3000000, 36], [0, 39]] };
function defaultNature(E) { if (/Sole/.test(E.type)) return 'indiv'; if (/NGO|NPO|INGO|Trust/.test(E.type)) return 'npo'; if (/Cooperative/.test(E.type)) return 'coop'; return 'company'; }
function taxGet(fy) { const E = S.E; E.taxc = E.taxc || {}; return E.taxc[fy] = E.taxc[fy] || { nature: defaultNature(E), couple: false, biz: true, adds: [], less: [], intRate: 15, extended: false, growth: 10 }; }
function slabTax(inc, slabs, biz) { let left = inc, tax = 0; const rows = []; slabs.forEach(([amt, rate], i) => { if (left <= 0) return; const part = amt && i < slabs.length - 1 ? Math.min(left, amt) : left; const rt = i === 0 && biz ? 0 : rate; const t = r2(part * rt / 100); rows.push({ part, rt, t }); tax += t; left -= part; }); return { tax: r2(tax), rows }; }
function ledgerMoves(E, test, from, to) { const out = []; activeVouchers(E).filter(v => v.date >= from && v.date <= to && !v.taxFy).forEach(v => v.lines.forEach(x => { const l = L(x.l); if (l && test(l)) out.push({ d: v.date, a: r2(num(x.dr) - num(x.cr)) }); })); return out; }
function taxCompute(E, fy) {
  const T = taxGet(fy); const rg = fyRange(fy); const pl = plData(E, rg.from, rg.to); const Bp = ledgerBalances(E, rg.from, rg.to);
  const bookDep = r2(sum(E.ledgers.filter(l => fsOf(l) === 'DEP'), l => Bp[l.id].dr - Bp[l.id].cr));
  const dsch = E.depn && E.depn[fy] ? depCalc(E.depn[fy]) : null; const taxDep = T.taxDepOv !== undefined && T.taxDepOv !== '' ? num(T.taxDepOv) : (dsch ? dsch.total : bookDep);
  const pbt = T.pbtOv !== undefined && T.pbtOv !== '' ? num(T.pbtOv) : pl.pbt;
  const adds = sum(T.adds, x => x.a), less = sum(T.less, x => x.a); const repairs = dsch ? 0 : 0;
  const adjusted = r2(pbt + bookDep + adds - taxDep - less + repairs);
  const donAllowed = adjusted > 0 ? r2(Math.min(num(T.donation), 100000, adjusted * 0.05)) : 0;
  const lossUsed = r2(Math.min(num(T.lossBf), Math.max(0, adjusted - donAllowed))); const taxable = r2(Math.max(0, adjusted - donAllowed - lossUsed));
  const nat = TAX_NATURES[T.nature] || TAX_NATURES.company; let gross, slabRows = null, rate = null;
  if (T.nature === 'indiv') { const s = slabTax(taxable, T.slabs || DEF_SLABS[T.couple ? 'couple' : 'single'], T.biz); gross = s.tax; slabRows = s.rows; }
  else { rate = T.rateOv !== undefined && T.rateOv !== '' ? num(T.rateOv) : nat.rate; gross = r2(taxable * rate / 100); }
  const rebate = r2(gross * num(T.rebatePct) / 100 + num(T.rebateAmt)); const liability = T.taxOv !== undefined && T.taxOv !== '' ? num(T.taxOv) : r2(Math.max(0, gross - rebate));
  const tdsL = sysL('tdsRec'), advL = E.ledgers.find(l => l.id === 'l_advtax') || E.ledgers.find(l => /advance (income )?tax/i.test(l.name));
  const tdsMoves = tdsL ? ledgerMoves(E, l => l.id === tdsL.id, rg.from, rg.to).filter(m => m.a > 0) : [], advMoves = advL ? ledgerMoves(E, l => l.id === advL.id, rg.from, rg.to).filter(m => m.a > 0) : [];
  const tds = T.tdsOv !== undefined && T.tdsOv !== '' ? num(T.tdsOv) : r2(sum(tdsMoves, m => m.a)); const adv = T.advOv !== undefined && T.advOv !== '' ? num(T.advOv) : r2(sum(advMoves, m => m.a));
  const balance = r2(liability - tds - adv); const ir = num(T.intRate || 15) / 100; const y = fyStartYear(fy);
  const inst = [[bsMonthEnd(y, 9), 40], [bsMonthEnd(y, 12), 70], [bsMonthEnd(y + 1, 3), 100]].map(([bs, pct]) => { const ad = toAD(bs); const paid = r2(sum([...tdsMoves, ...advMoves].filter(m => m.d <= ad), m => m.a)); const req = r2(liability * pct / 100); const short = Math.max(0, r2(req - paid)); const days = Math.max(0, (new Date(rg.to) - new Date(ad)) / 864e5); return { bs, pct, req, paid, short, days, int: r2(short * ir * days / 365) }; });
  const paidPct = liability ? (tds + adv) / liability * 100 : 100; const int118 = paidPct < 90 ? r2(sum(inst, x => x.int)) : 0;
  const dueBS = T.extended ? bsMonthEnd(y + 1, 9) : bsMonthEnd(y + 1, 6); const dueAD = toAD(dueBS);
  const payAD = T.paid ? toAD(T.paid) : ''; const int119 = balance > 0 && payAD && payAD > toAD(bsMonthEnd(y + 1, 6)) ? r2(balance * ir * (new Date(payAD) - new Date(toAD(bsMonthEnd(y + 1, 6)))) / 864e5 / 365) : 0;
  const fileAD = T.filed ? toAD(T.filed) : ''; const lateM = fileAD && fileAD > dueAD ? Math.ceil((new Date(fileAD) - new Date(dueAD)) / 864e5 / 30.4) : 0; const fee117 = lateM ? r2(Math.max(adjusted * 0.001 * lateM / 12, 100 * lateM)) : 0;
  const est = r2(liability * (1 + num(T.growth) / 100)); const ny = y + 1; const plan = [[bsMonthEnd(ny, 9), 40], [bsMonthEnd(ny, 12), 70], [bsMonthEnd(ny + 1, 3), 100]].map(([bs, p]) => ({ bs, cum: r2(est * p / 100) }));
  return { T, pl, pbt, bookDep, taxDep, dsch, adds, less, adjusted, donAllowed, lossUsed, taxable, gross, slabRows, rate, rebate, liability, tds, adv, balance, inst, paidPct, int118, int119, fee117, lateM, dueBS, est, plan, nat, advL, tdsL };
}
function viewTaxComp() {
  const E = S.E; const fy = depFY(); const R = taxCompute(E, fy); const T = R.T; const posted = T.posted && E.vouchers.find(v => v.id === T.posted);
  const ov = (k, auto, label) => `<tr><td>${label}</td><td class="n">${fmt(auto)}</td><td><input class="tov" data-k="${k}" value="${T[k] ?? ''}" placeholder="auto" style="width:130px"></td></tr>`;
  const adj = (k, title) => `<h3>${title}</h3><div class="tw"><table class="t ent"><tbody id="tx_${k}">${(T[k] || []).map(x => `<tr><td><input data-k="t" value="${h(x.t)}"></td><td><input data-k="a" value="${x.a}"></td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" onclick="addRowTo('tx_${k}',['t','a'])">+ Add line</button>`;
  const line = (t, v, cls) => `<tr class="${cls || ''}"><td>${t}</td><td class="n">${fmt(v)}</td></tr>`;
  return `<h2>Income tax computation – FY ${fy}</h2><div class="row no-print card" style="padding:10px"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})">${fyList(E).map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div><div class="fit"><button class="btn" onclick="App.go('depreciation',{fy:'${fy}'})">Depreciation schedule</button></div></div>
  <div class="grid2 no-print"><div class="card"><h3>Taxpayer</h3><label>Nature of taxable person</label><select id="tx_nat">${Object.entries(TAX_NATURES).map(([k, v]) => `<option value="${k}" ${T.nature === k ? 'selected' : ''}>${v.t}${v.rate !== null ? ' – ' + v.rate + '%' : ''}</option>`).join('')}</select>
  ${T.nature === 'indiv' ? `<label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="tx_cp" ${T.couple ? 'checked' : ''}> Married – opted for couple assessment</label><label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="tx_biz" ${T.biz ? 'checked' : ''}> Income is from business (first slab at 0% instead of 1% social security tax)</label>
  <label>Slabs (amount : rate %, last line = remaining income)</label><textarea id="tx_slabs" rows="6">${(T.slabs || DEF_SLABS[T.couple ? 'couple' : 'single']).map(([a, r]) => a + ' : ' + r).join('\n')}</textarea>` : `<label>Tax rate % (blank = ${R.nat.rate}%)</label><input id="tx_rate" class="tov" data-k="rateOv" value="${T.rateOv ?? ''}" placeholder="${R.nat.rate}">`}
  <p class="small muted">Rates and slabs are defaults – verify against the Finance Act for FY ${fy} and edit here if they changed.</p></div>
  <div class="card"><h3>Other inputs</h3><div class="grid2"><div><label>Donations paid to approved organisations</label><input id="tx_don" value="${T.donation || ''}"></div><div><label>Loss brought forward (last 7 years)</label><input id="tx_loss" value="${T.lossBf || ''}"></div><div><label>Rebate / concession % of tax</label><input id="tx_rp" value="${T.rebatePct || ''}"></div><div><label>Rebate amount (Rs)</label><input id="tx_ra" value="${T.rebateAmt || ''}"></div><div><label>Interest rate % (Sec 118/119)</label><input id="tx_ir" value="${T.intRate ?? 15}"></div><div><label>Growth % for next year's estimate</label><input id="tx_gr" value="${T.growth ?? 10}"></div><div><label>Return filed on (BS)</label><input id="tx_fd" value="${h(T.filed || '')}" placeholder="2084-06-25"></div><div><label>Balance tax paid on (BS)</label><input id="tx_pd" value="${h(T.paid || '')}" placeholder="2084-06-25"></div></div>
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="tx_ext" ${T.extended ? 'checked' : ''}> Time extension for return obtained (due end of Poush)</label></div></div>
  <div class="grid2 no-print"><div class="card">${adj('adds', 'Add back – disallowed / inadmissible expenses')}<p class="small muted">e.g. fines & penalties, personal expenses, provisions, cash payments above the limit, expenses without bills.</p></div><div class="card">${adj('less', 'Less – exempt / separately taxed income, other deductions')}<p class="small muted">e.g. dividend (final withholding), interest taxed at source as final, capital gain taxed separately, pension/insurance deductions.</p></div></div>
  <div class="card no-print"><h3>Auto figures (type a value to override)</h3><div class="tw"><table class="t ent"><thead><tr><th>Item</th><th class="n">From books</th><th>Override</th></tr></thead><tbody>${ov('pbtOv', R.pl.pbt, 'Net profit before tax as per P&L')}${ov('taxDepOv', R.dsch ? R.dsch.total : R.bookDep, 'Depreciation as per Income Tax Act' + (R.dsch ? ' (schedule)' : ' (no schedule – using book)'))}${ov('tdsOv', R.tds, 'TDS deducted by others (TDS Receivable)')}${ov('advOv', R.adv, 'Advance tax paid')}${ov('taxOv', R.liability, 'Tax liability (override final tax)')}</tbody></table></div>
  <div class="btns"><button class="btn pri" onclick="taxSave('${fy}')">Save & calculate</button></div></div>
  <div id="tx_out" class="card"><h3 class="center">${h(E.name)} – PAN ${h(E.legal.pan || '')}<br>Computation of taxable income & tax – FY ${fy}</h3><table class="t"><tbody>
  ${line('Net profit before tax as per books', R.pbt)}${line('Add: depreciation charged in books', R.bookDep)}${(T.adds || []).map(x => line('Add: ' + h(x.t), x.a)).join('')}${line('Less: depreciation as per Income Tax Act', -R.taxDep)}${(T.less || []).map(x => line('Less: ' + h(x.t), -x.a)).join('')}
  ${line('Adjusted taxable income / assessable income', R.adjusted, 'tot')}${R.donAllowed ? line('Less: donation allowed (lower of actual, 5% of income, Rs 1,00,000)', -R.donAllowed) : ''}${R.lossUsed ? line('Less: loss brought forward set off', -R.lossUsed) : ''}${R.adjusted < 0 ? line('Loss for the year – carry forward (up to 7 years)', -R.adjusted) : ''}${line('Taxable income', R.taxable, 'tot')}
  ${R.slabRows ? R.slabRows.map(s => line(`Tax on ${fmt(s.part)} @ ${s.rt}%`, s.t)).join('') : line(`Tax @ ${R.rate}%`, R.gross)}${R.rebate ? line('Less: rebate / concession', -R.rebate) : ''}${line('Tax liability', R.liability, 'tot')}
  ${line('Less: TDS deducted at source', -R.tds)}${line('Less: advance tax paid', -R.adv)}${line(R.balance >= 0 ? 'Balance tax payable' : 'Tax refundable / carried forward', R.balance, 'tot')}
  ${line('Interest u/s 118 – shortfall in advance tax' + (R.paidPct >= 90 ? ' (not applicable: 90%+ paid)' : ''), R.int118)}${line('Interest u/s 119 – late payment of tax', R.int119)}${line(`Fee u/s 117 – late return${R.lateM ? ' (' + R.lateM + ' month(s))' : ''}`, R.fee117)}
  ${line('Total payable with return', Math.max(0, R.balance) + R.int118 + R.int119 + R.fee117, 'tot')}</tbody></table>
  <h3>Advance tax instalments for FY ${fy}</h3>${table([{ k: 'bs', t: 'Due (BS)' }, { k: 'pct', t: 'Cumulative %', n: 1 }, { k: 'req', t: 'Required', n: 1, f: v => fmt(v) }, { k: 'paid', t: 'Paid by then (TDS + advance)', n: 1, f: v => fmt(v) }, { k: 'short', t: 'Shortfall', n: 1, f: v => fmt(v) }, { k: 'int', t: 'Interest', n: 1, f: v => fmt(v) }], R.inst)}
  <h3>Advance tax plan for next year (estimated tax ${fmt(R.est)})</h3>${table([{ k: 'bs', t: 'Pay by (BS)' }, { k: 'cum', t: 'Cumulative amount', n: 1, f: v => fmt(v) }], R.plan)}
  <p class="small muted">Return due ${R.dueBS} BS. Interest/fee are estimates using the rules programmed here (15% p.a.; fee = higher of 0.1% of assessable income p.a. or Rs 100 per month) – confirm with the current Act.</p></div>
  <div class="card no-print"><h3>Post tax entries</h3><p>Posted: ${posted ? `<a href="#" onclick="viewVoucher('${posted.id}');return false">${h(posted.no)}</a>` : 'not yet'}</p><label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="tx_setoff" checked> Also adjust TDS receivable and advance tax against the liability</label>
  <div class="btns"><button class="btn pri" onclick="taxPost('${fy}')">${posted ? 'Update' : 'Post'} income tax journal</button><button class="btn" onclick="window.print()">Print computation</button><button class="btn" onclick="exportTable('tx_out','Tax_Computation_${fy.replace('/', '-')}')">Export Excel</button></div></div>`;
}
function taxRead(fy) {
  const T = taxGet(fy); T.nature = $('#tx_nat').value; if ($('#tx_cp')) { T.couple = $('#tx_cp').checked; T.biz = $('#tx_biz').checked; const sl = $('#tx_slabs').value.split('\n').map(x => x.split(':').map(y => num(y))).filter(x => x.length === 2); const def = DEF_SLABS[T.couple ? 'couple' : 'single']; T.slabs = JSON.stringify(sl) === JSON.stringify(def) ? undefined : sl; }
  T.donation = num($('#tx_don').value); T.lossBf = num($('#tx_loss').value); T.rebatePct = num($('#tx_rp').value); T.rebateAmt = num($('#tx_ra').value); T.intRate = num($('#tx_ir').value) || 15; T.growth = num($('#tx_gr').value); T.filed = $('#tx_fd').value.trim(); T.paid = $('#tx_pd').value.trim(); T.extended = $('#tx_ext').checked;
  $$('.tov').forEach(i => T[i.dataset.k] = i.value.trim() === '' ? '' : num(i.value));
  ['adds', 'less'].forEach(k => T[k] = $$('#tx_' + k + ' tr').map(tr => ({ t: $('[data-k=t]', tr).value.trim(), a: num($('[data-k=a]', tr).value) })).filter(x => x.t || x.a));
  return T;
}
async function taxSave(fy) { taxRead(fy); await saveE(); toast('Calculated'); App.render(); }
async function taxPost(fy) {
  const E = S.E; const T = taxRead(fy); const R = taxCompute(E, fy); if (!R.liability && !R.tds && !R.adv) return toast('No tax to post', 1);
  const exp = E.ledgers.find(l => l.id === 'l_itexp') || E.ledgers.find(l => fsOf(l) === 'TAX'), pay = E.ledgers.find(l => l.id === 'l_itpay') || E.ledgers.find(l => fsOf(l) === 'CTL'); if (!exp || !pay) return toast('Income tax expense / payable ledgers missing', 1);
  const lines = []; if (R.liability) lines.push({ l: exp.id, dr: R.liability, cr: 0 }, { l: pay.id, dr: 0, cr: R.liability });
  if ($('#tx_setoff').checked) { const so = r2(R.tds + R.adv); if (so) { lines.push({ l: pay.id, dr: so, cr: 0 }); if (R.tds && R.tdsL) lines.push({ l: R.tdsL.id, dr: 0, cr: R.tds }); if (R.adv && R.advL) lines.push({ l: R.advL.id, dr: 0, cr: R.adv }); } }
  const old = T.posted && E.vouchers.find(v => v.id === T.posted); const date = fyRange(fy).to; const ml = mergeLines(lines);
  const v = old ? { ...clone(old), lines: ml } : { type: 'JV', date, lines: ml, taxFy: fy, narration: `Income tax provision for FY ${fy}` };
  if (await saveVoucher(v)) { T.posted = v.id; await saveE(); toast('Tax journal ' + v.no + (old ? ' updated' : ' posted')); App.render(); }
}
