/* Bill scanning (OCR), bulk upload, documents, updates, practice, backup, settings, admin */
'use strict';

/* =================== BILL SCANNING (offline OCR) =================== */
let OCRQ = []; // scanned bills waiting for review
function viewScan() {
  if (!can('import')) return noAccess();
  const fsApi = !!window.showDirectoryPicker;
  return `<h2>Scan bills</h2><p class="muted">Pick a folder (or photos / PDFs) of sales, purchase, expense bills, credit and debit notes. LekhaPal reads them on this device – no internet needed – and fills in party, PAN, invoice no., date, taxable value, VAT, total and item lines. <b>Always review before posting</b>: photo quality affects accuracy.</p>
  <div class="card"><div class="row"><div><label>These bills are</label><select id="sc_type"><option value="auto">Detect automatically</option><option value="PUR">Purchase / expense bills</option><option value="SAL">Sales invoices</option><option value="CN">Credit notes (sales return)</option><option value="DN">Debit notes (purchase return)</option></select></div>
  <div><label>Language on bills</label><select id="sc_lang"><option value="eng">English</option>${isINTL() ? '' : '<option value="eng+nep">English + Nepali (slower)</option>'}</select></div>
  <div><label>Post line to (when items are not read)</label><input id="sc_led" list="dl_led" value="Purchase"></div></div>${ledgerDatalist()}
  <div class="btns">${fsApi ? `<button class="btn pri" onclick="scanFolder()">📁 Choose bills folder</button>` : ''}<button class="btn ${fsApi ? '' : 'pri'}" onclick="scanFiles()">🖼️ Choose photos / PDFs</button><button class="btn" onclick="scanCamera()">📷 Take photo</button></div>
  ${fsApi ? '<p class="small muted">Folder mode remembers files already read, so you can keep adding photos to the same folder and scan again.</p>' : '<p class="small muted">Folder picking works in Chrome / Edge on computers. On phones, choose photos or use the camera.</p>'}</div>
  <div id="sc_prog"></div><div id="sc_list">${OCRQ.length ? ocrListHTML() : ''}</div>`;
}
async function scanFolder() { try { const dir = await window.showDirectoryPicker(); const files = []; for await (const [name, hd] of dir.entries()) { if (hd.kind === 'file' && /\.(jpe?g|png|webp|bmp|pdf)$/i.test(name)) files.push(await hd.getFile()); } const fresh = files.filter(f => !S.E.ocrSeen[f.name + '|' + f.size]); toast(`${files.length} bills found, ${fresh.length} new`); runOCR(fresh); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 1); } }
async function scanFiles() { const f = await pickFile('image/*,.pdf', true); if (f && f.length) runOCR(f); }
function scanCamera() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = () => i.files.length && runOCR(Array.from(i.files)); i.click(); }
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
let _ocrWorker = null, _ocrLang = '';
async function ocrWorker(lang) {
  if (_ocrWorker && _ocrLang === lang) return _ocrWorker; if (_ocrWorker) await _ocrWorker.terminate();
  await loadScript('lib/tesseract.min.js'); const base = new URL('lib/', location.href).href;
  _ocrWorker = await Tesseract.createWorker(lang.split('+'), 1, { workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core', langPath: base + 'lang', gzip: true, workerBlobURL: false });
  _ocrLang = lang; return _ocrWorker;
}
async function pdfText(file) {
  await loadScript('lib/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; let text = ''; for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) { const pg = await pdf.getPage(p); const tc = await pg.getTextContent(); let lastY = null; tc.items.forEach(it => { const y = Math.round(it.transform[5]); text += (lastY !== null && Math.abs(y - lastY) > 3 ? '\n' : ' ') + it.str; lastY = y; }); text += '\n'; }
  if (text.replace(/\s/g, '').length > 40) return { text };
  const pg = await pdf.getPage(1); const vp = pg.getViewport({ scale: 2.2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return { canvas: c };
}
async function runOCR(files) {
  const prog = $('#sc_prog'); const lang = $('#sc_lang').value; const type = $('#sc_type').value;
  for (const [i, f] of files.entries()) {
    prog.innerHTML = `<div class="alert b">Reading ${i + 1} of ${files.length}: ${h(f.name)}… (first bill takes longer while the reader loads)</div>`;
    try {
      let text = ''; if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { const r = await pdfText(f); if (r.text) text = r.text; else text = (await (await ocrWorker(lang)).recognize(r.canvas)).data.text; }
      else text = (await (await ocrWorker(lang)).recognize(f)).data.text;
      const d = parseBill(text, type); d.file = f; d.fname = f.name; d.key = f.name + '|' + f.size; OCRQ.push(d);
    } catch (e) { OCRQ.push({ fname: f.name, file: f, err: e.message, text: '', type: type === 'auto' ? 'PUR' : type, rows: [] }); }
    $('#sc_list').innerHTML = ocrListHTML();
  }
  prog.innerHTML = files.length ? `<div class="alert g">Finished reading ${files.length} bill(s). Check each one and click Post.</div>` : '';
}
function parseBill(raw, forced) {
  const text = raw.replace(/[|]/g, ' ').replace(/[ \t]+/g, ' '); const lines = text.split('\n').map(s => s.trim()).filter(Boolean); const my = (S.E.legal.pan || '').trim();
  const nums = s => (s.match(/\d[\d,]*\.?\d*/g) || []).map(x => num(x)).filter(x => !isNaN(x));
  const pans = []; let m; const intl = isINTL(); const re = intl ? /(?:TRN|VAT|GST|GSTIN|TIN|ABN|EIN|Tax\s*(?:ID|Reg)|Reg(?:istration)?\s*No)[^0-9A-Z\n]{0,20}([0-9A-Z][0-9A-Z \-]{6,20})/gi : /(?:PAN|VAT|P\.?A\.?N|V\.?A\.?T|पान|प्यान|भ्याट|Reg)[^0-9\n]{0,20}(\d[\d ]{8,10})/gi; while ((m = re.exec(text))) { if (intl) { const p = m[1].replace(/[\s-]/g, '').slice(0, 15); if (p.length >= 8 && /\d{5}/.test(p)) pans.push(p); continue; } const p = m[1].replace(/\D/g, '').slice(0, 9); if (p.length === 9) pans.push(p); }
  if (!intl) text.replace(/\b(\d{9})\b/g, (a, p) => { if (!pans.includes(p) && !/^(98|97)/.test(p)) pans.push(p); });
  let type = forced; const isCN = /credit\s*note/i.test(text), isDN = /debit\s*note/i.test(text);
  const sellerPan = pans[0] || ''; const otherPan = pans.find(p => p !== my) || '';
  if (forced === 'auto') { if (my && sellerPan === my) type = isCN ? 'CN' : 'SAL'; else type = isDN ? 'DN' : isCN ? 'DN' : 'PUR'; }
  const partyPan = (type === 'SAL' || type === 'CN') ? (pans.find(p => p !== my) || '') : otherPan;
  let inv = ''; m = text.match(/(?:invoice|bill|inv|voucher|receipt|बिल|बीजक)\s*(?:no|number|num|#|नं)\.?\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\/]{0,20})/i); if (m) inv = m[1];
  let date = ''; const dl = lines.find(l => /date|miti|मिति/i.test(l) && /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(l)) || text; m = dl.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})/); if (m) date = parseAnyDate(m[1]);
  const amtOf = rx => { const c = lines.filter(l => rx.test(l)).map(l => nums(l).filter(n => n > 0)).filter(a => a.length).map(a => a[a.length - 1]); return c; };
  let taxable = (amtOf(/taxable/i)[0]) || 0; let vat = (amtOf(/(^|\s)(vat|tax)\b.*(13|%)|^vat\b|13\s*%/i).filter(x => x !== 13)[0]) || 0;
  const totals = amtOf(/grand\s*total|net\s*(amount|total|payable)|total\s*amount|bill\s*amount|^total|जम्मा|कुल/i); let total = totals.length ? Math.max(...totals) : 0;
  let exempt = (amtOf(/non[\s-]*taxable|exempt|कर\s*छुट/i)[0]) || 0; const disc = (amtOf(/discount|छुट/i)[0]) || 0;
  if (!taxable && total && vat) taxable = r2(total - vat - exempt); if (!vat && taxable && total && total > taxable) vat = r2(total - taxable - exempt);
  if (!taxable && !vat && total) { taxable = r2((total - exempt) / 1.13); vat = r2(total - exempt - taxable); }
  if (!total) total = r2(taxable + vat + exempt);
  const warn = []; if (taxable && vat && Math.abs(taxable * 0.13 - vat) > Math.max(2, vat * 0.02)) warn.push('VAT is not 13% of taxable value'); if (Math.abs(taxable + vat + exempt - total) > 2) warn.push('Taxable + VAT does not equal total'); if (!partyPan) warn.push('PAN not found'); if (!inv) warn.push('Invoice no. not found'); if (!date) warn.push('Date not found');
  const skip = /tax\s*invoice|invoice|bill|vat|pan|phone|tel|mobile|email|date|address|^\d|www\.|estimate/i; const name = (lines.slice(0, 8).find(l => /[a-zA-Zऀ-ॿ]{3}/.test(l) && !skip.test(l) && l.length > 3) || '').replace(/[^\w\s&.,()\-ऀ-ॿ]/g, '').trim();
  const rows = []; lines.forEach(l => { const mm = l.match(/^(?:\d{1,3}[.)\s]+)?(.+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z]{1,6})?\s+(\d[\d,]*(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)$/); if (!mm) return; const q = num(mm[2]), rt = num(mm[4]), a = num(mm[5]); if (q > 0 && rt > 0 && Math.abs(q * rt - a) <= Math.max(1, a * 0.02) && /[a-z]/i.test(mm[1])) rows.push({ name: mm[1].trim(), qty: q, unit: mm[3] || '', rate: rt, amt: a }); });
  return { type, name, pan: partyPan, inv, date: date || todayAD(), taxable: r2(taxable), vat: r2(vat), exempt: r2(exempt), total: r2(total), disc: r2(disc), rows, warn, text: raw, useItems: rows.length > 0 && Math.abs(sum(rows, r => r.amt) - taxable - exempt) <= Math.max(5, taxable * 0.02) };
}
function ocrListHTML() {
  return `<h3>Review scanned bills (${OCRQ.length})</h3>` + OCRQ.map((d, i) => `<div class="card" id="oc_${i}"><div class="row"><div class="fit"><b>${h(d.fname)}</b>${d.err ? ` <span class="pill r">${h(d.err)}</span>` : ''} ${(d.warn || []).map(w => `<span class="pill y">${h(w)}</span>`).join(' ')}</div></div>
  <div class="row"><div><label>Type</label><select data-f="type">${['PUR', 'SAL', 'CN', 'DN'].map(t => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${VTYPES[t].t}</option>`).join('')}</select></div><div><label>Party name</label><input data-f="name" value="${h(d.name)}" list="dl_party"></div><div><label>PAN / VAT no.</label><input data-f="pan" value="${h(d.pan)}"></div><div><label>Invoice no.</label><input data-f="inv" value="${h(d.inv)}"></div></div>
  <div class="row"><div><label>Invoice date (BS)</label><input data-f="date" value="${toBS(d.date)}"></div><div><label>Posting date (BS)</label><input data-f="pdate" value="${toBS(d.date)}"></div><div><label>Taxable</label><input data-f="taxable" value="${d.taxable}"></div><div><label>VAT</label><input data-f="vat" value="${d.vat}"></div><div><label>Exempt</label><input data-f="exempt" value="${d.exempt}"></div><div><label>Total</label><input data-f="total" value="${d.total}"></div></div>
  ${d.rows && d.rows.length ? `<label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" data-f="useItems" ${d.useItems ? 'checked' : ''}> Post as stock items (${d.rows.length} lines read)</label><div class="small muted">${d.rows.map(r => `${h(r.name)} – ${r.qty} ${h(r.unit)} × ${fmt(r.rate)} = ${fmt(r.amt)}`).join('<br>')}</div>` : ''}
  <div class="btns"><button class="btn pri" onclick="postOCR(${i})">Post entry</button><button class="btn" onclick="openNewWin(OCRQ[${i}].file)">View bill</button><button class="btn" onclick="modal('Text read from bill','<pre style=white-space:pre-wrap>'+h(OCRQ[${i}].text)+'</pre>')">Raw text</button><button class="btn red" onclick="OCRQ.splice(${i},1);$('#sc_list').innerHTML=ocrListHTML()">Skip</button></div></div>`).join('');
}
function openNewWin(blob) { const u = URL.createObjectURL(blob); window.open(u, '_blank'); }
async function postOCR(i) {
  const d = OCRQ[i]; const box = $('#oc_' + i); const g = f => { const el = $(`[data-f=${f}]`, box); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
  const type = g('type'), isS = type === 'SAL' || type === 'CN'; const date = toAD(g('pdate')); if (!date) return toast('Invalid posting date', 1);
  const pname = g('name') || 'Cash'; let party = ledgerByName(pname);
  if (!party) { party = { id: uid('l'), name: pname, g: isS ? 'g_debt' : 'g_cred', ob: 0, pan: g('pan') }; S.E.ledgers.push(party); }
  const taxable = num(g('taxable')), exempt = num(g('exempt')); let rows;
  if (g('useItems')) rows = d.rows.map(r => { let it = itemByName(r.name); if (!it) { it = { id: uid('i'), name: r.name, unit: r.unit || 'Nos', vat: taxable > 0, oq: 0, orate: 0, gd: 'gd_main' }; S.E.items.push(it); } return { k: 'i', id: it.id, qty: r.qty, unit: r.unit || it.unit, rate: r.rate, disc: 0, amt: r.amt, tax: taxable > 0, gd: it.gd || 'gd_main' }; });
  else { const led = ledgerByName($('#sc_led').value) || sysL(isS ? 'sales' : 'purchase'); rows = []; if (taxable) rows.push({ k: 'l', id: led.id, amt: taxable, tax: true }); if (exempt) rows.push({ k: 'l', id: led.id, amt: exempt, tax: false }); }
  const v = { type, date, narration: 'Scanned bill ' + d.fname, bill: { party: party.id, pan: g('pan'), billNo: g('inv'), billDate: toAD(g('date')) || date, rows, vatManual: true, vat: num(g('vat')), payMode: isCashBank(party) ? 'Cash' : 'Credit' } };
  if (type === 'CN' || type === 'DN') v.bill.ref = g('inv');
  const docId = await saveDoc(d.file, { cat: isS ? 'Bills – sales' : 'Bills – purchase', fy: fyOf(date), note: (g('inv') || '') + ' ' + pname }); v.docId = docId;
  if (!(await saveVoucher(v))) return; if (d.key) S.E.ocrSeen[d.key] = v.id; await saveE();
  toast(`Posted ${v.no}`); OCRQ.splice(i, 1); $('#sc_list').innerHTML = ocrListHTML();
}

/* =================== BULK UPLOAD =================== */
const TEMPLATES = {
  ledgers: { t: 'Ledgers & opening trial balance', cols: ['Ledger Name', 'Group', 'Opening Debit', 'Opening Credit', 'PAN', 'Address', 'Phone'], ex: [['ABC Traders', 'Sundry Debtors', 25000, '', '301234567', 'Birtamod', '9800000000'], ['Nabil Bank', 'Bank Accounts', 150000, '', '', '', ''], ['Capital / Share Capital', 'Capital Account', '', 500000, '', '', '']] },
  items: { t: 'Items & opening stock', cols: ['Item Name', 'Code', 'Category', 'Unit', 'HS Code', 'VAT %', 'Opening Qty', 'Opening Rate', 'Sales Rate', 'Purchase Rate', 'Reorder Level', 'Location'], ex: [['Rice Sona Mansuli 25kg', 'R001', 'Rice', 'Bag', '1006.30', 0, 50, 1800, 2000, 1800, 10, 'Main Location']] },
  sales: { t: 'Sales invoices', cols: ['Date (BS)', 'Invoice No', 'Customer', 'Customer PAN', 'Item or Ledger', 'Qty', 'Unit', 'Rate', 'Discount', 'Amount', 'VAT %', 'Payment Mode', 'Narration'], ex: [['2083-07-01', '', 'ABC Traders', '301234567', 'Rice Sona Mansuli 25kg', 2, 'Bag', 2000, 0, '', 0, 'Credit', '']] },
  purchase: { t: 'Purchase / expense bills', cols: ['Date (BS)', 'Bill No', 'Supplier', 'Supplier PAN', 'Item or Ledger', 'Qty', 'Unit', 'Rate', 'Discount', 'Amount', 'VAT %', 'Import (Y/N)', 'TDS %', 'Narration'], ex: [['2083-07-02', 'B-1201', 'XYZ Suppliers', '601234567', 'Rice Sona Mansuli 25kg', 100, 'Bag', 1750, 0, '', 0, 'N', '', ''], ['2083-07-03', '889', 'Nepal Telecom', '300044614', 'Telephone & Internet', '', '', '', '', 2000, 13, 'N', '', 'Internet bill']] },
  journal: { t: 'Journal / any vouchers', cols: ['Voucher Ref', 'Date (BS)', 'Type (JV/PAY/RCT/CON)', 'Ledger', 'Debit', 'Credit', 'Narration'], ex: [['1', '2083-07-05', 'PAY', 'Rent', 50000, '', 'Rent for Kartik'], ['1', '2083-07-05', 'PAY', 'TDS Payable', '', 5000, ''], ['1', '2083-07-05', 'PAY', 'Cash', '', 45000, '']] },
  parties: { t: 'Customers & suppliers', cols: ['Name', 'Type (Customer/Supplier)', 'PAN', 'Address', 'Phone', 'Email', 'Credit Days', 'Opening Balance', 'Dr/Cr'], ex: [['ABC Traders', 'Customer', '301234567', 'Birtamod', '9800000000', '', 30, 25000, 'Dr'], ['XYZ Suppliers', 'Supplier', '601234567', 'Biratnagar', '', '', 45, 40000, 'Cr']] },
  stocklist: { t: 'Client stock list', cols: ['Item Name', 'Code', 'Unit', 'Qty', 'Rate', 'Category', 'HS Code', 'VAT %', 'Location'], ex: [['Rice Sona Mansuli 25kg', 'R001', 'Bag', 40, 1820, 'Rice', '1006.30', 0, 'Main Location']] },
  thirdparty: { t: 'IRD / third-party data (for missing reco)', cols: ['PAN', 'Name', 'Invoice No', 'Date', 'Taxable Amount', 'Exempt Amount'], ex: [['601234567', 'XYZ Suppliers', 'B-1201', '2083-07-02', 175000, 0]] },
  vatfiled: { t: 'VAT returns filed', cols: ['Month', 'Sales', 'Output VAT', 'Purchase', 'Input VAT'], ex: [['2083-04', 500000, 52000, 300000, 30000]] },
};
function downloadTemplate(k) { const T = TEMPLATES[k]; const ws = XLSX.utils.aoa_to_sheet([T.cols, ...T.ex]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data'); XLSX.writeFile(wb, 'LekhaPal_template_' + k + '.xlsx'); }
function viewImport() {
  if (!can('import')) return noAccess();
  return `<h2>Bulk upload from Excel / CSV</h2><p class="muted">Download a template, fill it (or paste your export from Tally / other software into it), then upload. You will see a preview before anything is saved.</p>
  <div class="alert b">Onboarding a client who used Tally or other software? Use <a href="#" onclick="App.go('migrate');return false">Migrate from other software</a> for a guided move.</div>${['ledgers', 'parties', 'items', 'sales', 'purchase', 'journal'].map(k => `<div class="card"><div class="row"><div><b>${TEMPLATES[k].t}</b><div class="small muted">Columns: ${TEMPLATES[k].cols.join(', ')}</div></div><div class="fit"><button class="btn" onclick="downloadTemplate('${k}')">Template</button> <button class="btn pri" onclick="startImport('${k}')">Upload</button></div></div></div>`).join('')}
  <div class="card"><b>Also available:</b> VAT returns filed → VAT › VAT reconciliation · IRD / supplier data → VAT › Missing reco · Bank statement → Bank reconciliation · Bill photos → Scan bills.</div>`;
}
const GROUP_ALIASES = { 'cashinhand': 'g_cash', 'cash': 'g_cash', 'bankaccounts': 'g_bank', 'bank': 'g_bank', 'bankodac': 'g_od', 'bankoccaccount': 'g_od', 'sundrydebtors': 'g_debt', 'debtors': 'g_debt', 'tradereceivables': 'g_debt', 'sundrycreditors': 'g_cred', 'creditors': 'g_cred', 'tradepayables': 'g_cred', 'dutiestaxes': 'g_tax', 'dutiesandtaxes': 'g_tax', 'fixedassets': 'g_fa', 'capitalaccount': 'g_cap', 'capital': 'g_cap', 'sharecapital': 'g_cap', 'reservessurplus': 'g_res', 'reservesandsurplus': 'g_res', 'loansliability': 'g_loan', 'securedloans': 'g_sec', 'unsecuredloans': 'g_unsec', 'currentliabilities': 'g_cl', 'provisions': 'g_prov', 'currentassets': 'g_ca', 'loansadvancesasset': 'g_adv', 'loansandadvancesasset': 'g_adv', 'depositsasset': 'g_dep', 'investments': 'g_inv', 'salesaccounts': 'g_sales', 'sales': 'g_sales', 'purchaseaccounts': 'g_pur', 'purchase': 'g_pur', 'directexpenses': 'g_dexp', 'indirectexpenses': 'g_iexp', 'directincomes': 'g_dinc', 'indirectincomes': 'g_iinc', 'suspenseac': 'g_susp', 'suspense': 'g_susp', 'stockinhand': 'g_stock', 'miscexpensesasset': 'g_adv' };
function findGroup(name) { const k = nk(name); if (!k) return null; const g = S.E.groups.find(x => nk(x.name) === k); if (g) return g.id; return GROUP_ALIASES[k] || null; }
async function startImport(kind) {
  if (!guardWrite()) return; const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; let rows;
  try { rows = await readSheetFile(f); } catch (e) { return toast('Could not read file: ' + e.message, 1); }
  const plan = buildImport(kind, rows); window._imp = plan;
  modal('Preview import – ' + TEMPLATES[kind].t, `<p><b>${plan.ok.length}</b> record(s) ready. ${plan.errs.length ? `<b class="bad">${plan.errs.length} problem(s)</b> – these rows will be skipped.` : ''}</p>
  ${plan.errs.length ? `<div class="alert y" style="max-height:150px;overflow:auto">${plan.errs.slice(0, 100).map(h).join('<br>')}</div>` : ''}${plan.preview}
  <div class="btns"><button class="btn pri" onclick="commitImport()" ${plan.ok.length ? '' : 'disabled'}>Import ${plan.ok.length} record(s)</button><button class="btn" onclick="closeModal()">Cancel</button></div>`, { wide: true });
}
function buildImport(kind, rows) {
  const ok = [], errs = []; let preview = '';
  if (kind === 'ledgers') {
    rows.forEach((r, i) => { const name = String(rowGet(r, 'ledger name', 'ledger', 'name', 'particulars', 'account')).trim(); if (!name) return; if (/^(opening|closing)\s*stock$/i.test(name)) { errs.push(`Row ${i + 2}: "${name}" skipped – enter opening stock through Items`); return; } const gname = rowGet(r, 'group', 'under', 'parent'); let g = findGroup(gname); if (!g) { errs.push(`Row ${i + 2}: group "${gname}" not recognised – ${name} placed in Suspense; change later`); g = 'g_susp'; } ok.push({ name, g, ob: r2(num(rowGet(r, 'opening debit', 'debit', 'dr', 'opening dr')) - num(rowGet(r, 'opening credit', 'credit', 'cr', 'opening cr')) + num(rowGet(r, 'opening balance', 'balance'))), pan: String(rowGet(r, 'pan', 'vat no', 'pan no')).replace(/\D/g, ''), addr: rowGet(r, 'address'), phone: rowGet(r, 'phone', 'mobile') }); });
    const d = r2(sum(ok, x => x.ob)); preview = table([{ k: 'name', t: 'Ledger' }, { k: 'g', t: 'Group', f: v => h((G(v) || {}).name) }, { k: 'ob', t: 'Opening', n: 1, f: v => fmtDC(v) }, { k: 'x', t: 'Action', f: (v, r) => ledgerByName(r.name) ? 'Update existing' : 'Create' }], ok.slice(0, 300), { maxh: '45vh' }) + `<p class="small">Net of openings: ${fmtDC(d)} ${Math.abs(d) > 0.005 ? '(difference will show until opening stock / remaining balances are entered)' : '✓ tallies'}</p>`;
  }
  if (kind === 'parties') {
    rows.forEach((r, i) => { const name = String(rowGet(r, 'name', 'party name', 'party', 'ledger name')).trim(); if (!name) return; const ty = String(rowGet(r, 'type (customer/supplier)', 'type', 'group')); const g = /supp|cred|vend/i.test(ty) ? 'g_cred' : /cust|debt|client|buyer/i.test(ty) ? 'g_debt' : ''; if (!g) { errs.push(`Row ${i + 2}: type for ${name} must be Customer or Supplier`); return; } let ob = num(rowGet(r, 'opening balance', 'opening', 'balance')); const dc = String(rowGet(r, 'dr/cr', 'drcr')); if (/cr/i.test(dc)) ob = -Math.abs(ob); else if (/dr/i.test(dc)) ob = Math.abs(ob); else if (g === 'g_cred') ob = -Math.abs(ob);
      ok.push({ name, g, pan: String(rowGet(r, 'pan', 'vat no', 'pan no')).replace(/\D/g, ''), addr: rowGet(r, 'address'), phone: rowGet(r, 'phone', 'mobile'), email: rowGet(r, 'email'), cdays: rowGet(r, 'credit days'), ob: r2(ob) }); });
    preview = table([{ k: 'name', t: 'Name' }, { k: 'g', t: 'Type', f: v => v === 'g_debt' ? 'Customer' : 'Supplier' }, { k: 'pan', t: 'PAN' }, { k: 'ob', t: 'Opening', n: 1, f: v => fmtDC(v) }, { k: 'x', t: 'Action', f: (v, r) => ledgerByName(r.name) ? 'Update existing' : 'Create' }], ok.slice(0, 300), { maxh: '45vh' });
  }
  if (kind === 'items') { rows.forEach((r, i) => { const name = String(rowGet(r, 'item name', 'item', 'name', 'product')).trim(); if (!name) return; const gdn = rowGet(r, 'location', 'godown'); const gd = (S.E.godowns.find(g => nk(g.name) === nk(gdn)) || {}).id || 'gd_main'; ok.push({ name, code: rowGet(r, 'code', 'sku'), cat: rowGet(r, 'category', 'group'), unit: rowGet(r, 'unit', 'uom') || 'Nos', hs: rowGet(r, 'hs code', 'hs'), vat: parseVat(rowGet(r, 'vat (y/n)', 'vat %', 'vat')).tax, vr: parseVat(rowGet(r, 'vat (y/n)', 'vat %', 'vat')).vr, oq: num(rowGet(r, 'opening qty', 'qty', 'quantity')), orate: num(rowGet(r, 'opening rate', 'rate', 'cost')), srate: num(rowGet(r, 'sales rate', 'mrp', 'selling price')) || '', prate: num(rowGet(r, 'purchase rate')) || '', reorder: num(rowGet(r, 'reorder level', 'reorder')) || '', gd }); });
    preview = table([{ k: 'name', t: 'Item' }, { k: 'unit', t: 'Unit' }, { k: 'oq', t: 'Op. qty', n: 1 }, { k: 'orate', t: 'Op. rate', n: 1 }, { k: 'vat', t: 'VAT', f: v => v ? 'Y' : 'N' }], ok.slice(0, 300), { maxh: '45vh' }); }
  if (kind === 'sales' || kind === 'purchase') {
    const isS = kind === 'sales'; const groups = {};
    rows.forEach((r, i) => { const date = parseAnyDate(rowGet(r, 'date (bs)', 'date', 'miti')); const party = String(rowGet(r, isS ? 'customer' : 'supplier', 'party', 'name')).trim(); const no = String(rowGet(r, isS ? 'invoice no' : 'bill no', 'invoice no', 'bill no', 'invoice')).trim(); const line = String(rowGet(r, 'item or ledger', 'item', 'ledger', 'particulars')).trim();
      if (!date || !party || !line) { if (party || line) errs.push(`Row ${i + 2}: date, party and item/ledger are required`); return; }
      const key = date + '|' + party + '|' + (no || ('row' + i)); const gk = groups[key] = groups[key] || { date, party, no, pan: String(rowGet(r, isS ? 'customer pan' : 'supplier pan', 'pan')).replace(/\D/g, ''), pay: rowGet(r, 'payment mode') || (party.toLowerCase() === 'cash' ? 'Cash' : 'Credit'), imp: /^y/i.test(rowGet(r, 'import (y/n)', 'import')), tds: num(rowGet(r, 'tds %', 'tds')), narr: rowGet(r, 'narration', 'remarks'), rows: [] };
      gk.rows.push({ line, qty: rowGet(r, 'qty', 'quantity'), unit: rowGet(r, 'unit'), rate: rowGet(r, 'rate'), disc: num(rowGet(r, 'discount')), amt: num(rowGet(r, 'amount', 'taxable amount')), ...parseVat(rowGet(r, 'vat (y/n)', 'vat %', 'vat rate', 'vat')), row: i + 2 }); });
    Object.values(groups).forEach(g => { const bad = g.rows.filter(x => !itemByName(x.line) && !ledgerByName(x.line) && !num(x.qty)); if (bad.length) { errs.push(`Row ${bad[0].row}: "${bad[0].line}" is not an item or ledger (give Qty & Rate to create it as a new item)`); return; } ok.push(g); });
    preview = table([{ k: 'date', t: 'Date', f: dBS }, { k: 'no', t: 'No.' }, { k: 'party', t: 'Party' }, { k: 'n', t: 'Lines', n: 1, f: (v, r) => r.rows.length }, { k: 'a', t: 'Amount before VAT', n: 1, f: (v, r) => fmt(sum(r.rows, x => num(x.amt) || num(x.qty) * num(x.rate) - x.disc)) }], ok.slice(0, 300), { maxh: '45vh' });
    ok.forEach(o => o.kind = kind);
  }
  if (kind === 'journal') {
    const groups = {}; rows.forEach((r, i) => { const ref = String(rowGet(r, 'voucher ref', 'ref', 'voucher no', 'vch no')).trim() || 'r' + i; const date = parseAnyDate(rowGet(r, 'date (bs)', 'date')); const l = ledgerByName(rowGet(r, 'ledger', 'account', 'particulars')); if (!date) { errs.push(`Row ${i + 2}: bad date`); return; } if (!l) { errs.push(`Row ${i + 2}: ledger "${rowGet(r, 'ledger', 'account')}" not found`); return; } const g = groups[ref + '|' + date] = groups[ref + '|' + date] || { ref, date, type: (String(rowGet(r, 'type (jv/pay/rct/con)', 'type')).toUpperCase() || 'JV'), narr: '', lines: [] }; if (!VTYPES[g.type] || VTYPES[g.type].bill || g.type === 'STJ') g.type = 'JV'; g.lines.push({ l: l.id, dr: r2(rowGet(r, 'debit', 'dr')), cr: r2(rowGet(r, 'credit', 'cr')) }); g.narr = g.narr || rowGet(r, 'narration'); });
    Object.values(groups).forEach(g => { const d = r2(sum(g.lines, x => x.dr) - sum(g.lines, x => x.cr)); if (Math.abs(d) > 0.009) errs.push(`Voucher ${g.ref}: debit and credit differ by ${fmt(d)}`); else ok.push(g); });
    preview = table([{ k: 'ref', t: 'Ref' }, { k: 'date', t: 'Date', f: dBS }, { k: 'type', t: 'Type' }, { k: 'amt', t: 'Amount', n: 1, f: (v, r) => fmt(sum(r.lines, x => x.dr)) }, { k: 'narr', t: 'Narration' }], ok.slice(0, 300), { maxh: '45vh' });
  }
  return { kind, ok, errs, preview };
}
async function commitImport() {
  const P = window._imp; const E = S.E; let n = 0;
  if (P.kind === 'ledgers') { P.ok.forEach(o => { const ex = ledgerByName(o.name); if (ex) Object.assign(ex, { g: ex.sys ? ex.g : o.g, ob: o.ob, pan: o.pan || ex.pan, addr: o.addr || ex.addr, phone: o.phone || ex.phone }); else E.ledgers.push({ id: uid('l'), ...o }); n++; }); }
  if (P.kind === 'parties') { P.ok.forEach(o => { const ex = ledgerByName(o.name); if (ex) Object.assign(ex, { pan: o.pan || ex.pan, addr: o.addr || ex.addr, phone: o.phone || ex.phone, email: o.email || ex.email, cdays: o.cdays || ex.cdays, ob: o.ob || ex.ob }); else E.ledgers.push({ id: uid('l'), ...o }); n++; }); }
  if (P.kind === 'items') { P.ok.forEach(o => { const ex = itemByName(o.name); if (ex) Object.assign(ex, o); else E.items.push({ id: uid('i'), ...o }); n++; }); }
  if (P.kind === 'journal') { for (const g of P.ok) if (await saveVoucher({ type: g.type, date: g.date, narration: g.narr, refNo: g.ref, lines: g.lines })) n++; }
  if (P.kind === 'sales' || P.kind === 'purchase') {
    const isS = P.kind === 'sales';
    for (const g of P.ok) {
      let party = ledgerByName(g.party); if (!party) { party = { id: uid('l'), name: g.party, g: isS ? 'g_debt' : 'g_cred', ob: 0, pan: g.pan }; E.ledgers.push(party); }
      const rows = g.rows.map(x => { let it = itemByName(x.line); const led = !it && ledgerByName(x.line); if (!it && !led) { it = { id: uid('i'), name: x.line, unit: x.unit || 'Nos', vat: x.tax, oq: 0, orate: 0, gd: 'gd_main' }; E.items.push(it); } return it ? { k: 'i', id: it.id, qty: num(x.qty), unit: x.unit || it.unit, rate: num(x.rate) || (num(x.amt) / (num(x.qty) || 1)), disc: x.disc, tax: x.tax, vr: x.vr, gd: it.gd || 'gd_main' } : { k: 'l', id: led.id, qty: '', rate: '', amt: num(x.amt) || num(x.qty) * num(x.rate), disc: 0, tax: x.tax, vr: x.vr }; });
      const v = { type: isS ? 'SAL' : 'PUR', date: g.date, narration: g.narr, bill: { party: party.id, pan: g.pan, payMode: g.pay, rows, billNo: isS ? '' : g.no, billDate: g.date, import: g.imp, tdsRate: g.tds } };
      if (await saveVoucher(v)) n++;
    }
  }
  invalidate(); audit('Bulk import ' + P.kind, n + ' records'); await saveE(); closeModal(); toast(`${n} record(s) imported`); App.render();
}

/* =================== DOCUMENTS =================== */
const DOC_CATS = ['Registration & legal', 'PAN / VAT certificate', 'Tax returns & assessments', 'Audit reports & financials', 'Bills – sales', 'Bills – purchase', 'Bank statements', 'Agreements & contracts', 'Minutes & resolutions', 'Licences & renewals', 'Correspondence', 'Others'];
async function saveDoc(file, meta) { const id = uid('d'); await DB.put('docs', id, { id, entityId: meta.entityId || S.E.id, engId: meta.engId || '', name: file.name || 'scan.jpg', type: file.type, size: file.size, blob: file, cat: meta.cat || 'Others', fy: meta.fy || fyOf(todayAD()), note: meta.note || '', date: todayAD(), by: S.user.email }); return id; }
async function openDoc(id) { return viewDoc(id); }
async function viewDocs() {
  if (!can('docs')) return noAccess();
  const all = (await DB.all('docs')).filter(d => d.entityId === S.E.id); const q = (S.params.q || '').toLowerCase(), cat = S.params.cat || '';
  const list = all.filter(d => (!cat || d.cat === cat) && (!q || (d.name + ' ' + d.note + ' ' + d.fy).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  return `<h2>Documents – ${h(S.E.name)}</h2><p class="muted">Keep all client papers here: certificates, returns, audit reports, agreements, bills. Stored on this device and included in backups.</p>
  <div class="card no-print"><div class="row"><div><label>Category</label><select id="dc_cat">${DOC_CATS.map(c => `<option>${c}</option>`).join('')}</select></div><div><label>Financial year</label><select id="dc_fy">${fyList(S.E).map(f => `<option>${f}</option>`).join('')}</select></div><div><label>Note</label><input id="dc_note"></div><div class="fit"><button class="btn pri" onclick="uploadDocs()">Upload files</button></div></div></div>
  <div class="row no-print"><div><label>Search</label><input value="${h(S.params.q || '')}" onchange="App.setp({q:this.value})"></div><div><label>Category</label><select onchange="App.setp({cat:this.value})"><option value="">All</option>${DOC_CATS.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
  ${table([{ k: 'name', t: 'File' }, { k: 'cat', t: 'Category' }, { k: 'fy', t: 'FY' }, { k: 'note', t: 'Note' }, { k: 'size', t: 'Size', n: 1, f: v => (v / 1024).toFixed(0) + ' KB' }, { k: 'date', t: 'Added', f: dBS }, { k: 'id', t: '', f: v => `<button class="btn sm pri" onclick="viewDoc('${v}')">View</button> <button class="btn sm" onclick="dlDoc('${v}')">Download</button> ${can('delete') ? `<button class="btn sm red" onclick="delDoc('${v}')">Delete</button>` : ''}` }], list)}
  <p class="small muted">${list.length} document(s), ${(sum(all, d => d.size) / 1048576).toFixed(1)} MB</p>`;
}
async function uploadDocs() { const fs = await pickFile('', true); if (!fs || !fs.length) return; for (const f of fs) { if (f.size > 25 * 1048576 && !confirmBox(f.name + ' is larger than 25 MB. Upload anyway?')) continue; await saveDoc(f, { cat: $('#dc_cat').value, fy: $('#dc_fy').value, note: $('#dc_note').value }); } toast(fs.length + ' file(s) saved'); App.render(); }
async function dlDoc(id) { const d = await DB.get('docs', id); download(d.name, d.blob); }
async function delDoc(id) { if (!confirmBox('Delete this document?')) return; await DB.del('docs', id); App.render(); }

/* =================== UPDATES (Nepal law & tax news) =================== */
const SEED_UPDATES = [
  { id: 's1', d: '2026-10-31', cat: 'VAT', t: 'VAT rate 13%; monthly return & payment by the 25th of the following BS month', b: 'Standard VAT rate is 13% (exports zero-rated). VAT returns and payment are due within 25 days of the end of each month (some taxpayers are allowed trimester filing). Late filing and late payment attract fees and interest.' },
  { id: 's2', d: '2026-10-31', cat: 'VAT', t: 'VAT registration thresholds', b: 'Compulsory VAT registration applies when annual turnover crosses the threshold set in the VAT Act/Finance Act (historically Rs 50 lakh for goods-only businesses and Rs 20 lakh for services or mixed). Certain businesses must register regardless of turnover. Verify the limit for the current year.' },
  { id: 's3', d: '2026-10-31', cat: 'E-billing', t: 'Real-time e-billing (CBMS) for large taxpayers', b: 'IRD requires notified taxpayers above a turnover limit to issue bills through IRD-registered billing software connected to the Central Billing Monitoring System (CBMS) in real time. Billing software must not allow deletion of issued invoices, must mark reprints as "Copy of original" and keep an audit trail. Check the current IRD notice for the turnover limit and the software registration list.' },
  { id: 's4', d: '2026-10-31', cat: 'TDS', t: 'Common TDS rates (verify each Finance Act)', b: 'House/land rent 10% · service fee paid to VAT-registered persons 1.5% · other service fees 15% · contract payments above the limit 1.5% · interest/commission 15% · dividend 5% · meeting allowance 15%. Deposit and file e-TDS by the 25th of the next month.' },
  { id: 's5', d: '2026-10-31', cat: 'Income tax', t: 'Advance tax and annual return deadlines', b: 'Advance tax: 40% by end of Poush, 70% by end of Chaitra, 100% by end of Ashadh. Annual income tax return is due within three months of the year end (end of Ashwin), extendable by up to three months on application.' },
  { id: 's6', d: '2026-10-31', cat: 'Company registry', t: 'OCR annual compliance', b: 'Companies must hold the AGM and submit annual returns / audited financial statements to the Office of Company Registrar within the time prescribed by the Companies Act, 2063. Private companies have specific timelines; check OCR notices for current requirements and fines.' },
  { id: 's7', d: '2026-10-31', cat: 'Accounting standards', t: 'NFRS framework', b: 'Accounting Standards Board (ASB) Nepal prescribes full NFRS for listed and large entities, NFRS for SMEs for small and medium entities and NAS for Micro Entities for micro entities, plus guidance for NPOs. Check the ASB notices for applicability thresholds and effective dates.' },
  { id: 's8', d: '2026-10-31', cat: 'Budget', t: 'Annual budget & Finance Act (Jestha 15)', b: 'The federal budget is presented on Jestha 15 each year; the Finance Act amends VAT, income tax, excise and customs rates from Shrawan 1. After each budget, update TDS rates, slab rates and duty rates – use "Check for new updates" or add notes here.' },
];
async function getUpdates() { const u = (await DB.get('kv', 'updates')) || []; const ids = new Set(u.map(x => x.id)); return [...u, ...(isINTL() ? [] : SEED_UPDATES).filter(s => !ids.has(s.id))].filter(x => !x.deleted).sort((a, b) => b.d.localeCompare(a.d)); }
async function viewUpdates() {
  const list = await getUpdates(); const cat = S.params.cat || ''; const cats = Array.from(new Set(list.map(x => x.cat))).sort(); const lastChk = await DB.get('kv', 'updatesChecked');
  const links = isINTL() ? [['IFRS Foundation', 'https://www.ifrs.org'], ['OECD tax', 'https://www.oecd.org/tax/']] : [['Inland Revenue Department', 'https://ird.gov.np'], ['Office of Company Registrar', 'https://ocr.gov.np'], ['Department of Customs', 'https://customs.gov.np'], ['Ministry of Finance', 'https://mof.gov.np'], ['Nepal Rastra Bank', 'https://nrb.org.np'], ['Social Security Fund', 'https://ssf.gov.np'], ['Accounting Standards Board', 'https://asb.org.np'], ['ICAN', 'https://ican.org.np'], ['Nepal Law Commission', 'https://lawcommission.gov.np']];
  return `<h2>Latest changes in Nepal</h2><p class="muted">IRD, VAT, TDS, customs, excise, e-billing, company registry and government relief. Updates you publish online reach all your clients when they are connected; everything stays readable offline.</p>
  <div class="btns no-print"><button class="btn pri" onclick="checkUpdates()">Check for new updates</button>${S.user.role === 'admin' ? `<button class="btn" onclick="editUpdate()">+ Add update</button><button class="btn" onclick="exportUpdatesJSON()">Export for publishing</button>` : ''}</div>
  <p class="small muted">${lastChk ? 'Last checked online: ' + h(lastChk.slice(0, 16).replace('T', ' ')) : 'Not checked online yet.'}</p>
  <div class="seg"><button class="${!cat ? 'on' : ''}" onclick="App.setp({cat:''})">All</button>${cats.map(c => `<button class="${c === cat ? 'on' : ''}" onclick="App.setp({cat:'${h(c)}'})">${h(c)}</button>`).join('')}</div>
  ${list.filter(x => !cat || x.cat === cat).map(u => `<div class="upd"><div class="sub">${h(u.cat)} · ${toBS(u.d)} BS ${u.src ? '· <a href="' + h(u.src) + '" target="_blank" rel="noopener">source</a>' : ''} ${u.id.startsWith('s') ? '· <span class="pill y">verify with official source</span>' : ''}</div><b>${h(u.t)}</b><div>${h(u.b)}</div>${S.user.role === 'admin' ? `<button class="btn sm no-print" onclick="editUpdate('${u.id}')">Edit</button>` : ''}</div>`).join('')}
  <div class="card"><h3>Official websites</h3>${links.map(([t, u]) => `<a class="btn sm" href="${u}" target="_blank" rel="noopener">${t}</a>`).join(' ')}</div>`;
}
async function editUpdate(id) { const list = await getUpdates(); const u = list.find(x => x.id === id) || { d: todayAD(), cat: 'VAT' };
  modal(id ? 'Edit update' : 'Add update', `<div class="row"><div><label>Category</label><input id="up_cat" value="${h(u.cat)}" list="dl_ucat"><datalist id="dl_ucat">${['VAT', 'TDS', 'Income tax', 'Customs', 'Excise', 'E-billing', 'Company registry', 'Accounting standards', 'Budget', 'Relief', 'Labour & SSF', 'Banking'].map(c => `<option value="${c}">`).join('')}</datalist></div>${dateInput('up_d', u.d)}</div><label>Title</label><input id="up_t" value="${h(u.t || '')}"><label>Details</label><textarea id="up_b" rows="5">${h(u.b || '')}</textarea><label>Source link</label><input id="up_src" value="${h(u.src || '')}">
  <div class="btns"><button class="btn pri" onclick="saveUpdate('${id || ''}')">Save</button>${id ? `<button class="btn red" onclick="saveUpdate('${id}',true)">Delete</button>` : ''}</div>`); }
async function saveUpdate(id, del) { const u = (await DB.get('kv', 'updates')) || []; const o = del ? { id, deleted: true, d: '0' } : { id: id || uid('u'), cat: $('#up_cat').value.trim(), d: readDate('up_d') || todayAD(), t: $('#up_t').value.trim(), b: $('#up_b').value.trim(), src: $('#up_src').value.trim() }; const i = u.findIndex(x => x.id === o.id); if (i >= 0) u[i] = o; else u.push(o); await DB.put('kv', 'updates', u); closeModal(); App.render(); }
async function checkUpdates() {
  const url = S.settings.updatesUrl || 'updates.json';
  try { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const data = await r.json(); const u = (await DB.get('kv', 'updates')) || []; let n = 0; (data.updates || data).forEach(x => { const i = u.findIndex(y => y.id === x.id); if (i < 0) { u.push(x); n++; } else if (JSON.stringify(u[i]) !== JSON.stringify(x)) { u[i] = x; n++; } }); await DB.put('kv', 'updates', u); await DB.put('kv', 'updatesChecked', new Date().toISOString()); toast(n ? n + ' new / changed update(s)' : 'You are up to date'); App.render(); }
  catch (e) { toast('Could not check online (' + e.message + '). You may be offline.', 1); }
}
async function exportUpdatesJSON() { const u = await getUpdates(); download('updates.json', JSON.stringify({ updated: new Date().toISOString(), updates: u }, null, 1), 'application/json'); toast('Upload this updates.json to your website folder to publish to all clients'); }

/* =================== PRACTICE: deadlines (rest in firm.js) =================== */
async function editTask(id) { const P = await getPractice(); const t = P.tasks.find(x => x.id === id) || { st: 'To do', due: todayAD() };
  modal(id ? 'Edit task' : 'New task', `<div class="row"><div><label>Client</label><select id="tk_e"><option value="">(general)</option>${S.entities.map(e => `<option value="${e.id}" ${e.id === t.e ? 'selected' : ''}>${h(e.name)}</option>`).join('')}</select></div>${dateInput('tk_due', t.due, 'Due date (BS)')}</div><label>Task</label><input id="tk_title" value="${h(t.title || '')}"><div class="row"><div><label>Assigned to</label><input id="tk_who" value="${h(t.who || '')}"></div><div><label>Status</label><select id="tk_st">${['To do', 'In progress', 'Waiting for client', 'Done'].map(s => `<option ${s === t.st ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div><label>Notes</label><textarea id="tk_n">${h(t.notes || '')}</textarea>
  <div class="btns"><button class="btn pri" onclick="saveTask('${id || ''}')">Save</button>${id ? `<button class="btn red" onclick="saveTask('${id}',1)">Delete</button>` : ''}</div>`); }
async function saveTask(id, del) { const P = await getPractice(); if (del) P.tasks = P.tasks.filter(t => t.id !== id); else { const o = { id: id || uid('t'), e: $('#tk_e').value, due: readDate('tk_due'), title: $('#tk_title').value.trim(), who: $('#tk_who').value.trim(), st: $('#tk_st').value, notes: $('#tk_n').value }; const i = P.tasks.findIndex(t => t.id === o.id); if (i >= 0) P.tasks[i] = o; else P.tasks.push(o); } await DB.put('kv', 'practice', P); closeModal(); App.render(); }
async function autoTasks() { const P = await getPractice(); const t = bsParts(todayAD()); const due = toAD(`${t.y}-${t.m}-25`); const lm = BS_MONTHS[(t.m + 10) % 12]; let n = 0; for (const e of S.entities) { const E = await DB.get('entities', e.id); const items = [(E && E.legal.vatReg) ? `VAT return – ${lm}` : null, `TDS return – ${lm}`].filter(Boolean); items.forEach(title => { if (!P.tasks.some(x => x.e === e.id && x.title === title)) { P.tasks.push({ id: uid('t'), e: e.id, due, title, st: 'To do' }); n++; } }); } await DB.put('kv', 'practice', P); toast(n + ' task(s) added'); App.render(); }
/* =================== BACKUP / RESTORE =================== */
async function buildBackup(onlyEntity) {
  const kv = {}; for (const k of await DB.keys('kv')) kv[k] = await DB.get('kv', k);
  const ents = {}; for (const k of await DB.keys('entities')) if (!onlyEntity || k === onlyEntity) ents[k] = await DB.get('entities', k);
  const docs = []; for (const d of await DB.all('docs')) if (!onlyEntity || d.entityId === onlyEntity) docs.push({ ...d, blob: await blobToDataURL(d.blob) });
  if (onlyEntity) { const keep = {}; ['entities'].forEach(k => keep[k] = (kv[k] || []).filter(e => e.id === onlyEntity)); return JSON.stringify({ app: 'LekhaPal', v: APP.version, at: new Date().toISOString(), only: onlyEntity, kv: keep, ents, docs }); }
  return JSON.stringify({ app: 'LekhaPal', v: APP.version, at: new Date().toISOString(), kv, ents, docs });
}
async function backupNow() {
  const pass = prompt('Choose a password for this backup file (you need it to restore):'); if (!pass) return;
  toast('Preparing backup…'); const data = await encryptText(await buildBackup(), pass); const name = `LekhaPal-backup-${toBS(todayAD())}.smlb`;
  download(name, data, 'application/octet-stream'); await DB.put('kv', 'lastBackup', new Date().toISOString()); toast('Backup downloaded: ' + name);
}
async function restoreBackupFlow() {
  const f = await pickFile('.smlb,.json'); if (!f) return; const pass = prompt('Backup password:'); if (pass === null) return;
  let o; try { o = JSON.parse(await decryptText(await f.text(), pass)); } catch (e) { return toast('Wrong password or damaged file', 1); }
  if (!['LekhaPal', 'LekhaPal'].includes(o.app)) return toast('Not a LekhaPal backup file', 1);
  if (o.only) { const nm = ((o.kv.entities || [])[0] || {}).name || 'entity'; if (!confirmBox(`This backup contains only "${nm}" from ${o.at.slice(0, 16).replace('T', ' ')}.\nRestore it? Other entities on this device are not touched; this entity is replaced.`)) return;
    for (const d of await DB.all('docs')) if (d.entityId === o.only) await DB.del('docs', d.id); await DB.put('entities', o.only, o.ents[o.only]); for (const d of o.docs) await DB.put('docs', d.id, { ...d, blob: await dataURLToBlob(d.blob) });
    S.entities = (await DB.get('kv', 'entities')) || []; const meta = (o.kv.entities || [])[0]; S.entities = S.entities.filter(e => e.id !== o.only); if (meta) S.entities.push(meta); await saveEntities(); toast('Entity restored'); setTimeout(() => location.reload(), 1000); return; }
  if (!confirmBox(`Restore backup from ${o.at.slice(0, 16).replace('T', ' ')}?\n\nThis REPLACES all data on this device (${Object.keys(o.ents).length} entities). Export a backup of the current data first if you need it.`)) return;
  for (const k of await DB.keys('entities')) await DB.del('entities', k); for (const k of await DB.keys('docs')) await DB.del('docs', k);
  for (const [k, v] of Object.entries(o.kv)) if (k !== 'backupDir') await DB.put('kv', k, v);
  for (const [k, v] of Object.entries(o.ents)) await DB.put('entities', k, v);
  for (const d of o.docs) await DB.put('docs', d.id, { ...d, blob: await dataURLToBlob(d.blob) });
  toast('Backup restored. Please log in.'); setTimeout(() => location.reload(), 1200);
}

/* =================== SETTINGS =================== */
async function viewSettings() {
  const E = S.E; const st = E ? E.settings : {}; const lic = licenseState(); const iid = await installId(); const lb = await DB.get('kv', 'lastBackup'); const bkl = (await DB.get('kv', 'bkLog')) || {};
  return `<h2>Settings</h2>
  ${E && can('settings') ? `<div class="card"><h3>Entity settings – ${h(E.name)}</h3><div class="grid3">
  <div><label>Stock valuation method</label><select id="st_sm"><option value="WAVG" ${st.stockMethod !== 'FIFO' ? 'selected' : ''}>Weighted average</option><option value="FIFO" ${st.stockMethod === 'FIFO' ? 'selected' : ''}>FIFO</option></select></div>
  <div><label>VAT rate %</label><input id="st_vat" value="${st.vatRate}"></div><div><label>Sales invoice prefix</label><input id="st_pre" value="${h(st.invPrefix)}"></div>
  ${dateInput('st_bf', booksStart(E), 'Books beginning from (BS)')}${dateInput('st_lock', st.lockDate || '', 'Lock entries up to (BS) – blank = none')}<div><label>Invoice footer</label><input id="st_ft" value="${h(st.invFooter || '')}"></div>
  <div><label>IRD billing rules (no delete, reprint marking)</label><select id="st_bc"><option value="1" ${st.billCompliance ? 'selected' : ''}>On</option><option value="" ${!st.billCompliance ? 'selected' : ''}>Off</option></select></div><div><label>Warn on negative stock</label><select id="st_neg"><option value="1" ${st.negativeStockWarn ? 'selected' : ''}>Yes</option><option value="" ${!st.negativeStockWarn ? 'selected' : ''}>No</option></select></div><div><label>Current FY (default for reports)</label><select id="st_fy">${fyList(E).map(f => `<option ${f === E.fy ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
  ${isINTL() ? '' : `  <h3>IRD CBMS (real-time e-billing)</h3><div class="grid3"><div><label>CBMS username</label><input id="st_cu" value="${h(st.cbmsUser || '')}"></div><div><label>CBMS password</label><input id="st_cp" type="password" value="${h(st.cbmsPass || '')}"></div><div><label>API address</label><input id="st_curl" value="${h(st.cbmsUrl || 'https://cbapi.ird.gov.np')}"></div><div><label>Send automatically when invoice is saved</label><select id="st_cl"><option value="" ${!st.cbmsLive ? 'selected' : ''}>No</option><option value="1" ${st.cbmsLive ? 'selected' : ''}>Yes (when online)</option></select></div></div>`}
  <div class="btns"><button class="btn pri" onclick="saveEntitySettings()">Save entity settings</button></div></div>${isINTL() ? intlSettingsCard(E) : ''}` : ''}
  <div class="card"><h3>Backup & restore</h3><p class="small muted">Your data lives in this browser on this device. Take regular backups – clearing browser data or losing the device would lose it. Use a backup file to move data to another laptop or phone.</p><p>Last backup: <b>${lb ? h(lb.slice(0, 16).replace('T', ' ')) : 'never'}</b></p>
  <div class="btns"><button class="btn pri" onclick="backupNow()">Download backup file</button><button class="btn" onclick="restoreBackupFlow()">Restore from backup</button></div>
  ${S.user.role === 'admin' ? `<h3>Automatic daily backup</h3><p class="small muted">Once a day LekhaPal writes an encrypted backup into the folders below (keeps the last ${BK_KEEP} days). Choose a folder inside Google Drive / OneDrive / Dropbox for an off-site copy. Works in Chrome or Edge on a computer.</p>
  ${table([{ k: 'name', t: 'What' }, { k: 'f', t: 'Folder' }, { k: 'last', t: 'Last backup' }, { k: 'key', t: '', f: (v, r) => r.only ? `<button class="btn sm" onclick="chooseBackupFolder('${r.only}')">Change</button> <button class="btn sm red" onclick="removeBackupFolder('${r.only}')">Remove</button>` : `<button class="btn sm" onclick="chooseBackupFolder()">Change</button> <button class="btn sm red" onclick="removeBackupFolder()">Remove</button>` }], (await bkDirs()).map(d => ({ ...d, f: d.h.name, last: (bkl[d.key] ? toBS(bkl[d.key]) : 'not yet') })), { empty: 'No automatic backup folder set' })}
  <div class="btns"><button class="btn" onclick="chooseBackupFolder()">${(await DB.get('kv', 'backupDir')) ? 'Change' : 'Choose'} folder for ALL data</button>${E ? `<button class="btn" onclick="chooseBackupFolder('${E.id}')">Folder for ${h(E.name)} only</button>` : ''}<button class="btn pri" onclick="runDailyBackups(true,true)">Back up now</button><button class="btn" onclick="askBackupPass()">Change backup password</button></div>` : ''}</div>
  <div class="card"><h3>Licence</h3><p>${h(lic.label)}</p><p class="small">Install ID: <b>${iid}</b></p><label>Licence key</label><textarea id="st_lic" rows="3" placeholder="Paste the key received from CA Sudanshu Mallick"></textarea><div class="btns"><button class="btn pri" onclick="applyLicense($('#st_lic').value)">Activate</button></div></div>
  <div class="card"><h3>My account</h3><p>${h(S.user.name)} · ${h(S.user.email)}</p><div class="btns"><button class="btn" onclick="changeMyPassword()">Change password / recovery code</button></div></div>
  ${S.user.role === 'admin' ? `<div class="card"><h3>Application (administrator)</h3><div class="grid2"><div><label>Updates feed address (where you publish updates.json)</label><input id="ap_url" value="${h(S.settings.updatesUrl || '')}" placeholder="updates.json (same website)"></div><div><label>Your firm name (shown on dashboard)</label><input id="ap_firm" value="${h(S.settings.firm || '')}" placeholder="Sudanshu Mallick & Associates"></div></div><div class="btns"><button class="btn" onclick="(async()=>{S.settings.updatesUrl=$('#ap_url').value.trim();S.settings.firm=$('#ap_firm').value.trim();await DB.put('kv','settings',S.settings);toast('Saved')})()">Save</button><button class="btn" onclick="App.go('admin')">Admin & subscriptions</button></div></div>` : ''}
  <div class="card"><h3>App version</h3><p>LekhaPal <b>v${APP.version}</b> · Developed by <b>CA Sudanshu Mallick</b> · ${APP.devEmail}</p><p class="small muted">After copying a new version into the LekhaPal folder, click below once. Your books and documents are not touched.</p><div class="btns"><button class="btn" onclick="refreshApp()">Load latest app version</button></div></div>`;
}
async function saveEntitySettings() {
  const st = S.E.settings; st.stockMethod = $('#st_sm').value; st.vatRate = num($('#st_vat').value) || 13; st.invPrefix = $('#st_pre').value.trim() || 'SI'; st.booksFrom = readDate('st_bf') || st.booksFrom; st.lockDate = $('#st_lock').value.trim() ? readDate('st_lock') : ''; st.invFooter = $('#st_ft').value;
  st.billCompliance = !!$('#st_bc').value; st.negativeStockWarn = !!$('#st_neg').value; S.E.fy = $('#st_fy').value; if ($('#st_cu')) { st.cbmsUser = $('#st_cu').value.trim(); st.cbmsPass = $('#st_cp').value; st.cbmsUrl = $('#st_curl').value.trim(); st.cbmsLive = !!$('#st_cl').value; }
  audit('Settings changed'); invalidate(); await saveE(); toast('Saved'); App.render();
}

/* =================== DEVELOPER (licence generator) =================== */
let DEVKEY = null;
function viewDeveloper() {
  modal('Developer tools – CA Sudanshu Mallick', `${DEVKEY ? '<div class="alert g">Private key loaded.</div>' : `<p>Load your private key file <b>ADMIN-PRIVATE-LICENSE-KEY.json</b> (keep it secret – never upload it to the website).</p><div class="btns"><button class="btn pri" onclick="loadDevKey()">Load private key file</button></div>`}
  ${DEVKEY ? `<h3>Issue licence key</h3><div class="row"><div><label>Client name</label><input id="dv_c"></div><div><label>Client email</label><input id="dv_e"></div></div><div class="row"><div><label>Plan</label><select id="dv_p"><option>Basic</option><option>Standard</option><option>Premium</option><option>Practice</option></select></div><div><label>Max entities (0 = unlimited)</label><input id="dv_n" value="1"></div><div><label>Max users (0 = unlimited)</label><input id="dv_u" value="2"></div></div>
  <div class="row"><div><label>Valid until (AD, blank = lifetime)</label><input id="dv_x" type="date"></div><div><label>Lock to Install ID (optional)</label><input id="dv_iid"></div></div><div class="btns"><button class="btn pri" onclick="genLicense()">Generate key</button></div>
  <h3>Admin password reset code</h3><div class="row"><div><label>Client Install ID</label><input id="dv_riid"></div><div class="fit"><button class="btn" onclick="genReset()">Generate reset code</button></div></div><textarea id="dv_out" rows="4" readonly placeholder="Key appears here"></textarea>` : ''}`);
}
async function loadDevKey() { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await f.text()); const k = o.key || o; const t = await signPayload({ t: 'test' }, k); if (!(await verifySigned(t))) throw 0; DEVKEY = k; toast('Private key loaded'); if (S.route === 'admin') { closeModal(); App.render(); } else viewDeveloper(); } catch (e) { toast('That is not the matching private key', 1); } }
async function genLicense() { const p = { t: 'lic', c: $('#dv_c').value.trim(), e: $('#dv_e').value.trim(), p: $('#dv_p').value, n: num($('#dv_n').value), u: num($('#dv_u').value), x: $('#dv_x').value || '', i: todayAD(), id: uid('L') }; const iid = $('#dv_iid').value.trim(); if (iid) p.iid = iid; if (!p.c) return toast('Client name required', 1); $('#dv_out').value = await signPayload(p, DEVKEY); const log = (await DB.get('kv', 'licLog')) || []; log.push({ ...p, key: $('#dv_out').value }); await DB.put('kv', 'licLog', log); toast('Licence key generated – copy and send to client'); }
async function genReset() { const iid = $('#dv_riid').value.trim(); if (!iid) return toast('Enter Install ID', 1); $('#dv_out').value = await signPayload({ t: 'reset', iid, x: addDays(todayAD(), 3) }, DEVKEY); toast('Reset code valid for 3 days'); }
