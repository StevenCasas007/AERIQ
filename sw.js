/* AERIQ · service worker: cache del "app shell" para uso sin conexión.
   Sube el número de versión al cambiar cualquier archivo. */
const CACHE = 'aeriq-v1.6.4-report-scroll-fix';
const SHELL = [
  './', 'index.html', 'styles.css', 'calc.js', 'app.js', 'network.js', 'editor.js', 'resistance.js', 'manifest.webmanifest',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // navegación: red primero (para recibir actualizaciones), caché como respaldo
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('index.html', r.clone())); return r; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  // recursos: caché primero, y se refresca en segundo plano
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    })
  );
});
