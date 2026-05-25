const CACHE = 'training-manager-v1';
const OFFLINE_URL = '/offline';

const PRECACHE = [
  '/static/css/style.css',
  '/static/js/exercises.js',
  '/static/js/calendar.js',
  '/static/js/training.js',
  '/static/js/my_trainings.js',
  '/static/icons/icon-192.svg',
  '/static/icons/icon-512.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Nur GET-Requests cachen, API-Calls immer live
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Statische Assets im Cache aktualisieren
        if (event.request.url.includes('/static/')) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || Response.error())
      )
  );
});
