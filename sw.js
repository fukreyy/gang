const CACHE = 'fukrey-v1';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(data.title || 'Fukrey', {
    body: data.body || 'New content available!',
    icon: '/icon-192x192.png',
    badge: '/favicon-32x32.png',
    image: data.thumbnail || undefined,
    data: { media_id: data.media_id },
    vibrate: [200, 100, 200],
    actions: [{ action: 'open', title: '▶ Watch Now' }]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.media_id
    ? `/?media=${e.notification.data.media_id}`
    : '/';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => {
    const w = ws.find(w => w.url.includes(self.location.origin));
    return w ? w.focus() : clients.openWindow(url);
  }));
});
