const CACHE = 'training-manager-v13';

const PRECACHE = [
  '/static/css/style.css',
  '/static/js/exercises.js',
  '/static/js/calendar.js',
  '/static/js/training.js',
  '/static/js/my_trainings.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/offline',
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

// ── Benachrichtigungen ──────────────────────────────────────────────────────
// Klick auf eine Benachrichtigung: bestehendes App-Fenster fokussieren oder öffnen
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Push-Event (für späteren Server-Push vorbereitet – aktuell ungenutzt)
self.addEventListener('push', event => {
  let data = { title: 'Trainflow', body: '' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/static/icons/icon-192.png',
      badge: '/static/icons/icon-192.png',
      data: { url: data.url || '/dashboard' }
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (event.request.url.includes('/static/')) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.destination === 'document') {
            return caches.match('/offline');
          }
          return Response.error();
        })
      )
  );
});
