self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));

self.addEventListener('push', e => {
  let title = 'Fukrey 🎬';
  let options = { body: 'New update!', icon: '/gang/icon.png', badge: '/gang/icon.png', vibrate: [200, 100, 200] };
  try {
    const data = e.data.json();
    title = data.title || title;
    options.body = data.body || options.body;
    options.icon = data.icon || options.icon;
    options.data = data.data || {};
  } catch (_) {
    try { options.body = e.data.text(); } catch (_) {}
  }
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://fukreyy.github.io/gang/'));
});
