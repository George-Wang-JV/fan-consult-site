self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || '你有一条新消息' }; }
  event.waitUntil(self.registration.showNotification(data.title || '废慨vc跟单中心', {
    body: data.body || '你有一条新消息',
    tag: data.tag || 'new-message',
    renotify: true,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then((windows) =>
    Promise.all(windows.map((client) => client.postMessage({ type:'push-subscription-changed' })))
  ));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
