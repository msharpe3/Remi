// Remi offline support.
// App files: newest from the network when online, cached copy when offline,
// so the page and its styles never come from two different versions.
// Recipe library index: network first, cached copy when offline.
// Recipe files, fonts and photos: cached after the first view.

const VERSION = 'remi-v4';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/normalize.js',
  'js/mealdb.js',
  'js/plan.js',
  'js/prices.js',
  'js/quantity.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/mascot.svg',
  'icons/icon-180.png',
  'icons/icon-512.png',
];
const MAX_IMAGES = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('remi-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.open(VERSION)).match('index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    if (limit) {
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
    }
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') return event.respondWith(networkFirst(req, VERSION));

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/data/index.json') || url.pathname.endsWith('/data/plan.json')) return event.respondWith(networkFirst(req, 'remi-data'));
    if (url.pathname.includes('/data/r/')) return event.respondWith(cacheFirst(req, 'remi-data'));
    return event.respondWith(networkFirst(req, VERSION));
  }

  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return event.respondWith(cacheFirst(req, 'remi-fonts'));
  if (url.hostname.endsWith('themealdb.com') && url.pathname.includes('/api/')) return event.respondWith(networkFirst(req, 'remi-mealdb'));
  if (req.destination === 'image') return event.respondWith(cacheFirst(req, 'remi-images', MAX_IMAGES).catch(() => fetch(req)));
});
