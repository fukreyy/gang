// Fukrey Service Worker - Ad Blocker + Push Notifications

self.addEventListener('install', (event) => {
  console.log('SW installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW activated.');
  event.waitUntil(clients.claim());
});

// ─── AD BLOCKER ────────────────────────────────────────────────
const AD_DOMAINS = [
  // Major ad networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  
  // Popular ad networks (used by streaming sites)
  'adsystem.com', 'adsrvr.org', 'adnxs.com', 'adsafeprotected.com',
  'moatads.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  
  // Popup/popunder networks (the worst)
  'popads.net', 'popcash.net', 'popmyads.com', 'popunder.net',
  'propellerads.com', 'propeller-tracking.com', 'onclickads.net',
  'hilltopads.com', 'hilltopads.net', 'adsterra.com', 'adsterranet.com',
  'clickadu.com', 'clicksgear.com', 'exoclick.com', 'exosrv.com',
  
  // Adult/scam ad networks (common on free streaming)
  'juicyads.com', 'trafficjunky.net', 'trafficfactory.biz',
  'plugrush.com', 'eroadvertising.com', 'adxbid.com',
  
  // Crypto miners
  'coinhive.com', 'crypto-loot.com', 'coin-have.com',
  
  // Tracking/Analytics
  'taboola.com', 'outbrain.com', 'mgid.com', 'revcontent.com',
  'criteo.com', 'criteo.net', 'scorecardresearch.com',
  'quantserve.com', 'quantcount.com', 'chartbeat.com',
  
  // Streaming-site specific ads
  'histats.com', 'statcounter.com', 'cloudfront-ads.com',
  'adskeeper.com', 'adsmedia.com', 'adcash.com', 'adcashnetwork.com',
  'mc.yandex.ru', 'yandex-metrica.com',
  
  // Misc
  'amung.us', 'whos.amung.us', 'paypopup.com', 'redirect.media',
  'monetizer.com', 'monetag.com', 'mediafire-ads.com'
];

const AD_KEYWORDS = [
  '/ads/', '/ad/', '/adv/', '/advert', '/banner/', '/popup/',
  '/popunder/', 'ads.js', 'ad.js', 'analytics.js', 'tracker.js',
  '/track?', '/pixel?', '/click?', 'doubleclick', 'sponsor'
];

self.addEventListener('fetch', (event) => {
  const url = event.request.url.toLowerCase();
  
  // Block known ad domains
  if (AD_DOMAINS.some(domain => url.includes(domain))) {
    event.respondWith(new Response('', { 
      status: 204,
      statusText: 'Blocked by Fukrey AdBlocker' 
    }));
    return;
  }
  
  // Block by URL keywords (more aggressive)
  if (AD_KEYWORDS.some(keyword => url.includes(keyword))) {
    // Don't block if it's from your own domain or TMDB
    if (!url.includes(self.location.hostname) && 
        !url.includes('themoviedb.org') &&
        !url.includes('tmdb.org')) {
      event.respondWith(new Response('', { status: 204 }));
      return;
    }
  }
});

// ─── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Fukrey', body: event.data.text() };
  }

  const title = data.title || '🎬 Fukrey';
  const options = {
    body: data.body || 'New content available!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    image: data.thumbnail || undefined,
    data: { media_id: data.media_id, url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

console.log('🛡️ Fukrey AdBlocker SW loaded - Blocking', AD_DOMAINS.length, 'domains');
