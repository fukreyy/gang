// SW v2 - ad blocker enhanced
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
  'adservice.google.com', 'googletagmanager.com', 'googletagservices.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'hilltopads.com',
  'adsterra.com', 'clickadu.com', 'exoclick.com', 'juicyads.com',
  'trafficjunky.net', 'taboola.com', 'outbrain.com', 'mgid.com',
  'adskeeper.com', 'adcash.com', 'monetag.com', 'adnxs.com',
  'rubiconproject.com', 'openx.net', 'pubmatic.com', 'smartadserver.com',
  'adsrvr.org', 'revcontent.com', 'bidswitch.net', 'casalemedia.com',
  'criteo.com', 'criteo.net', 'moatads.com', 'advertising.com',
  'media.net', 'adroll.com', 'appnexus.com', 'sovrn.com',
  'sharethrough.com', 'triplelift.com', 'indexexchange.com',
  'aniview.com', 'springserve.com', 'primis.tech', 'vidoomy.com',
  'adtelligent.com', 'setupad.com', 'conversantmedia.com',
  'tsyndicate.com', 'trafficshop.com', 'popmyads.com',
  'adspyglass.com', 'hilltopads.net', 'plugrush.com',
  'realsrv.com', 'serverbid.com', 'undertone.com',
];

const BLOCKED_NAVIGATIONS = [
  'dlhd.pk', 'vidsrc', 'vidlink', 'videasy', '2embed'
];

self.addEventListener('fetch', (event) => {
  const url = event.request.url.toLowerCase();

  // Block known ad domains
  if (AD_DOMAINS.some(d => url.includes(d))) {
    console.log('🚫 Ad blocked:', url);
    event.respondWith(new Response('', { status: 204 }));
    return;
  }

  // Block top-level navigations triggered from stream iframes
  if (
    event.request.mode === 'navigate' &&
    event.request.destination === 'document'
  ) {
    const referer = (event.request.referrer || '').toLowerCase();
    const isFromStream = BLOCKED_NAVIGATIONS.some(d => referer.includes(d));
    if (isFromStream) {
      console.log('🚫 Tab hijack blocked from:', referer);
      event.respondWith(new Response('<h1>Blocked</h1>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));
      return;
    }
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
