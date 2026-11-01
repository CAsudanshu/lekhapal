/* Entities (clients / companies), legal details, chart of accounts, items */
'use strict';

const ENTITY_TYPES = ['Private Limited Company', 'Public Limited Company', 'Sole Proprietorship', 'Partnership Firm', 'NGO / NPO', 'INGO', 'Cooperative', 'Trust / Guthi', 'Branch / Liaison office of foreign company', 'Other'];
const isNPO = E => /NGO|NPO|INGO|Trust/.test(E.type || '');

/* Financial statement heads (used for NFRS statements, cash flow and mapping) */
const FS_HEADS = {
  PPE: { t: 'Property, plant and equipment', s: 'A', c: 'NCA', cf: 'inv' }, INTANG: { t: 'Intangible assets', s: 'A', c: 'NCA', cf: 'inv' },
  INVPROP: { t: 'Investment property', s: 'A', c: 'NCA', cf: 'inv' }, LTINV: { t: 'Long-term investments', s: 'A', c: 'NCA', cf: 'inv' },
  DTA: { t: 'Deferred tax assets', s: 'A', c: 'NCA', cf: 'op' }, ONCA: { t: 'Other non-current assets', s: 'A', c: 'NCA', cf: 'inv' },
  INVENT: { t: 'Inventories', s: 'A', c: 'CA', cf: 'op' }, TRADEREC: { t: 'Trade receivables', s: 'A', c: 'CA', cf: 'op' },
  ADV: { t: 'Advances, deposits and prepayments', s: 'A', c: 'CA', cf: 'op' }, CTA: { t: 'Current tax assets (advance tax / TDS)', s: 'A', c: 'CA', cf: 'op' },
  STINV: { t: 'Short-term investments', s: 'A', c: 'CA', cf: 'inv' }, CASH: { t: 'Cash and cash equivalents', s: 'A', c: 'CA', cf: 'cash' },
  SHARECAP: { t: 'Share capital / Capital account', s: 'Q', c: 'EQ', cf: 'fin' }, RESERVE: { t: 'Reserves and retained earnings', s: 'Q', c: 'EQ', cf: 'fin' },
  OCIRES: { t: 'Other reserves (OCI)', s: 'Q', c: 'EQ', cf: 'fin' }, FUND: { t: 'Fund balances', s: 'Q', c: 'EQ', cf: 'fin' },
  LTBORR: { t: 'Long-term borrowings', s: 'L', c: 'NCL', cf: 'fin' }, DTL: { t: 'Deferred tax liabilities', s: 'L', c: 'NCL', cf: 'op' },
  LTPROV: { t: 'Long-term provisions (employee benefits)', s: 'L', c: 'NCL', cf: 'op' }, STBORR: { t: 'Short-term borrowings', s: 'L', c: 'CL', cf: 'fin' },
  TRADEPAY: { t: 'Trade payables', s: 'L', c: 'CL', cf: 'op' }, OCL: { t: 'Other current liabilities (statutory dues etc.)', s: 'L', c: 'CL', cf: 'op' },
  CTL: { t: 'Current tax liabilities', s: 'L', c: 'CL', cf: 'op' }, STPROV: { t: 'Provisions', s: 'L', c: 'CL', cf: 'op' },
  REV: { t: 'Revenue from operations', s: 'I', c: 'PL' }, GRANT: { t: 'Grants and donations', s: 'I', c: 'PL' }, OI: { t: 'Other income', s: 'I', c: 'PL' },
  PURCH: { t: 'Purchases', s: 'E', c: 'COS' }, DIRECT: { t: 'Direct expenses', s: 'E', c: 'COS' },
  EMP: { t: 'Employee benefit expenses', s: 'E', c: 'PL' }, ADMIN: { t: 'Administrative and other expenses', s: 'E', c: 'PL' },
  SELL: { t: 'Selling and distribution expenses', s: 'E', c: 'PL' }, PROG: { t: 'Programme expenses', s: 'E', c: 'PL' },
  DEP: { t: 'Depreciation and amortisation', s: 'E', c: 'PL' }, FIN: { t: 'Finance costs', s: 'E', c: 'PL' },
  TAX: { t: 'Income tax expense', s: 'E', c: 'TAX' }, OCI: { t: 'Other comprehensive income', s: 'I', c: 'OCI' },
};
/* nature: A asset, L liability, Q equity, I income, E expense */
function defaultGroups(npo) {
  const G = [
    ['g_cap', npo ? 'Fund Account' : 'Capital Account', '', 'Q', npo ? 'FUND' : 'SHARECAP'], ['g_res', 'Reserves & Surplus', '', 'Q', 'RESERVE'],
    ['g_loan', 'Loans (Liability)', '', 'L', 'LTBORR'], ['g_sec', 'Secured Loans', 'g_loan', 'L', 'LTBORR'], ['g_unsec', 'Unsecured Loans', 'g_loan', 'L', 'LTBORR'], ['g_od', 'Bank OD / Short-term Loans', 'g_loan', 'L', 'STBORR'],
    ['g_cl', 'Current Liabilities', '', 'L', 'OCL'], ['g_cred', 'Sundry Creditors', 'g_cl', 'L', 'TRADEPAY'], ['g_tax', 'Duties & Taxes', 'g_cl', 'L', 'OCL'], ['g_prov', 'Provisions', 'g_cl', 'L', 'STPROV'], ['g_itp', 'Income Tax Payable', 'g_cl', 'L', 'CTL'],
    ['g_fa', 'Fixed Assets', '', 'A', 'PPE'], ['g_intang', 'Intangible Assets', 'g_fa', 'A', 'INTANG'], ['g_inv', 'Investments', '', 'A', 'LTINV'],
    ['g_ca', 'Current Assets', '', 'A', 'ADV'], ['g_debt', 'Sundry Debtors', 'g_ca', 'A', 'TRADEREC'], ['g_cash', 'Cash-in-hand', 'g_ca', 'A', 'CASH'], ['g_bank', 'Bank Accounts', 'g_ca', 'A', 'CASH'],
    ['g_adv', 'Loans & Advances (Asset)', 'g_ca', 'A', 'ADV'], ['g_dep', 'Deposits (Asset)', 'g_ca', 'A', 'ADV'], ['g_advtax', 'Advance Tax & TDS Receivable', 'g_ca', 'A', 'CTA'], ['g_stock', 'Stock-in-hand', 'g_ca', 'A', 'INVENT'],
    ['g_sales', 'Sales Accounts', '', 'I', 'REV'], ['g_dinc', 'Direct Incomes', '', 'I', 'REV'], ['g_iinc', 'Indirect Incomes', '', 'I', 'OI'],
    ['g_pur', 'Purchase Accounts', '', 'E', 'PURCH'], ['g_dexp', 'Direct Expenses', '', 'E', 'DIRECT'], ['g_iexp', 'Indirect Expenses', '', 'E', 'ADMIN'],
    ['g_emp', 'Employee Expenses', 'g_iexp', 'E', 'EMP'], ['g_sell', 'Selling & Distribution', 'g_iexp', 'E', 'SELL'], ['g_depn', 'Depreciation', 'g_iexp', 'E', 'DEP'], ['g_finc', 'Finance Costs', 'g_iexp', 'E', 'FIN'],
    ['g_itax', 'Income Tax Expense', '', 'E', 'TAX'], ['g_susp', 'Suspense Account', '', 'A', 'ADV'],
  ];
  if (npo) G.push(['g_grant', 'Grants & Donations', '', 'I', 'GRANT'], ['g_prog', 'Programme Expenses', '', 'E', 'PROG']);
  return G.map(([id, name, parent, nature, fs]) => ({ id, name, parent, nature, fs, sys: true }));
}
function defaultLedgers(npo) {
  const L = [
    ['l_cash', 'Cash', 'g_cash', 'cash'], ['l_sales', 'Sales', 'g_sales', 'sales'], ['l_salesret', 'Sales Return', 'g_sales', 'salesRet'],
    ['l_pur', 'Purchase', 'g_pur', 'purchase'], ['l_purret', 'Purchase Return', 'g_pur', 'purRet'], ['l_vat', 'VAT Account', 'g_tax', 'vat'],
    ['l_tdspay', 'TDS Payable', 'g_tax', 'tdsPay'], ['l_tdsrec', 'TDS Receivable', 'g_advtax', 'tdsRec'], ['l_advtax', 'Advance Income Tax', 'g_advtax', ''],
    ['l_excise', 'Excise Duty Payable', 'g_tax', 'excise'],
    ['l_cap', npo ? 'General Fund' : 'Capital / Share Capital', 'g_cap', 'capital'], ['l_re', 'Retained Earnings', 'g_res', 're'],
    ['l_freight', 'Freight & Carriage Inward', 'g_dexp', 'freight'], ['l_customs', 'Customs Duty & Import Charges', 'g_dexp', ''],
    ['l_salary', 'Salary & Wages', 'g_emp', ''], ['l_ssf', 'SSF Contribution (Employer)', 'g_emp', ''], ['l_rent', 'Rent', 'g_iexp', ''], ['l_office', 'Office Expenses', 'g_iexp', ''],
    ['l_audit', 'Audit Fee', 'g_iexp', ''], ['l_util', 'Electricity & Water', 'g_iexp', ''], ['l_comm', 'Telephone & Internet', 'g_iexp', ''], ['l_fuel', 'Fuel & Vehicle Expenses', 'g_iexp', ''],
    ['l_repair', 'Repair & Maintenance', 'g_iexp', ''], ['l_adv', 'Advertisement', 'g_sell', ''], ['l_bankchg', 'Bank Charges', 'g_finc', ''], ['l_int', 'Interest Expense', 'g_finc', ''],
    ['l_depn', 'Depreciation', 'g_depn', ''], ['l_discall', 'Discount Allowed', 'g_sell', 'discAllowed'], ['l_discrec', 'Discount Received', 'g_iinc', 'discReceived'],
    ['l_round', 'Round Off', 'g_iexp', 'round'], ['l_intinc', 'Interest Income', 'g_iinc', ''], ['l_itexp', 'Income Tax Expense', 'g_itax', ''], ['l_itpay', 'Income Tax Payable', 'g_itp', ''],
    ['l_salpay', 'Salary Payable', 'g_prov', ''], ['l_auditpay', 'Audit Fee Payable', 'g_prov', ''],
  ];
  if (npo) L.push(['l_grant', 'Grant Income', 'g_grant', ''], ['l_don', 'Donation Received', 'g_grant', ''], ['l_prog', 'Programme Expenses', 'g_prog', '']);
  return L.map(([id, name, g, sys]) => ({ id, name, g, sys, ob: 0 }));
}
function newEntityObject(f) {
  const npo = /NGO|NPO|INGO|Trust/.test(f.type);
  return {
    id: uid('e'), name: f.name, type: f.type, created: todayAD(), fy: fyOf(todayAD(), { edition: 'NP' }),
    legal: Object.assign({ pan: '', vatReg: true, address: '', phone: '', email: '', directors: [], shareholders: [], licenses: [] }, f.legal || {}),
    settings: { stockMethod: 'WAVG', vatRate: 13, invPrefix: 'SI', billCompliance: true, negativeStockWarn: true, lockDate: '', cbmsUser: '', cbmsPass: '', cbmsLive: false, invFooter: 'Thank you for your business.' },
    groups: defaultGroups(npo), ledgers: defaultLedgers(npo), items: [], godowns: [{ id: 'gd_main', name: 'Main Location' }],
    vouchers: [], seq: {}, migration: {}, audit: [], vatFiled: {}, thirdParty: [], tasks: [], projection: null, assets: [], ocrSeen: {},
  };
}

/* ---------- persistence ---------- */
async function saveEntities() { await DB.put('kv', 'entities', S.entities); }
async function saveE(E = S.E) {
  if (!E) return; E.updated = new Date().toISOString();
  await DB.put('entities', E.id, E);
  const m = S.entities.find(x => x.id === E.id); if (m) { m.name = E.name; m.type = E.type; m.pan = E.legal.pan; m.updated = E.updated; await saveEntities(); }
}
function audit(action, ref) { if (!S.E) return; S.E.audit.unshift({ t: new Date().toISOString(), u: S.user ? S.user.email : '', a: action, r: ref || '' }); if (S.E.audit.length > 10000) S.E.audit.length = 10000; }
async function openEntity(id) {
  if (!canEntity(id)) return toast('No access to this entity', 1);
  const E = await DB.get('entities', id); if (!E) return toast('Entity not found', 1);
  migrateEntity(E); if (S.license && typeof allowedEditions === 'function' && !allowedEditions().includes(E.edition)) return toast(`"${E.name}" uses the ${E.edition === 'INTL' ? 'International' : 'Nepal'} edition, which your licence does not include.`, 1); S.E = E; try { localStorage.setItem('sml_last_' + S.user.id, id); } catch (e) { }
  App.go('home');
}
function migrateEntity(E) { ['vouchers', 'items', 'godowns', 'audit', 'tasks', 'assets', 'thirdParty', 'trash'].forEach(k => E[k] = E[k] || []); E.edition = E.edition || 'NP'; E.seq = E.seq || {}; E.migration = E.migration || {}; E.vatFiled = E.vatFiled || {}; E.ocrSeen = E.ocrSeen || {}; E.settings = Object.assign({ stockMethod: 'WAVG', vatRate: 13, invPrefix: 'SI', billCompliance: true, negativeStockWarn: true }, E.settings || {}); }

/* ---------- lookups ---------- */
const G = id => S.E.groups.find(g => g.id === id);
const L = id => S.E.ledgers.find(l => l.id === id);
const I = id => S.E.items.find(i => i.id === id);
const sysL = key => S.E.ledgers.find(l => l.sys === key);
const ledgerByName = n => S.E.ledgers.find(l => l.name.toLowerCase() === String(n || '').trim().toLowerCase());
const itemByName = n => S.E.items.find(i => i.name.toLowerCase() === String(n || '').trim().toLowerCase() || (i.code && i.code.toLowerCase() === String(n || '').trim().toLowerCase()));
function groupPath(gid) { const p = []; let g = G(gid); while (g) { p.unshift(g); g = g.parent ? G(g.parent) : null; } return p; }
function rootGroup(gid) { return groupPath(gid)[0]; }
function natureOf(l) { const g = G(l.g); return g ? (rootGroup(g.id).nature) : 'A'; }
function fsOf(l) { if (l.fs) return l.fs; let g = G(l.g); while (g) { if (g.fs) return g.fs; g = g.parent ? G(g.parent) : null; } return 'ADV'; }
function inGroup(l, gid) { return groupPath(l.g).some(g => g.id === gid); }
const isCashBank = l => l && (inGroup(l, 'g_cash') || inGroup(l, 'g_bank') || inGroup(l, 'g_od'));
const isParty = l => l && (inGroup(l, 'g_debt') || inGroup(l, 'g_cred'));
function ledgerOptions(filter) { return S.E.ledgers.filter(filter || (() => true)).sort(byName).map(l => `<option value="${h(l.name)}">`).join(''); }
function ledgerDatalist() { return `<datalist id="dl_led">${ledgerOptions()}</datalist><datalist id="dl_item">${S.E.items.slice().sort(byName).map(i => `<option value="${h(i.name)}">`).join('')}</datalist><datalist id="dl_party">${ledgerOptions(l => isParty(l) || isCashBank(l))}</datalist>`; }
function groupSelect(id, sel) { const opts = S.E.groups.slice().sort((a, b) => groupPath(a.id).map(x => x.name).join('/').localeCompare(groupPath(b.id).map(x => x.name).join('/'))).map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${h(groupPath(g.id).map(x => x.name).join(' › '))}</option>`).join(''); return `<select id="${id}">${opts}</select>`; }
function fsSelect(id, sel, allowBlank) { return `<select id="${id}">${allowBlank ? `<option value="">(use group's head)</option>` : ''}${Object.entries(FS_HEADS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.t}</option>`).join('')}</select>`; }

/* ---------- Entities screen ---------- */
function viewEntities() {
  const list = S.entities.filter(e => canEntity(e.id));
  return `<h2>Entities / Clients</h2><p class="muted">Each entity has its own books, stock, VAT and documents. Click to open.</p>
  <div class="btns">${can('entities') ? `<button class="btn pri" onclick="editEntity()">+ New entity</button><button class="btn" onclick="importEntityFile()">Import entity file</button>` : ''}</div>
  ${S.user.role === 'admin' ? `<div class="btns"><button class="btn" onclick="goFirm()">🏢 ${firmId() ? 'Open my firm books' : 'Set up my firm books'}</button></div>` : ''}
  ${table([{ k: 'name', t: 'Name', f: (v, r) => h(v) + (r.isFirm ? ' <span class="pill b">My firm</span>' : '') + (r.edition === 'INTL' ? ' <span class="pill y">International</span>' : '') }, { k: 'type', t: 'Type' }, { k: 'pan', t: 'PAN/VAT' }, { k: 'updated', t: 'Last change', f: v => h((v || '').slice(0, 10)) }, { k: 'id', t: '', f: (v) => `<button class="btn sm" onclick="event.stopPropagation();openEntity('${v}')">Open</button> ${can('entities') ? `<button class="btn sm" onclick="event.stopPropagation();exportEntityFile('${v}')">Export</button> <button class="btn sm red" onclick="event.stopPropagation();deleteEntity('${v}')">Delete</button>` : ''}` }],
    list.map(e => ({ ...e, _click: `openEntity('${e.id}')`, _cls: 'click' })), { empty: 'No entities yet. Create your first client.' })}`;
}
function editEntity() {
  if (!guardWrite()) return;
  window._newBkDir = null; const lic = licenseState(); if (lic.maxEntities && S.entities.filter(e => !e.isFirm).length >= lic.maxEntities) return toast(`Your licence allows ${lic.maxEntities} entities`, 1);
  modal('New entity', `<label>Legal name</label><input id="ne_name"><div class="row"><div><label>Type</label><select id="ne_type">${ENTITY_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div><div><label>PAN / VAT number</label><input id="ne_pan" maxlength="9"></div></div>
  <label style="display:flex;gap:6px;color:var(--ink)"><input type="checkbox" id="ne_vat" checked> Registered for VAT</label>
  <label>Address</label><input id="ne_addr" placeholder="Birtamod-4, Jhapa, Koshi Province">
  ${window.showDirectoryPicker ? `<label>Daily automatic backup folder (optional – can be changed later in Settings)</label><div class="row"><div class="fit"><button class="btn" type="button" onclick="chooseBackupFolder('__new')">Choose folder</button></div><div><span id="ne_bkname" class="muted">none selected</span></div></div>` : ''}
  <label>Copy chart of accounts from (optional)</label><select id="ne_copy"><option value="">Standard Nepal chart of accounts</option>${S.entities.map(e => `<option value="${e.id}">${h(e.name)}</option>`).join('')}</select>
  <div class="btns"><button class="btn pri" onclick="createEntity()">Create</button></div>`);
}
async function createEntity() {
  const name = $('#ne_name').value.trim(); if (!name) return toast('Enter name', 1);
  const E = newEntityObject({ name, type: $('#ne_type').value, legal: { pan: $('#ne_pan').value.trim(), vatReg: $('#ne_vat').checked, address: $('#ne_addr').value.trim() } });
  const copy = $('#ne_copy').value; if (copy) { const src = await DB.get('entities', copy); if (src) { E.groups = clone(src.groups); E.ledgers = src.ledgers.filter(l => !isPartyIn(src, l)).map(l => ({ ...l, ob: 0 })); E.items = src.items.map(i => ({ ...i, oq: 0, orate: 0 })); E.godowns = clone(src.godowns); } }
  S.entities.push({ id: E.id, name: E.name, type: E.type, pan: E.legal.pan, updated: todayAD() }); await saveEntities();
  if (S.user.entities !== 'all' && S.user.role !== 'admin') { S.user.entities.push(E.id); await saveUsers(); }
  await DB.put('entities', E.id, E); if (window._newBkDir) { await DB.put('kv', 'bkdir:' + E.id, window._newBkDir); window._newBkDir = null; if (!S.settings.backupPass) await askBackupPass(); runDailyBackups(true); }
  closeModal(); toast('Entity created'); openEntity(E.id);
}
function isPartyIn(E, l) { const path = []; let g = E.groups.find(x => x.id === l.g); while (g) { path.push(g.id); g = E.groups.find(x => x.id === g.parent); } return path.includes('g_debt') || path.includes('g_cred'); }
async function deleteEntity(id) {
  const e = S.entities.find(x => x.id === id); if (!e) return;
  const t = prompt(`This permanently deletes "${e.name}" with all its entries and documents.\nExport a backup first if unsure.\n\nType DELETE to confirm:`); if (t !== 'DELETE') return;
  await DB.del('entities', id); const docs = await DB.all('docs'); for (const d of docs) if (d.entityId === id) await DB.del('docs', d.id);
  S.entities = S.entities.filter(x => x.id !== id); await saveEntities(); if (S.E && S.E.id === id) S.E = null; toast('Entity deleted'); App.go('entities');
}
async function exportEntityFile(id) { const E = await DB.get('entities', id); download(`${E.name.replace(/[^\w]+/g, '_')}_LekhaPal_entity.json`, JSON.stringify({ app: 'LekhaPal', kind: 'entity', E }), 'application/json'); }
async function importEntityFile() {
  const f = await pickFile('.json'); if (!f) return; try {
    const o = JSON.parse(await f.text()); if (o.kind !== 'entity') throw 0; const E = o.E; migrateEntity(E);
    if (S.entities.find(x => x.id === E.id) && !confirmBox('This entity already exists here. Replace it with the file version?')) return;
    S.entities = S.entities.filter(x => x.id !== E.id); S.entities.push({ id: E.id, name: E.name, type: E.type, pan: E.legal.pan, updated: E.updated }); await saveEntities(); await DB.put('entities', E.id, E); toast('Imported ' + E.name); App.go('entities');
  } catch (e) { toast('Not a valid LekhaPal entity file', 1); }
}

/* ---------- Legal details & compliance ---------- */
function viewLegal() {
  const E = S.E, Lg = E.legal;
  const f = (k, t, ph = '') => `<div><label>${t}</label><input id="lg_${k}" value="${h(Lg[k])}" placeholder="${ph}"></div>`;
  const list = (k, cols) => `<div class="tw"><table class="t ent" id="lt_${k}"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${(Lg[k] || []).map(r => `<tr>${cols.map(c => `<td><input data-k="${c[0]}" value="${h(r[c[0]])}"></td>`).join('')}<td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" onclick="addRowTo('lt_${k}',${h(JSON.stringify(cols.map(c => c[0])))})">+ Add row</button>`;
  return `<h2>Legal details – ${h(E.name)}</h2>
  <div class="card"><h3>Registration</h3><div class="grid3">
  <div><label>Legal name</label><input id="lg__name" value="${h(E.name)}"></div>${isINTL() ? '' : f('nameNep', 'Name in Nepali')}<div><label>Entity type</label><select id="lg__type">${(isINTL() ? ENTITY_TYPES_INTL : ENTITY_TYPES).map(t => `<option ${t === E.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  ${f('pan', 'PAN / VAT No.')}<div><label>VAT registered?</label><select id="lg_vatReg"><option value="1" ${Lg.vatReg ? 'selected' : ''}>Yes</option><option value="" ${!Lg.vatReg ? 'selected' : ''}>No (PAN only)</option></select></div>${f('vatRegDate', 'VAT registration date (BS)')}
  ${f('regNo', 'Registration No.')}${f('regDate', 'Registration date (BS)')}${f('regOffice', 'Registered with', isINTL() ? 'Registrar / free zone / licensing authority' : 'OCR / Ward / Cottage Industry / SWC / CDO')}
  ${isINTL() ? f('ird', 'Tax authority / office') + f('ssf', 'Social security / pension reg. no.') + f('exim', 'Import-export / customs code') : f('ird', 'Tax office (IRO/TSO)', 'IRO Biratnagar / TSO Birtamod') + f('ssf', 'SSF registration no.') + f('exim', 'EXIM code')}
  ${f('excise', 'Excise registration no.')}${f('objective', 'Main business / objectives')}${f('industry', 'Nature of business', 'Trading / Manufacturing / Service')}
  </div></div>
  <div class="card"><h3>Address & contact</h3><div class="grid3">${f('address', 'Address')}${f('district', isINTL() ? 'City' : 'District')}${f('province', isINTL() ? 'State / emirate / region' : 'Province')}${f('phone', 'Phone')}${f('email', 'Email')}${f('website', 'Website')}</div></div>
  <div class="card"><h3>Capital</h3><div class="grid3">${f('authCap', 'Authorised capital (Rs)')}${f('issuedCap', 'Issued capital (Rs)')}${f('paidCap', 'Paid-up capital (Rs)')}${f('shares', 'Number of shares')}${f('faceValue', 'Face value per share')}${f('agmDate', 'Last AGM date (BS)')}</div></div>
  <div class="card"><h3>Directors / partners / proprietor / executive committee</h3>${list('directors', [['name', 'Name'], ['role', 'Designation'], ['phone', 'Phone'], ['email', 'Email'], ['from', 'Appointed (BS)']])}</div>
  <div class="card"><h3>Shareholders / partners' capital</h3>${list('shareholders', [['name', 'Name'], ['shares', 'Shares / capital'], ['pct', '%']])}</div>
  <div class="card"><h3>Licences & renewals</h3><p class="small muted">Expiry dates appear on the dashboard as reminders.</p>${list('licenses', [['name', 'Licence / certificate'], ['no', 'Number'], ['office', 'Issuing office'], ['expiry', isINTL() ? 'Expiry (YYYY-MM-DD)' : 'Expiry (BS YYYY-MM-DD)']])}</div>
  <div class="card"><h3>Banks, auditor & other</h3><div class="grid3">${f('auditor', 'Auditor')}${f('auditorReg', 'Auditor COP / membership no.')}${f('banks', 'Bankers')}${f('cbmsNote', 'Other notes')}</div></div>
  <div class="btns"><button class="btn pri" onclick="saveLegal()">Save legal details</button><button class="btn" onclick="printLegal()">Print profile</button></div>`;
}
function addRowTo(tid, keys) { const tb = $('#' + tid + ' tbody'); const tr = document.createElement('tr'); tr.innerHTML = keys.map(k => `<td><input data-k="${k}"></td>`).join('') + `<td><button class="btn sm red" onclick="this.closest('tr').remove()">×</button></td>`; tb.appendChild(tr); }
function readRows(tid) { return $$('#' + tid + ' tbody tr').map(tr => { const o = {}; $$('input,select', tr).forEach(i => { if (i.dataset.k) o[i.dataset.k] = i.value.trim(); }); return o; }).filter(o => Object.values(o).some(v => v)); }
async function saveLegal() {
  if (!guardWrite()) return; const E = S.E;
  $$('[id^=lg_]').forEach(el => { const k = el.id.slice(3); if (k === '_name') E.name = el.value.trim() || E.name; else if (k === '_type') E.type = el.value; else if (k === 'vatReg') E.legal.vatReg = !!el.value; else E.legal[k] = el.value.trim(); });
  E.legal.directors = readRows('lt_directors'); E.legal.shareholders = readRows('lt_shareholders'); E.legal.licenses = readRows('lt_licenses');
  audit('Legal details updated'); await saveE(); toast('Saved'); App.render();
}
function printLegal() {
  const E = S.E, Lg = E.legal; const kv = Object.entries({ 'Legal name': E.name, 'Type': E.type, 'PAN/VAT': Lg.pan, 'VAT registered': Lg.vatReg ? 'Yes' : 'No', 'Reg. No.': Lg.regNo, 'Reg. date': Lg.regDate, 'Registered with': Lg.regOffice, 'Tax office': Lg.ird, 'Address': [Lg.address, Lg.district, Lg.province].filter(Boolean).join(', '), 'Phone / Email': [Lg.phone, Lg.email].filter(Boolean).join(' / '), 'Authorised / Issued / Paid capital': [Lg.authCap, Lg.issuedCap, Lg.paidCap].join(' / '), 'Auditor': Lg.auditor, 'SSF': Lg.ssf, 'EXIM': Lg.exim });
  modal('Entity profile', `<div class="invoice"><h2>${h(E.name)}</h2><div class="kv">${kv.map(([k, v]) => `<div>${k}</div><div>${h(v || '-')}</div>`).join('')}</div>
  <h3>Directors / partners</h3>${table([{ k: 'name', t: 'Name' }, { k: 'role', t: 'Designation' }, { k: 'phone', t: 'Phone' }], Lg.directors || [])}
  <h3>Shareholders</h3>${table([{ k: 'name', t: 'Name' }, { k: 'shares', t: 'Shares' }, { k: 'pct', t: '%' }], Lg.shareholders || [])}
  <h3>Licences</h3>${table([{ k: 'name', t: 'Licence' }, { k: 'no', t: 'No.' }, { k: 'expiry', t: 'Expiry' }], Lg.licenses || [])}</div>
  <div class="btns"><button class="btn pri" onclick="printModal()">Print</button></div>`, { wide: true });
}
/* Statutory due dates (Nepal). Dates are BS. Verify with IRD/OCR notices – rules change by Finance Act. */
function complianceDue(E) {
  const out = []; const t = bsParts(todayAD()); const fy = fyOf(todayAD()); const y = fyStartYear(fy);
  const mk = (yy, mm, dd) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const ny = t.m === 12 ? t.y + 1 : t.y, nm = t.m === 12 ? 1 : t.m + 1; // next month
  const cur = mk(t.y, t.m, 25), nxt = mk(ny, nm, 25); const prevLabel = BS_MONTHS[(t.m + 10) % 12];
  if (E.legal.vatReg) out.push({ d: t.d <= 25 ? cur : nxt, w: `VAT return & payment (for ${t.d <= 25 ? prevLabel : BS_MONTHS[t.m - 1]})` });
  out.push({ d: t.d <= 25 ? cur : nxt, w: 'TDS deposit & e-TDS return' });
  out.push({ d: t.d <= 25 ? cur : nxt, w: 'SSF contribution deposit (if registered)' });
  out.push({ d: bsMonthEnd(y, 9), w: 'Advance tax 1st instalment (40%) – end of Poush' }, { d: bsMonthEnd(y, 12), w: 'Advance tax 2nd instalment (70%) – end of Chaitra' }, { d: bsMonthEnd(y + 1, 3), w: 'Advance tax 3rd instalment (100%) – end of Ashadh' });
  out.push({ d: bsMonthEnd(y, 6), w: `Income tax return for FY ${(y - 1)}/${String(y % 100).padStart(2, '0')} – end of Ashwin (extendable to Poush)` });
  if (/Company/.test(E.type)) out.push({ d: bsMonthEnd(y, 9), w: 'Hold AGM within 6 months of FY end & file annual return with OCR (verify current deadline)' });
  if (/NGO|NPO|Trust/.test(E.type)) out.push({ d: bsMonthEnd(y, 6), w: 'Audit report & renewal with CDO / SWC (verify local deadline)' });
  (E.legal.licenses || []).forEach(l => { if (l.expiry) out.push({ d: l.expiry, w: `Renew: ${l.name} ${l.no ? '(' + l.no + ')' : ''}` }); });
  const today = toBS(todayAD());
  return out.map(o => ({ ...o, ad: toAD(o.d), past: o.d < today })).filter(o => o.ad).sort((a, b) => a.d.localeCompare(b.d));
}
