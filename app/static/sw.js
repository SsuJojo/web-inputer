const CACHE = 'remote-input-v56';
const ASSETS = ['/', '/static/styles.css?v=20260703-01', '/static/vendor/panzoom.min.js?v=20260703-01', '/static/app.js?v=20260703-01', '/manifest.webmanifest?v=20260610-01'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

