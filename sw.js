// Service Worker: App funktioniert offline.
// Strategie "stale-while-revalidate": sofort aus dem Cache, im Hintergrund aktualisieren.
// Neue Versionen sind damit spätestens beim übernächsten Start aktiv – auch ohne Versionssprung.
const CACHE = 'fischkasse-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ai.js',
  './js/backup.js',
  './js/components.js',
  './js/icons.js',
  './js/model.js',
  './js/nav.js',
  './js/products.js',
  './js/sheets.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './js/views/artikel.js',
  './js/views/home.js',
  './js/views/kasse.js',
  './js/views/mehr.js',
  './js/views/messen.js',
  './js/views/stats.js',
  './js/views/verlauf.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';
  const key = isNav ? './index.html' : req;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
