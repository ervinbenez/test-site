const SW_VERSION = '2.0.0';
const CACHE_VERSION = 'v2';
const CACHE_NAME = `client-cache-${CACHE_VERSION}`;

const TRACK_ENDPOINT = 'https://pwakings.com/api/push-stats';


self.addEventListener('install', event => {
  self.skipWaiting();
});


self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );

  event.waitUntil(self.clients.claim());
});


self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});


self.addEventListener('push', event => {
  if (!event.data) return;

  let payload = {};

  try {
    payload = event.data.json();
  } catch (e) {
    console.warn('[Client-SW] Invalid push payload');
    return;
  }

  const data = {
    title: payload.title || 'Notification',
    body: payload.body || '',
    icon: payload.icon || '',
    badge: payload.badge || '',
    url: payload.url || '/',
    campaign_id: payload.campaign_id || null,
    campaign_name: payload.campaign_name || null
  };

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: 'push-alert',
    renotify: true,
    data: {
      url: data.url || '/',
      campaign_id: data.campaign_id,
      campaign_name: data.campaign_name
    }
  };

  const impression = fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      event: 'seen',
      campaign_id: data.campaign_id,
      campaign_name: data.campaign_name,
      domain: self.location.hostname,
      timestamp: Date.now()
    })
  }).catch(() => {});

  event.waitUntil(
    Promise.all([
      impression,
      self.registration.showNotification(data.title, options)
    ])
  );
});


self.addEventListener('notificationclick', event => {
  event.notification.close();

  const d = event.notification.data || {};
  const targetUrl = resolveUrl(d.url || '/');

  const click = fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      event: 'clicked',
      campaign_id: d.campaign_id,
      campaign_name: d.campaign_name,
      domain: self.location.hostname,
      timestamp: Date.now()
    })
  }).catch(() => {});

  event.waitUntil(
    Promise.all([
      click,
      focusOrOpen(targetUrl)
    ])
  );
});


function resolveUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return new URL(url, self.location.origin).href;
  }
}


async function focusOrOpen(url) {
  const allClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of allClients) {
    if (client.url === url && 'focus' in client) {
      return client.focus();
    }
  }

  return clients.openWindow(url);
}