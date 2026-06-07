/**
 * OlomiPay Service Worker
 * Handles:
 *   1. Web Push notifications (money in/out, chat, payment requests)
 *   2. Notification click → opens relevant page in app
 *   3. Sound via vibration pattern (browser controls actual audio)
 */

const APP_URL = self.location.origin;

// ── Push event ─────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'OlomiPay', body: event.data.text(), data: {} }; }

  const { title, body, icon, data = {} } = payload;
  const type = data.type ?? 'general';

  // Pick vibration pattern and badge colour by notification type
  const vibrate = type === 'money_in' || type === 'payment_received'
    ? [200, 100, 200, 100, 400]   // double-buzz for money received
    : type === 'money_out'
    ? [100, 50, 100]              // short confirm for money sent
    : type === 'chat'
    ? [100]                       // single buzz for chat
    : [200];

  const options = {
    body,
    icon:    icon ?? '/icon-192.svg',
    badge:   '/icon-192.svg',
    tag:     type,                // replace earlier notif of same type
    renotify: true,
    vibrate,
    data,
    actions: buildActions(type, data),
    requireInteraction: type === 'payment_request', // stay on screen for requests
    silent: false,
  };

  event.waitUntil(
    (async () => {
      // If the app is open AND focused/visible, let the in-app toast + sound
      // handle it — don't also pop a system banner (avoids double-notify while
      // actively chatting). When the phone is in the pocket (no focused window),
      // we always show it with sound + vibration.
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = clientsArr.some(c => c.focused || c.visibilityState === 'visible');
      if (focused && type === 'chat') return;
      await self.registration.showNotification(title, options);
    })()
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data   = event.notification.data ?? {};
  const action = event.action;

  let url = '/dashboard';
  if (data.conversationId) {
    url = `/chat/${data.conversationId}`;
  } else if (data.type === 'money_in' || data.type === 'money_out') {
    url = '/history';
  } else if (data.type === 'payment_request') {
    url = data.conversationId ? `/chat/${data.conversationId}` : '/chat';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      // If app is already open, focus it and navigate
      for (const client of cs) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) clients.openWindow(APP_URL + url);
    })
  );
});

// ── Notification close ─────────────────────────────────────────────────────────
self.addEventListener('notificationclose', () => {});

// ── Message from app ───────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildActions(type, data) {
  if (type === 'payment_request') {
    return [
      { action: 'open_chat', title: '💬 Open Chat' },
    ];
  }
  if (type === 'money_in') {
    return [
      { action: 'open_history', title: '📋 View' },
    ];
  }
  return [];
}
