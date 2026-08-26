// Service worker: makes FedoraBible installable and usable fully offline
// after the first successful visit. Static assets use cache-first with a
// background refresh (stale-while-revalidate) so a later online visit still
// picks up updates. The ~50MB seed database is a separate cache-first entry
// with no revalidation — it's fetched once (by localDb.worker.js, to seed
// OPFS) and has no reason to change on its own afterward.
//
// Every path below is relative to this file's own directory rather than
// site-root-absolute, since a static deploy (e.g. GitHub Pages) can serve
// this from a subpath like /FedoraBible/, not just /.

const CACHE = 'fedorabible-v2';
const DB_CACHE = 'fedorabible-db-v1';

// The directory this script lives in — e.g. '/' locally, '/FedoraBible/' on
// a GitHub Pages project site — used to compare against fetch event
// pathnames below, which always include that prefix.
const BASE_PATH = new URL('.', self.location).pathname;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/fonts.css',
  './js/api.js',
  './js/localDb.js',
  './js/localDb.worker.js',
  './js/state.js',
  './js/refparse.js',
  './js/reader.js',
  './js/tabs.js',
  './js/notes.js',
  './js/drawer.js',
  './js/palette.js',
  './js/translationInfo.js',
  './js/shortcuts.js',
  './js/app.js',
  './vendor/sqlite-wasm/index.mjs',
  './vendor/sqlite-wasm/sqlite3.wasm',
  './vendor/sqlite-wasm/sqlite3-opfs-async-proxy.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== DB_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept the REST API: when a real Express backend is present
  // (desktop app), its responses are live user data (tabs, highlights,
  // notes) and must never be served stale from cache.
  if (url.pathname.startsWith(BASE_PATH + 'api/')) return;

  if (url.pathname === BASE_PATH + 'data/bible.db') {
    event.respondWith(
      caches.open(DB_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
