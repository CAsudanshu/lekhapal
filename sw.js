/* LekhaPal service worker – makes the app work fully offline after first open. */
const CACHE = 'lekhapal-v1.3.0';
const FILES = [
  "./",
  "GUIDE.html",
  "css/app.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/logo.svg",
  "index.html",
  "js/app.js",
  "js/auth.js",
  "js/core.js",
  "js/engine.js",
  "js/entity.js",
  "js/firm.js",
  "js/intl.js",
  "js/masters2.js",
  "js/migrate.js",
  "js/reports.js",
  "js/tax.js",
  "js/taxcomp.js",
  "js/tools.js",
  "js/vouchers.js",
  "lib/lang/eng.traineddata.gz",
  "lib/lang/nep.traineddata.gz",
  "lib/nepali-date.js",
  "lib/pdf.min.js",
  "lib/pdf.worker.min.js",
  "lib/tesseract-core/tesseract-core-lstm.wasm.js",
  "lib/tesseract-core/tesseract-core-simd-lstm.wasm.js",
  "lib/tesseract.min.js",
  "lib/worker.min.js",
  "lib/xlsx.full.min.js",
  "manifest.json",
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('updates.json')) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  const put = res => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return res; };
  // Large libraries: cache first. App code (html/js/css): always try the latest file first, use the cache only when offline.
  if (/\/(lib|icons)\//.test(u.pathname)) { e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(put))); return; }
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(put).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
