/* JIKO CONNECT service worker — background Web Push delivery. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; }
  catch { p = { title: 'JIKO CONNECT', body: event.data ? event.data.text() : '' }; }
  const title = p.title || 'JIKO CONNECT';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: p.body || '',
      tag: p.tag,
      renotify: !!p.tag,
      data: { url: p.url || '/dashboard' },
      vibrate: [90, 40, 90],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(url); } catch (e) {} return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
