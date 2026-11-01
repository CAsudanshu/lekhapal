/* LekhaPal – core utilities. Developed by CA Sudanshu Mallick.
   Plain JavaScript, no build step. Each file adds functions to the global scope. */
'use strict';
const APP = { name: 'LekhaPal', version: '1.3.0', developer: 'CA Sudanshu Mallick', devEmail: 'ca.sudanshu@gmail.com' };

/* ---------- Database (IndexedDB, works offline) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('smlekha', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('entities')) d.createObjectStore('entities');
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs');
      };
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = DB.db.transaction(store, mode); const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  },
  get(store, key) { return new Promise((res, rej) => { const r = DB.db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  put(store, key, val) { return DB.tx(store, 'readwrite', s => { s.put(val, key); }); },
  del(store, key) { return DB.tx(store, 'readwrite', s => { s.delete(key); }); },
  all(store) { return new Promise((res, rej) => { const r = DB.db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  keys(store) { return new Promise((res, rej) => { const r = DB.db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
};

/* ---------- Global state ---------- */
const S = { user: null, users: [], entities: [], E: null, settings: {}, license: null, route: 'home', params: {} };

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { if (v === null || v === undefined || v === '') return 0; const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const r2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
/* ---------- Edition: Nepal (BS dates, NPR, VAT/PAN/TDS, NFRS) or International (AD dates, any currency, IFRS) ---------- */
function CFG(E) { E = E || S._cfgE || S.E; const intl = !!(E && E.edition === 'INTL'); const I = (E && E.intl) || {};
  return intl ? { intl: true, cur: I.cur || 'USD', sym: I.sym || I.cur || '$', locale: I.locale || 'en-US', tax: I.taxName || 'VAT', taxId: I.taxIdLabel || 'Tax ID', fyStart: num(I.fyStart) || 1, major: I.major || 'Dollars', minor: I.minor || 'Cents', country: I.country || '' }
    : { intl: false, cur: 'NPR', sym: 'Rs', locale: 'en-IN', tax: 'VAT', taxId: 'PAN', fyStart: 4, major: 'Rupees', minor: 'Paisa', country: 'Nepal' }; }
const isINTL = E => CFG(E).intl;
const fmt = (v, blankZero) => { v = r2(v); if (blankZero && Math.abs(v) < 0.005) return ''; return v.toLocaleString(CFG().locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const fmtDC = v => Math.abs(v) < 0.005 ? '0.00' : fmt(Math.abs(v)) + (v > 0 ? ' Dr' : ' Cr');
const fmtQ = v => (Math.round(num(v) * 1000) / 1000).toLocaleString(CFG().locale, { maximumFractionDigits: 3 });
const todayAD = () => { const d = new Date(); return isoOf(d); };
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const sum = (arr, f) => arr.reduce((a, x) => a + num(f ? f(x) : x), 0);
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Nepali (BS) dates ---------- */
const BS_MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const ND = window.NepaliDate ? (window.NepaliDate.default || window.NepaliDate) : null;
function toBS(iso) {
  if (iso && isINTL()) return iso; return bsRaw(iso);
}
function bsRaw(iso) {
  if (!iso || !ND) return '';
  try { const [y, m, d] = iso.split('-').map(Number); return new ND(new Date(y, m - 1, d)).format('YYYY-MM-DD'); } catch (e) { return ''; }
}
function toAD(bs) {
  if (bs && isINTL()) return parseAnyDate(bs); return adRaw(bs);
}
function adRaw(bs) {
  if (!bs || !ND) return '';
  try {
    const p = String(bs).trim().replace(/[./]/g, '-').split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return '';
    const n = new ND(p[0], p[1] - 1, p[2]); return isoOf(n.toJsDate());
  } catch (e) { return ''; }
}
function bsParts(iso) { const b = bsRaw(iso).split('-').map(Number); return { y: b[0], m: b[1], d: b[2] }; }
function adParts(iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; }
function fyOf(iso, E) { const c = CFG(E); if (c.intl) { const { y, m } = adParts(iso); const st = c.fyStart; const s0 = m >= st ? y : y - 1; return st === 1 ? String(s0) : s0 + '/' + String((s0 + 1) % 100).padStart(2, '0'); } const { y, m } = bsParts(iso); const s1 = m >= 4 ? y : y - 1; return s1 + '/' + String((s1 + 1) % 100).padStart(2, '0'); }
function fyStartYear(fy) { return parseInt(String(fy).split('/')[0], 10); }
function fyLabelFrom(y, E) { const c = CFG(E); return c.intl && c.fyStart === 1 ? String(y) : y + '/' + String((y + 1) % 100).padStart(2, '0'); }
function fyRange(fy, E) { const c = CFG(E); const y = fyStartYear(fy); if (c.intl) { const from = `${y}-${String(c.fyStart).padStart(2, '0')}-01`; const d = new Date(from + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); return { from, to: addDays(isoOf(d), -1) }; } return { from: adRaw(y + '-04-01'), to: addDays(adRaw((y + 1) + '-04-01'), -1) }; }
function fyList(E) {
  const set = new Set([fyOf(todayAD())]);
  if (E) { set.add(E.fy); (E.vouchers || []).forEach(v => set.add(fyOf(v.date))); }
  return Array.from(set).sort().reverse();
}
function monthKeyBS(iso) { if (isINTL()) return iso.slice(0, 7); const { y, m } = bsParts(iso); return y + '-' + String(m).padStart(2, '0'); }
const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(key) { const [y, m] = key.split('-').map(Number); return (isINTL() ? AD_MONTHS : BS_MONTHS)[m - 1] + ' ' + y; }
function fyMonths(fy) { const y = fyStartYear(fy); if (isINTL()) { const st = CFG().fyStart; const o = []; for (let i = 0; i < 12; i++) { const m = ((st - 1 + i) % 12) + 1; o.push((m >= st ? y : y + 1) + '-' + String(m).padStart(2, '0')); } return o; } const out = []; for (let i = 0; i < 12; i++) { const m = ((3 + i) % 12) + 1; const yy = m >= 4 ? y : y + 1; out.push(yy + '-' + String(m).padStart(2, '0')); } return out; }
function monthRange(key) { const [y, m] = key.split('-').map(Number); if (isINTL()) { const from = `${y}-${String(m).padStart(2, '0')}-01`; const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return { from, to: addDays(`${ny}-${String(nm).padStart(2, '0')}-01`, -1) }; } const from = toAD(y + '-' + m + '-01'); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return { from, to: addDays(toAD(ny + '-' + nm + '-01'), -1) }; }
const dBoth = iso => iso ? (isINTL() ? iso : `${toBS(iso)} <span class="muted small">(${iso})</span>`) : '';
const dTxt = iso => iso ? (isINTL() ? iso : `${toBS(iso)} BS (${iso})`) : '';
const dBS = iso => iso ? toBS(iso) : '';

/* BS date input: user types BS (YYYY-MM-DD), AD shown below. Returns AD iso via readDate(id). */
function dateInput(id, iso, label = 'Date (BS)') {
  if (iso === undefined || iso === null) iso = todayAD();
  if (isINTL()) return `<div class="bsd"><label>${label.replace(/ ?\(BS[^)]*\)/, '')}</label><input id="${id}" type="date" value="${iso || ''}"></div>`;
  return `<div class="bsd"><label>${label}</label><input id="${id}" value="${iso ? toBS(iso) : ''}" placeholder="2083-07-15" oninput="dateHint(this)" data-ad="${iso}"><small id="${id}_ad">${iso ? 'AD: ' + iso : 'Not set'}</small></div>`;
}
function dateHint(el) { if (isINTL()) return; if (!el.value.trim()) { el.dataset.ad = ''; const s0 = document.getElementById(el.id + '_ad'); if (s0) s0.textContent = 'Not set'; return; } const ad = toAD(el.value); el.dataset.ad = ad || ''; const s = document.getElementById(el.id + '_ad'); if (s) s.textContent = ad ? 'AD: ' + ad : 'Invalid BS date'; }
function readDate(id) { const el = document.getElementById(id); if (!el) return ''; return toAD(el.value) || ''; }

/* ---------- Amount in words (Nepali/Indian system) ---------- */
function inWords(amount) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  const w = n => {
    if (n === 0) return 'Zero';
    let s = ''; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1000); n %= 1000;
    if (cr) s += w(cr) + ' Crore '; if (lk) s += two(lk) + ' Lakh '; if (th) s += two(th) + ' Thousand '; if (n) s += three(n);
    return s.trim();
  };
  amount = r2(Math.abs(amount)); const rs = Math.floor(amount); const ps = Math.round((amount - rs) * 100); const c = CFG();
  if (c.intl) { const wi = n => { if (n === 0) return 'Zero'; let s = ''; [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']].forEach(([v, t]) => { if (n >= v) { s += three(Math.floor(n / v)) + ' ' + t + ' '; n %= v; } }); if (n) s += three(n); return s.trim(); }; return c.major + ' ' + wi(rs) + (ps ? ' and ' + two(ps) + ' ' + c.minor : '') + ' Only'; }
  return 'Rupees ' + w(rs) + (ps ? ' and ' + two(ps) + ' Paisa' : '') + ' Only';
}

/* ---------- UI helpers ---------- */
function toast(msg, err) { const d = document.createElement('div'); if (err) d.className = 'err'; d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 6000 : 3000); }
function modal(title, body, opts = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="mb" onclick="if(event.target===this && !${!!opts.sticky})closeModal()"><div class="md ${opts.wide ? 'wide' : ''}"><div class="mh no-print"><h3>${title}</h3><button class="x" onclick="closeModal()">×</button></div><div id="mbody">${body}</div></div></div>`;
  localizeDOM(root); const f = root.querySelector('input,select,textarea'); if (f && !opts.nofocus) setTimeout(() => f.focus(), 30);
}
function closeModal() { $('#modal-root').innerHTML = ''; document.body.classList.remove('printing-modal'); }
function confirmBox(msg) { return window.confirm(msg); }
function printModal() { document.body.classList.add('printing-modal'); window.print(); setTimeout(() => document.body.classList.remove('printing-modal'), 500); }
function table(cols, rows, opts = {}) {
  // cols: [{k,t,n(numeric),f(formatter)}]
  let html = `<div class="tw" ${opts.maxh ? `style="max-height:${opts.maxh}"` : ''}><table class="t ${opts.cls || ''}"><thead><tr>${cols.map(c => `<th class="${c.n ? 'n' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>`;
  if (!rows.length) html += `<tr><td colspan="${cols.length}" class="muted center">${opts.empty || 'No records'}</td></tr>`;
  rows.forEach(r => {
    html += `<tr class="${r._cls || ''}" ${r._click ? `onclick="${r._click}"` : ''}>${cols.map(c => { const v = c.f ? c.f(r[c.k], r) : r[c.k]; return `<td class="${c.n ? 'n' : ''} ${r._ind && c.k === cols[0].k ? 'ind' + r._ind : ''}">${v === undefined || v === null ? '' : (c.raw || c.f ? v : h(v))}</td>`; }).join('')}</tr>`;
  });
  return html + '</tbody></table></div>';
}
function download(name, content, type = 'text/plain') { const blob = content instanceof Blob ? content : new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
/* Export any rendered table (by element id) to Excel */
function exportTable(elId, name) {
  const el = document.getElementById(elId); if (!el) return; const tb = el.querySelector('table'); if (!tb || !window.XLSX) return toast('Nothing to export', 1);
  const wb = XLSX.utils.table_to_book(tb, { raw: false }); XLSX.writeFile(wb, (name || 'report') + '.xlsx');
}
function exportRows(rows, name, sheet = 'Sheet1') { const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30)); XLSX.writeFile(wb, name + '.xlsx'); }
function readSheetFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => { try { const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false }); const ws = wb.Sheets[wb.SheetNames[0]]; res(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })); } catch (err) { rej(err); } }; r.onerror = rej; r.readAsArrayBuffer(file); });
}
function pickFile(accept, multiple) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.multiple = !!multiple; i.onchange = () => res(multiple ? Array.from(i.files) : i.files[0]); i.click(); }); }
/* normalise header keys of an imported row: "Invoice No." -> "invoiceno" */
const nk = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function rowGet(row, ...names) { const m = {}; Object.keys(row).forEach(k => m[nk(k)] = row[k]); for (const n of names) { const v = m[nk(n)]; if (v !== undefined && v !== '') return v; } return ''; }
function parseAnyDate(v) {
  // accepts BS (year>2050) or AD, formats YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, Excel serial
  if (!v && v !== 0) return '';
  v = String(v).trim();
  if (/^\d{5}$/.test(v)) { const d = new Date(Math.round((num(v) - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
  let m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else { m = v.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/); if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else return ''; }
  if (y > 2050 && !isINTL()) return toAD(`${y}-${mo}-${d}`);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* ---------- Crypto ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
async function hashPass(pass, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
async function aesKey(pass, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptText(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pass, salt), enc.encode(text));
  return JSON.stringify({ app: 'LekhaPal', v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
async function decryptText(json, pass) {
  const o = JSON.parse(json);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await aesKey(pass, unb64(o.salt)), unb64(o.data));
  return dec.decode(pt);
}
function randomCode(n = 16) { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return Array.from(r, x => c[x % c.length]).join('').replace(/(.{4})(?=.)/g, '$1-'); }
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

/* International edition: rewrite Nepal-specific words in what is on screen (text only, never code or data attributes) */
function locRules() {
  const c = CFG(); if (!c.intl) return null; const T = c.tax;
  return [[/NFRS for SMEs/g, 'IFRS for SMEs'], [/\bNFRS\b/g, 'IFRS'], [/VAT, TDS & IRD/g, T + ', withholding tax & returns'], [/Depreciation \(IRD\)/g, 'Depreciation'], [/IRD e-billing \(CBMS\)/g, 'E-invoicing'],
    [/Nepal updates/g, 'Regulatory updates'], [/Latest changes in Nepal/g, 'Regulatory & tax updates'], [/ ?\((BS|AD)\)/g, ''], [/ BS\b/g, ''], [/\bIRD\b/g, 'tax authority'], [/\bTDS\b/g, 'WHT'],
    [/PAN ?\/ ?VAT( No\.?| number)?/g, c.taxId], [/\bPAN\b/g, c.taxId], ...(T !== 'VAT' ? [[/\bVAT\b/g, T]] : []), [/\(Rs\)/g, '(' + c.cur + ')'], [/\bRs\.? (?=[\d,])/g, c.sym + ' '], [/\bNPR\b/g, c.cur]];
}
function localizeDOM(root) {
  const R = locRules(); if (!R || !root) return; const fix = t => R.reduce((a, [re, to]) => a.replace(re, to), t);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => { if (n.parentNode && /SCRIPT|STYLE|TEXTAREA/.test(n.parentNode.nodeName)) return; const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
  root.querySelectorAll('[placeholder],option').forEach(el => { if (el.placeholder) el.placeholder = fix(el.placeholder); });
}
