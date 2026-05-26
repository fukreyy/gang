self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch (_) { data = { title: 'Fukrey', body: e.data ? e.data.text() : 'New update!' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Fukrey 🎬', {
      body: data.body || '',
      icon: data.icon || '/gang/icon.png',
      badge: '/gang/icon.png',
      data: data.data || {},
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://fukreyy.github.io/gang/'));
});
