const CACHE_NAME = 'fukrey-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
self.addEventListener('push', (e) => {
  let data = { title: 'Fukrey', body: 'New content!' };
  try { if (e.data) data = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/gang/icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/gang/'));
});
