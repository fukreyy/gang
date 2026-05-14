self.addEventListener('install', (e) => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))),
      clients.claim()
    ])
  );
});

const AD_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'hilltopads.com',
  'adsterra.com', 'clickadu.com', 'exoclick.com', 'juicyads.com',
  'trafficjunky.net', 'taboola.com', 'outbrain.com', 'mgid.com',
  'adskeeper.com', 'adcash.com', 'monetag.com'
];

self.addEventListener('fetch', (event) => {
  const url = event.request.url.toLowerCase();
  if (AD_DOMAINS.some(d => url.includes(d))) {
    event.respondWith(new Response('', { status: 204 }));
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } 
  catch (e) { data = { title: 'Fukrey', body: event.data.text() }; }
  
  event.waitUntil(self.registration.showNotification(
    data.title || '🎬 Fukrey',
    {
      body: data.body || 'New content available!',
      icon: '/gang/icon-192.png',
      badge: '/gang/icon-192.png',
      image: data.thumbnail,
      data: { url: data.url || '/gang/' },
      vibrate: [200, 100, 200],
    }
  ));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/gang/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if (c.url === url) return c.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
