/* International edition: country presets, entity creation for both editions, generic compliance,
   asset-class depreciation and corporate tax computation (IFRS world). Nepal edition keeps its own screens. */
'use strict';

/* Country presets – defaults only, every value can be edited per entity (check current local law). */
const COUNTRIES = {
  'United Arab Emirates': { cur: 'AED', sym: 'AED', major: 'Dirhams', minor: 'Fils', taxName: 'VAT', rate: 5, taxIdLabel: 'TRN', fyStart: 1, ct: 9, ctFree: 375000, freq: 'Q', retDays: 28, ctDue: 9 },
  'Saudi Arabia': { cur: 'SAR', sym: 'SAR', major: 'Riyals', minor: 'Halalas', taxName: 'VAT', rate: 15, taxIdLabel: 'VAT No.', fyStart: 1, ct: 20, freq: 'M', retDays: 30, ctDue: 4 },
  'Qatar': { cur: 'QAR', sym: 'QAR', major: 'Riyals', minor: 'Dirhams', taxName: 'VAT', rate: 0, taxIdLabel: 'Tax ID', fyStart: 1, ct: 10, freq: 'Q', retDays: 30, ctDue: 4 },
  'Oman': { cur: 'OMR', sym: 'OMR', major: 'Rials', minor: 'Baisa', taxName: 'VAT', rate: 5, taxIdLabel: 'VATIN', fyStart: 1, ct: 15, freq: 'Q', retDays: 30, ctDue: 4 },
  'Bahrain': { cur: 'BHD', sym: 'BHD', major: 'Dinars', minor: 'Fils', taxName: 'VAT', rate: 10, taxIdLabel: 'VAT No.', fyStart: 1, ct: 0, freq: 'Q', retDays: 30, ctDue: 5 },
  'Kuwait': { cur: 'KWD', sym: 'KWD', major: 'Dinars', minor: 'Fils', taxName: 'VAT', rate: 0, taxIdLabel: 'Tax ID', fyStart: 1, ct: 15, freq: 'Q', retDays: 30, ctDue: 4 },
  'India': { cur: 'INR', sym: '₹', major: 'Rupees', minor: 'Paise', taxName: 'GST', rate: 18, taxIdLabel: 'GSTIN', fyStart: 4, ct: 25, freq: 'M', retDays: 20, ctDue: 7, locale: 'en-IN' },
  'United Kingdom': { cur: 'GBP', sym: '£', major: 'Pounds', minor: 'Pence', taxName: 'VAT', rate: 20, taxIdLabel: 'VAT Reg. No.', fyStart: 4, ct: 25, freq: 'Q', retDays: 37, ctDue: 12 },
  'United States': { cur: 'USD', sym: '$', major: 'Dollars', minor: 'Cents', taxName: 'Sales Tax', rate: 0, taxIdLabel: 'EIN', fyStart: 1, ct: 21, freq: 'Q', retDays: 20, ctDue: 4 },
  'Australia': { cur: 'AUD', sym: 'A$', major: 'Dollars', minor: 'Cents', taxName: 'GST', rate: 10, taxIdLabel: 'ABN', fyStart: 7, ct: 25, freq: 'Q', retDays: 28, ctDue: 7 },
  'Singapore': { cur: 'SGD', sym: 'S$', major: 'Dollars', minor: 'Cents', taxName: 'GST', rate: 9, taxIdLabel: 'GST Reg. No.', fyStart: 1, ct: 17, freq: 'Q', retDays: 30, ctDue: 11 },
  'Malaysia': { cur: 'MYR', sym: 'RM', major: 'Ringgit', minor: 'Sen', taxName: 'SST', rate: 10, taxIdLabel: 'SST No.', fyStart: 1, ct: 24, freq: 'M', retDays: 30, ctDue: 7 },
  'Bangladesh': { cur: 'BDT', sym: 'Tk', major: 'Taka', minor: 'Poisha', taxName: 'VAT', rate: 15, taxIdLabel: 'BIN', fyStart: 7, ct: 27.5, freq: 'M', retDays: 15, ctDue: 6 },
  'Sri Lanka': { cur: 'LKR', sym: 'Rs', major: 'Rupees', minor: 'Cents', taxName: 'VAT', rate: 18, taxIdLabel: 'TIN', fyStart: 4, ct: 30, freq: 'M', retDays: 20, ctDue: 8 },
  'Other country': { cur: 'USD', sym: '$', major: 'Dollars', minor: 'Cents', taxName: 'VAT', rate: 0, taxIdLabel: 'Tax ID', fyStart: 1, ct: 0, freq: 'Q', retDays: 30, ctDue: 6 },
};
const ENTITY_TYPES_INTL = ['Private Limited Company', 'Public Limited Company', 'Limited Liability Partnership (LLP)', 'Partnership', 'Sole Proprietorship / Sole Trader', 'Free Zone Company / Branch', 'Non-profit / Charity / Trust', 'Cooperative', 'Other'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Which editions may this install use? Licence field "ed": NP | INTL | ALL. Old keys = Nepal. Trial = both. */
function allowedEditions() { const L = S.license; const ed = L ? (L.ed || 'NP') : 'ALL'; return ed === 'ALL' ? ['NP', 'INTL'] : [ed]; }
const ED_NAME = { NP: 'Nepal edition', INTL: 'International edition', ALL: 'Nepal + International' };

/* ---------- create entity (both editions) ---------- */
window.editEntity = function () {
  if (!guardWrite()) return; window._newBkDir = null;
  const lic = licenseState(); if (lic.maxEntities && S.entities.filter(e => !e.isFirm).length >= lic.maxEntities) return toast(`Your licence allows ${lic.maxEntities} entities`, 1);
  const eds = allowedEditions(); const cs = Object.keys(COUNTRIES);
  modal('New entity', `<label>Legal name</label><input id="ne_name">
  ${eds.length > 1 ? `<label>Edition</label><div class="seg" id="ne_ed"><button class="on" data-ed="NP" onclick="neEd('NP')">🇳🇵 Nepal (BS dates, NPR, VAT/PAN/TDS, NFRS)</button><button data-ed="INTL" onclick="neEd('INTL')">🌍 International (any country, IFRS)</button></div>` : `<input type="hidden" id="ne_edv" value="${eds[0]}"><p class="small muted">${ED_NAME[eds[0]]}</p>`}
  <div id="ne_np" ${eds[0] === 'INTL' && eds.length === 1 ? 'style="display:none"' : ''}><div class="row"><div><label>Type</label><select id="ne_type">${ENTITY_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div><div><label>PAN / VAT number</label><input id="ne_pan" maxlength="9"></div></div>
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="ne_vat" checked> Registered for VAT</label></div>
  <div id="ne_in" style="${eds[0] === 'INTL' && eds.length === 1 ? '' : 'display:none'}"><div class="row"><div><label>Country</label><select id="ni_c" onchange="niCountry()">${cs.map(c => `<option>${c}</option>`).join('')}</select></div><div><label>Type</label><select id="ni_type">${ENTITY_TYPES_INTL.map(t => `<option>${t}</option>`).join('')}</select></div></div>
  <div class="row"><div><label>Currency code</label><input id="ni_cur"></div><div><label>Symbol</label><input id="ni_sym"></div><div><label>Indirect tax name</label><input id="ni_tax" list="dl_taxn"><datalist id="dl_taxn"><option value="VAT"><option value="GST"><option value="Sales Tax"><option value="SST"></datalist></div><div><label>Standard rate %</label><input id="ni_rate"></div></div>
  <div class="row"><div><label>Tax ID label</label><input id="ni_tid"></div><div><label>Tax registration number</label><input id="ni_pan"></div><div><label>Financial year starts in</label><select id="ni_fy">${MONTHS_FULL.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div></div></div>
  <label>Address</label><input id="ne_addr">
  ${window.showDirectoryPicker ? `<label>Daily automatic backup folder (optional – can be changed later in Settings)</label><div class="row"><div class="fit"><button class="btn" type="button" onclick="chooseBackupFolder('__new')">Choose folder</button></div><div><span id="ne_bkname" class="muted">none selected</span></div></div>` : ''}
  <label>Copy chart of accounts from (optional)</label><select id="ne_copy"><option value="">Standard chart of accounts</option>${S.entities.map(e => `<option value="${e.id}">${h(e.name)}</option>`).join('')}</select>
  <div class="btns"><button class="btn pri" onclick="createEntity()">Create</button></div>`);
  niCountry();
};
function neEd(ed) { $$('#ne_ed button').forEach(b => b.classList.toggle('on', b.dataset.ed === ed)); $('#ne_np').style.display = ed === 'NP' ? '' : 'none'; $('#ne_in').style.display = ed === 'INTL' ? '' : 'none'; }
function niCountry() { const c = COUNTRIES[$('#ni_c').value]; if (!c) return; $('#ni_cur').value = c.cur; $('#ni_sym').value = c.sym; $('#ni_tax').value = c.taxName; $('#ni_rate').value = c.rate; $('#ni_tid').value = c.taxIdLabel; $('#ni_fy').value = c.fyStart; }
function chosenEdition() { const seg = $('#ne_ed .on'); return seg ? seg.dataset.ed : ($('#ne_edv') ? $('#ne_edv').value : 'NP'); }
function applyIntl(E, I) {
  E.edition = 'INTL'; E.intl = I; E.type = I.type || E.type; E.settings.vatRate = num(I.rate); E.legal.vatReg = num(I.rate) > 0 || !!E.legal.pan;
  const rn = (id, n) => { const l = E.ledgers.find(x => x.id === id); if (l) l.name = n; };
  rn('l_vat', I.taxName + ' Account'); rn('l_tdspay', 'Withholding Tax Payable'); rn('l_tdsrec', 'Withholding Tax Receivable'); rn('l_advtax', 'Tax Paid in Advance'); rn('l_ssf', 'Pension / Social Security (Employer)'); rn('l_excise', 'Excise / Other Duties Payable'); rn('l_customs', 'Customs & Import Charges');
  S._cfgE = E; E.fy = fyOf(todayAD(), E); S._cfgE = null;
}
window.createEntity = async function () {
  const name = $('#ne_name').value.trim(); if (!name) return toast('Enter name', 1); const ed = chosenEdition();
  let E;
  if (ed === 'INTL') {
    const I = { country: $('#ni_c').value, cur: $('#ni_cur').value.trim().toUpperCase() || 'USD', sym: $('#ni_sym').value.trim() || '$', taxName: $('#ni_tax').value.trim() || 'VAT', rate: num($('#ni_rate').value), taxIdLabel: $('#ni_tid').value.trim() || 'Tax ID', fyStart: num($('#ni_fy').value) || 1, type: $('#ni_type').value };
    const P = COUNTRIES[I.country] || {}; Object.assign(I, { major: P.major || 'Dollars', minor: P.minor || 'Cents', locale: P.locale || 'en-US', ct: P.ct || 0, ctFree: P.ctFree || 0, freq: P.freq || 'Q', retDays: P.retDays || 30, ctDue: P.ctDue || 6 });
    E = newEntityObject({ name, type: I.type, legal: { pan: $('#ni_pan').value.trim(), vatReg: I.rate > 0, address: $('#ne_addr').value.trim() } }); applyIntl(E, I);
  } else E = newEntityObject({ name, type: $('#ne_type').value, legal: { pan: $('#ne_pan').value.trim(), vatReg: $('#ne_vat').checked, address: $('#ne_addr').value.trim() } });
  if (!E.edition) E.edition = 'NP';
  const copy = $('#ne_copy').value; if (copy) { const src = await DB.get('entities', copy); if (src) { E.groups = clone(src.groups); E.ledgers = src.ledgers.filter(l => !isPartyIn(src, l)).map(l => ({ ...l, ob: 0 })); E.items = src.items.map(i => ({ ...i, oq: 0, orate: 0 })); E.godowns = clone(src.godowns); } }
  S.entities.push({ id: E.id, name: E.name, type: E.type, pan: E.legal.pan, updated: todayAD(), edition: E.edition }); await saveEntities();
  if (S.user.entities !== 'all' && S.user.role !== 'admin') { S.user.entities.push(E.id); await saveUsers(); }
  await DB.put('entities', E.id, E); if (window._newBkDir) { await DB.put('kv', 'bkdir:' + E.id, window._newBkDir); window._newBkDir = null; if (!S.settings.backupPass) await askBackupPass(); runDailyBackups(true); }
  closeModal(); toast('Entity created'); openEntity(E.id);
};

/* ---------- international settings card (shown in Settings) ---------- */
function intlSettingsCard(E) {
  const I = E.intl || {}; const i = (k, t, v) => `<div><label>${t}</label><input id="is_${k}" value="${h(v ?? '')}"></div>`;
  return `<div class="card"><h3>Country, currency & tax – ${h(E.name)}</h3><div class="grid3">
  <div><label>Country</label><select id="is_country">${Object.keys(COUNTRIES).map(c => `<option ${c === I.country ? 'selected' : ''}>${c}</option>`).join('')}</select></div>${i('cur', 'Currency code', I.cur)}${i('sym', 'Currency symbol', I.sym)}${i('major', 'Currency name in words (e.g. Dirhams)', I.major)}${i('minor', 'Sub-unit in words (e.g. Fils)', I.minor)}
  <div><label>Number format</label><select id="is_locale"><option value="en-US" ${I.locale !== 'en-IN' ? 'selected' : ''}>1,234,567.00</option><option value="en-IN" ${I.locale === 'en-IN' ? 'selected' : ''}>12,34,567.00</option></select></div>
  ${i('taxName', 'Indirect tax name (VAT / GST / Sales Tax)', I.taxName)}${i('taxIdLabel', 'Tax ID label (TRN / VAT No. / GSTIN)', I.taxIdLabel)}<div><label>Financial year starts in</label><select id="is_fyStart">${MONTHS_FULL.map((m, k) => `<option value="${k + 1}" ${num(I.fyStart) === k + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
  <div><label>Tax return frequency</label><select id="is_freq"><option value="M" ${I.freq === 'M' ? 'selected' : ''}>Monthly</option><option value="Q" ${I.freq !== 'M' ? 'selected' : ''}>Quarterly</option></select></div>${i('retDays', 'Return due – days after period end', I.retDays)}${i('ct', 'Corporate / income tax rate %', I.ct)}${i('ctFree', 'Income exempt from tax (threshold)', I.ctFree)}${i('ctDue', 'Income tax return due – months after year end', I.ctDue)}</div>
  <p class="small muted">Presets are defaults – confirm rates and deadlines with current local law. Changing the financial-year month re-labels years in reports.</p><div class="btns"><button class="btn pri" onclick="saveIntlSettings()">Save country & tax settings</button></div></div>`;
}
async function saveIntlSettings() {
  const E = S.E; const I = E.intl = E.intl || {}; ['cur', 'sym', 'major', 'minor', 'taxName', 'taxIdLabel'].forEach(k => I[k] = $('#is_' + k).value.trim()); I.country = $('#is_country').value; I.locale = $('#is_locale').value;
  ['fyStart', 'retDays', 'ct', 'ctFree', 'ctDue'].forEach(k => I[k] = num($('#is_' + k).value)); I.freq = $('#is_freq').value; I.cur = I.cur.toUpperCase();
  const vl = E.ledgers.find(l => l.id === 'l_vat'); if (vl) vl.name = I.taxName + ' Account'; E.fy = fyOf(todayAD(), E); invalidate(); await saveE(); toast('Saved'); App.render();
}

/* ---------- compliance (international) ---------- */
window.complianceDue = (orig => function (E) {
  if (!isINTL(E)) return orig(E);
  const I = E.intl || {}; const out = []; const today = todayAD(); const fy = fyOf(today, E); const rg = fyRange(fy, E); const months = fyMonths(fy); const per = I.freq === 'M' ? 1 : 3;
  for (let k = 0; k < 12; k += per) { const end = monthRange(months[k + per - 1]).to; const due = addDays(end, num(I.retDays) || 30); if (due >= today) { out.push({ d: due, w: `${I.taxName || 'VAT'} return & payment for ${monthLabel(months[k])}${per > 1 ? ' – ' + monthLabel(months[k + per - 1]) : ''}` }); if (out.length >= 2) break; } }
  const prevEnd = addDays(rg.from, -1); const ctd = (() => { const d = new Date(prevEnd + 'T00:00:00'); d.setMonth(d.getMonth() + (num(I.ctDue) || 6)); return isoOf(d); })();
  out.push({ d: ctd >= today ? ctd : (() => { const d = new Date(rg.to + 'T00:00:00'); d.setMonth(d.getMonth() + (num(I.ctDue) || 6)); return isoOf(d); })(), w: 'Income / corporate tax return (financial year ended ' + (ctd >= today ? prevEnd : rg.to) + ')' });
  out.push({ d: rg.to, w: 'Financial year end – close books, stock count, audit preparation' });
  (E.legal.licenses || []).forEach(l => { if (l.expiry) { const d = parseAnyDate(l.expiry); if (d) out.push({ d, w: `Renew: ${l.name} ${l.no ? '(' + l.no + ')' : ''}` }); } });
  return out.map(o => ({ ...o, ad: o.d, past: o.d < today })).filter(o => o.ad).sort((a, b) => a.d.localeCompare(b.d));
})(window.complianceDue);

/* ---------- depreciation by asset class (international, IAS 16 style) ---------- */
const DEF_CLASSES = [['Buildings', 'SLM', 5], ['Plant & machinery', 'SLM', 10], ['Furniture & fixtures', 'SLM', 10], ['Computers & IT equipment', 'SLM', 33.33], ['Motor vehicles', 'SLM', 20], ['Office equipment', 'SLM', 20], ['Intangible assets', 'SLM', 20]];
function depIGet(fy) { const E = S.E; E.depnI = E.depnI || {}; return E.depnI[fy] = E.depnI[fy] || { classes: DEF_CLASSES.map(([name, m, r]) => ({ name, m, r })), credit: 'acc' }; }
function depICalc(D, fy) {
  const rg = fyRange(fy); const fyDays = (new Date(rg.to) - new Date(rg.from)) / 864e5 + 1;
  const rows = D.classes.map(c => { const adds = (c.adds || []); const addAmt = r2(sum(adds, a => a.a)); const addDep = r2(sum(adds, a => num(a.a) * num(c.r) / 100 * Math.max(0, (new Date(rg.to) - new Date(a.d || rg.from)) / 864e5 + 1) / fyDays));
    const baseOpen = c.m === 'WDV' ? Math.max(0, num(c.nbv) - num(c.disp)) : num(c.cost); const depOpen = r2(baseOpen * num(c.r) / 100); const maxDep = Math.max(0, num(c.nbv) - num(c.disp) + addAmt);
    const dep = r2(Math.min(maxDep, depOpen + addDep)); return { ...c, addAmt, dep, close: r2(num(c.nbv) + addAmt - num(c.disp) - dep) }; });
  return { rows, total: r2(sum(rows, r => r.dep)) };
}
function viewDepreciationIntl() {
  const E = S.E; const fy = depFY(); const D = depIGet(fy); const C = depICalc(D, fy); const posted = D.posted && E.vouchers.find(v => v.id === D.posted); const fas = E.ledgers.filter(l => inGroup(l, 'g_fa')).sort(byName);
  const inp = (i, f, v, w) => `<input class="di" data-i="${i}" data-f="${f}" value="${h(v ?? '')}" style="width:${w || 105}px">`;
  return `<h2>Depreciation schedule (IAS 16 / IFRS for SMEs s.17)</h2>
  <div class="row no-print card" style="padding:10px"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})">${fyList(E).map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div><div class="fit"><button class="btn" onclick="depIPull('${fy}')">Fill from books</button></div><div class="fit"><button class="btn" onclick="depIMap()">Map asset ledgers to classes (${fas.filter(l => l.pool).length}/${fas.length})</button></div></div>
  <p class="small muted">Straight-line (SLM) charges the rate on cost; reducing balance (WDV) charges it on the opening carrying amount. Additions are depreciated from the date of purchase (time-apportioned). Rates are your accounting policy – edit as needed.</p>
  <div class="tw"><table class="t ent"><thead><tr><th>Asset class</th><th>Method</th><th>Rate %</th><th>Cost (for SLM)</th><th>Opening carrying amount</th><th>Disposals (carrying amt)</th><th class="n">Additions</th><th class="n">Depreciation</th><th class="n">Closing carrying amount</th><th></th></tr></thead><tbody id="di_rows">
  ${C.rows.map((r, i) => `<tr><td>${inp(i, 'name', r.name, 170)}</td><td><select class="di" data-i="${i}" data-f="m"><option ${r.m === 'SLM' ? 'selected' : ''}>SLM</option><option ${r.m === 'WDV' ? 'selected' : ''}>WDV</option></select></td><td>${inp(i, 'r', r.r, 70)}</td><td>${inp(i, 'cost', r.cost)}</td><td>${inp(i, 'nbv', r.nbv)}</td><td>${inp(i, 'disp', r.disp)}</td><td class="n">${fmt(r.addAmt)}${(r.adds || []).length ? `<br><span class="small muted">${r.adds.length} item(s)</span>` : ''}</td><td class="n">${fmt(r.dep)}</td><td class="n">${fmt(r.close)}</td><td><button class="btn sm" onclick="depIAdds(${i},'${fy}')">Additions</button></td></tr>`).join('')}
  <tr class="tot"><td colspan="7">Total</td><td class="n">${fmt(C.total)}</td><td class="n">${fmt(sum(C.rows, r => r.close))}</td><td></td></tr></tbody></table></div>
  <div class="btns no-print"><button class="btn sm" onclick="depIAddClass('${fy}')">+ Add asset class</button></div>
  <div class="card"><div class="kv"><div><b>Depreciation for ${fy}</b></div><div><b>${fmt(C.total)}</b></div><div>Posted journal</div><div>${posted ? `<a href="#" onclick="viewVoucher('${posted.id}');return false">${h(posted.no)}</a> ${Math.abs(sum(posted.lines, x => x.dr) - C.total) > 0.01 ? '<span class="pill y">differs – post again</span>' : '<span class="pill g">up to date</span>'}` : 'Not posted yet'}</div></div>
  <div class="row"><div><label>Credit the depreciation to</label><select id="di_cr"><option value="acc" ${D.credit !== 'asset' ? 'selected' : ''}>"Accumulated Depreciation – class" ledgers</option><option value="asset" ${D.credit === 'asset' ? 'selected' : ''}>Directly to the asset ledgers</option></select></div>${dateInput('di_date', D.jeDate || fyRange(fy).to, 'Journal date')}</div>
  <div class="btns no-print"><button class="btn" onclick="depISave('${fy}')">Save & recalculate</button><button class="btn pri" onclick="depIPost('${fy}')">${posted ? 'Update' : 'Post'} depreciation journal</button><button class="btn" onclick="window.print()">Print</button></div></div>`;
}
function depIRead(fy) { const D = depIGet(fy); $$('#di_rows .di').forEach(el => { const c = D.classes[+el.dataset.i]; const f = el.dataset.f; c[f] = ['name', 'm'].includes(f) ? el.value.trim() : (el.value === '' ? '' : num(el.value)); }); if ($('#di_cr')) D.credit = $('#di_cr').value; if ($('#di_date')) D.jeDate = readDate('di_date'); return D; }
async function depISave(fy) { depIRead(fy); await saveE(); App.render(); }
async function depIAddClass(fy) { const D = depIRead(fy); D.classes.push({ name: 'New class', m: 'SLM', r: 10 }); await saveE(); App.render(); }
function depIAdds(i, fy) { const D = depIRead(fy); const c = D.classes[i]; modal('Additions – ' + h(c.name), `<div class="tw"><table class="t ent"><thead><tr><th>Date</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody id="da_rows">${(c.adds || []).map(a => `<tr><td><input type="date" data-k="d" value="${a.d || ''}"></td><td><input data-k="a" value="${a.a}"></td><td><input data-k="n" value="${h(a.n || '')}"></td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" onclick="$('#da_rows').insertAdjacentHTML('beforeend','<tr><td><input type=date data-k=d></td><td><input data-k=a></td><td><input data-k=n></td><td></td></tr>')">+ Add</button>
  <div class="btns"><button class="btn pri" onclick="(async()=>{const D=depIGet('${fy}');D.classes[${i}].adds=$$('#da_rows tr').map(tr=>({d:$('[data-k=d]',tr).value,a:num($('[data-k=a]',tr).value),n:$('[data-k=n]',tr).value})).filter(a=>a.a);await saveE();closeModal();App.render()})()">Save</button></div>`); }
function depIMap() {
  const D = depIGet(depFY()); const fas = S.E.ledgers.filter(l => inGroup(l, 'g_fa')).sort(byName);
  modal('Map asset ledgers to classes', `${fas.length ? `<div class="tw"><table class="t ent"><thead><tr><th>Ledger</th><th>Class</th><th>Accumulated depreciation ledger?</th></tr></thead><tbody>${fas.map(l => `<tr><td>${h(l.name)}</td><td><select class="pm" data-id="${l.id}"><option value="">(not depreciated, e.g. land)</option>${D.classes.map(c => `<option ${l.pool === c.name ? 'selected' : ''}>${h(c.name)}</option>`).join('')}</select></td><td class="center"><input type="checkbox" class="pa" data-id="${l.id}" ${l.accDep ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>` : '<p>No ledgers under Fixed Assets yet.</p>'}
  <div class="btns"><button class="btn pri" onclick="$$('.pm').forEach(s=>L(s.dataset.id).pool=s.value);$$('.pa').forEach(c=>L(c.dataset.id).accDep=c.checked);saveE().then(()=>{closeModal();App.render()})">Save</button></div>`, { wide: true });
}
async function depIPull(fy) {
  const E = S.E; const D = depIRead(fy); const rg = fyRange(fy); const B = ledgerBalances(E, rg.from, rg.to); const prevFy = fyOf(addDays(rg.from, -1)); const prev = E.depnI && E.depnI[prevFy] ? depICalc(E.depnI[prevFy], prevFy) : null;
  if (!E.ledgers.some(l => l.pool && inGroup(l, 'g_fa'))) { toast('First map your asset ledgers to classes', 1); return depIMap(); }
  D.classes.forEach(c => { const ls = E.ledgers.filter(l => l.pool === c.name && inGroup(l, 'g_fa')); const pc = prev && prev.rows.find(r => r.name === c.name); c.nbv = pc ? pc.close : r2(sum(ls, l => B[l.id].op)); if (pc) c.cost = r2(num(pc.cost) + pc.addAmt); else if (!c.cost) c.cost = r2(sum(ls.filter(l => !l.accDep), l => B[l.id].op));
    c.adds = []; c.disp = 0; activeVouchers(E).filter(v => v.date >= rg.from && v.date <= rg.to && !v.depnFy).forEach(v => v.lines.forEach(x => { const l = L(x.l); if (!l || l.pool !== c.name || l.accDep) return; if (num(x.dr)) c.adds.push({ d: v.date, a: num(x.dr), n: v.no }); if (num(x.cr)) c.disp = r2(num(c.disp) + num(x.cr)); })); });
  await saveE(); toast('Filled from books – review'); App.render();
}
async function depIPost(fy) {
  const E = S.E; const D = depIRead(fy); const C = depICalc(D, fy); if (!C.total) return toast('Nothing to post', 1);
  const depL = E.ledgers.find(l => l.id === 'l_depn') || (() => { const l = { id: uid('l'), name: 'Depreciation', g: 'g_depn', ob: 0 }; E.ledgers.push(l); return l; })();
  const date = D.jeDate || fyRange(fy).to; const B = ledgerBalances(E, '', date); const lines = [{ l: depL.id, dr: C.total, cr: 0 }];
  C.rows.forEach(r => { if (!r.dep) return; if (D.credit === 'asset') { const ls = E.ledgers.filter(l => l.pool === r.name && !l.accDep && B[l.id].cl > 0); const tot = sum(ls, l => B[l.id].cl); if (ls.length && tot) { let left = r.dep; ls.forEach((l, i) => { const a = i === ls.length - 1 ? r2(left) : r2(r.dep * B[l.id].cl / tot); left -= a; lines.push({ l: l.id, dr: 0, cr: a }); }); return; } }
    let acc = E.ledgers.find(l => l.accDep && l.pool === r.name); if (!acc) { acc = { id: uid('l'), name: 'Accumulated Depreciation – ' + r.name, g: 'g_fa', ob: 0, pool: r.name, accDep: true }; E.ledgers.push(acc); } lines.push({ l: acc.id, dr: 0, cr: r.dep }); });
  const old = D.posted && E.vouchers.find(v => v.id === D.posted); const v = old ? { ...clone(old), date, lines } : { type: 'JV', date, lines, depnFy: fy, narration: `Depreciation for ${fy}` };
  if (await saveVoucher(v)) { D.posted = v.id; await saveE(); toast('Depreciation journal ' + v.no + (old ? ' updated' : ' posted')); App.render(); }
}
window.viewDepreciation = (o => function () { return isINTL() ? viewDepreciationIntl() : o(); })(window.viewDepreciation);

/* ---------- income / corporate tax computation (international) ---------- */
function taxIGet(fy) { const E = S.E; E.taxcI = E.taxcI || {}; const I = E.intl || {}; return E.taxcI[fy] = E.taxcI[fy] || { kind: /Sole|Partnership/.test(E.type) ? 'indiv' : 'company', rate: I.ct ?? 0, free: I.ctFree || 0, lossCap: 100, adds: [], less: [] }; }
function taxICompute(E, fy) {
  const T = taxIGet(fy); const rg = fyRange(fy); const pl = plData(E, rg.from, rg.to); const ov = (k, a) => T[k] !== undefined && T[k] !== '' ? num(T[k]) : a;
  const pbt = ov('pbtOv', pl.pbt); const adds = sum(T.adds, x => x.a), less = sum(T.less, x => x.a); const adjusted = r2(pbt + adds - less);
  const lossUsed = r2(Math.min(num(T.lossBf), Math.max(0, adjusted) * num(T.lossCap || 100) / 100)); const taxable = r2(Math.max(0, adjusted - lossUsed));
  let gross = 0, slabRows = null; if (T.kind === 'indiv' && T.slabs && T.slabs.length) { const s = slabTax(taxable, T.slabs, false); gross = s.tax; slabRows = s.rows; } else gross = r2(Math.max(0, taxable - num(T.free)) * num(T.rate) / 100);
  const liability = ov('taxOv', r2(Math.max(0, gross - num(T.credits))));
  const whtL = sysL('tdsRec'), advL = E.ledgers.find(l => l.id === 'l_advtax'); const mv = l => l ? r2(sum(ledgerMoves(E, x => x.id === l.id, rg.from, rg.to).filter(m => m.a > 0), m => m.a)) : 0;
  const wht = ov('whtOv', mv(whtL)), adv = ov('advOv', mv(advL)); const balance = r2(liability - wht - adv);
  return { T, pl, pbt, adds, less, adjusted, lossUsed, taxable, gross, slabRows, liability, wht, adv, balance, whtL, advL, lossCf: adjusted < 0 ? -adjusted : 0 };
}
function viewTaxCompIntl() {
  const E = S.E; const fy = depFY(); const R = taxICompute(E, fy); const T = R.T; const c = CFG(); const posted = T.posted && E.vouchers.find(v => v.id === T.posted);
  const adj = (k, title) => `<h3>${title}</h3><div class="tw"><table class="t ent"><tbody id="ti_${k}">${(T[k] || []).map(x => `<tr><td><input data-k="t" value="${h(x.t)}"></td><td><input data-k="a" value="${x.a}"></td><td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" onclick="addRowTo('ti_${k}',['t','a'])">+ Add line</button>`;
  const line = (t, v, cls) => `<tr class="${cls || ''}"><td>${t}</td><td class="n">${fmt(v)}</td></tr>`; const o = k => `<input class="tio" data-k="${k}" value="${T[k] ?? ''}" placeholder="auto" style="width:130px">`;
  return `<h2>Income tax computation – ${fy}</h2><div class="row no-print card" style="padding:10px"><div><label>Financial year</label><select onchange="App.setp({fy:this.value})">${fyList(E).map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div><div class="fit"><button class="btn" onclick="App.go('depreciation',{fy:'${fy}'})">Depreciation schedule</button></div></div>
  <div class="grid2 no-print"><div class="card"><h3>Taxpayer – ${h(c.country)}</h3><label>Type</label><select id="ti_kind"><option value="company" ${T.kind !== 'indiv' ? 'selected' : ''}>Company / entity – flat rate</option><option value="indiv" ${T.kind === 'indiv' ? 'selected' : ''}>Individual / sole trader – slabs</option></select>
  <div class="grid2"><div><label>Tax rate %</label><input id="ti_rate" value="${T.rate ?? ''}"></div><div><label>Tax-free threshold (${c.cur})</label><input id="ti_free" value="${T.free || ''}"></div><div><label>Loss brought forward</label><input id="ti_loss" value="${T.lossBf || ''}"></div><div><label>Loss offset limit (% of income)</label><input id="ti_cap" value="${T.lossCap ?? 100}"></div><div><label>Tax credits / reliefs</label><input id="ti_cred" value="${T.credits || ''}"></div></div>
  <label>Slabs for individuals (amount : rate %, last line = remaining income)</label><textarea id="ti_slabs" rows="4" placeholder="e.g. 50000 : 0&#10;100000 : 10&#10;0 : 20">${(T.slabs || []).map(([a, r]) => a + ' : ' + r).join('\n')}</textarea>
  <p class="small muted">Rates come from the country preset – confirm with current law (e.g. UAE corporate tax 9% above AED 375,000).</p></div>
  <div class="card">${adj('adds', 'Add back – non-deductible expenses')}<p class="small muted">e.g. accounting depreciation (if tax depreciation differs), fines, entertainment limits, provisions.</p>${adj('less', 'Less – exempt income / tax allowances')}<p class="small muted">e.g. tax depreciation / capital allowances, exempt dividends, reliefs.</p></div></div>
  <div class="card no-print"><h3>Auto figures (type to override)</h3><div class="tw"><table class="t ent"><tbody><tr><td>Profit before tax per books</td><td class="n">${fmt(R.pl.pbt)}</td><td>${o('pbtOv')}</td></tr><tr><td>Withholding tax suffered</td><td class="n">${fmt(R.wht)}</td><td>${o('whtOv')}</td></tr><tr><td>Tax paid in advance</td><td class="n">${fmt(R.adv)}</td><td>${o('advOv')}</td></tr><tr><td>Final tax liability</td><td class="n">${fmt(R.liability)}</td><td>${o('taxOv')}</td></tr></tbody></table></div><div class="btns"><button class="btn pri" onclick="taxISave('${fy}')">Save & calculate</button></div></div>
  <div id="ti_out" class="card"><h3 class="center">${h(E.name)}${E.legal.pan ? ' – ' + h(c.taxId) + ' ' + h(E.legal.pan) : ''}<br>Tax computation – ${fy} (${c.cur})</h3><table class="t"><tbody>
  ${line('Profit before tax as per financial statements', R.pbt)}${(T.adds || []).map(x => line('Add: ' + h(x.t), x.a)).join('')}${(T.less || []).map(x => line('Less: ' + h(x.t), -x.a)).join('')}${line('Adjusted taxable profit / (loss)', R.adjusted, 'tot')}
  ${R.lossCf ? line('Tax loss carried forward', R.lossCf) : ''}${R.lossUsed ? line('Less: losses brought forward used', -R.lossUsed) : ''}${line('Taxable income', R.taxable, 'tot')}
  ${R.slabRows ? R.slabRows.map(s => line(`Tax on ${fmt(s.part)} @ ${s.rt}%`, s.t)).join('') : line(`Tax @ ${T.rate}%${num(T.free) ? ' on income above ' + fmt(T.free) : ''}`, R.gross)}${num(T.credits) ? line('Less: credits / reliefs', -num(T.credits)) : ''}${line('Tax liability', R.liability, 'tot')}
  ${line('Less: withholding tax suffered', -R.wht)}${line('Less: tax paid in advance', -R.adv)}${line(R.balance >= 0 ? 'Balance tax payable' : 'Tax refundable', R.balance, 'tot')}</tbody></table></div>
  <div class="card no-print"><p>Posted: ${posted ? `<a href="#" onclick="viewVoucher('${posted.id}');return false">${h(posted.no)}</a>` : 'not yet'}</p><label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="ti_setoff" checked> Also set off withholding tax and advance tax against the liability</label><div class="btns"><button class="btn pri" onclick="taxIPost('${fy}')">${posted ? 'Update' : 'Post'} tax journal</button><button class="btn" onclick="window.print()">Print</button><button class="btn" onclick="exportTable('ti_out','Tax_Computation')">Export Excel</button></div></div>`;
}
function taxIRead(fy) { const T = taxIGet(fy); T.kind = $('#ti_kind').value; T.rate = num($('#ti_rate').value); T.free = num($('#ti_free').value); T.lossBf = num($('#ti_loss').value); T.lossCap = num($('#ti_cap').value) || 100; T.credits = num($('#ti_cred').value);
  T.slabs = $('#ti_slabs').value.split('\n').map(x => x.split(':').map(y => num(y))).filter(x => x.length === 2); $$('.tio').forEach(i => T[i.dataset.k] = i.value.trim() === '' ? '' : num(i.value));
  ['adds', 'less'].forEach(k => T[k] = $$('#ti_' + k + ' tr').map(tr => ({ t: $('[data-k=t]', tr).value.trim(), a: num($('[data-k=a]', tr).value) })).filter(x => x.t || x.a)); return T; }
async function taxISave(fy) { taxIRead(fy); await saveE(); App.render(); }
async function taxIPost(fy) {
  const E = S.E; const T = taxIRead(fy); const R = taxICompute(E, fy); const exp = E.ledgers.find(l => l.id === 'l_itexp'), pay = E.ledgers.find(l => l.id === 'l_itpay'); if (!exp || !pay) return toast('Tax ledgers missing', 1); if (!R.liability && !R.wht && !R.adv) return toast('No tax to post', 1);
  const lines = []; if (R.liability) lines.push({ l: exp.id, dr: R.liability, cr: 0 }, { l: pay.id, dr: 0, cr: R.liability });
  if ($('#ti_setoff').checked) { const so = r2(R.wht + R.adv); if (so) { lines.push({ l: pay.id, dr: so, cr: 0 }); if (R.wht && R.whtL) lines.push({ l: R.whtL.id, dr: 0, cr: R.wht }); if (R.adv && R.advL) lines.push({ l: R.advL.id, dr: 0, cr: R.adv }); } }
  const old = T.posted && E.vouchers.find(v => v.id === T.posted); const v = old ? { ...clone(old), lines: mergeLines(lines) } : { type: 'JV', date: fyRange(fy).to, lines: mergeLines(lines), taxFy: fy, narration: `Income tax for ${fy}` };
  if (await saveVoucher(v)) { T.posted = v.id; await saveE(); toast('Tax journal ' + v.no); App.render(); }
}
window.viewTaxComp = (o => function () { return isINTL() ? viewTaxCompIntl() : o(); })(window.viewTaxComp);
