'use client';

import { notifications } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

let registered = false;

/**
 * Register the service worker and subscribe to Web Push so the user gets
 * notifications when the app is closed. Best-effort + idempotent. No-ops if the
 * browser can't do push or VAPID isn't configured server-side. Should be called
 * from a user gesture so the permission prompt is allowed.
 */
export async function registerPush(): Promise<void> {
  if (registered) return;
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    const { publicKey } = await notifications.vapid();
    if (!publicKey) return; // server not configured yet

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    }
    const j: any = sub.toJSON();
    if (j?.endpoint && j?.keys?.p256dh && j?.keys?.auth) {
      await notifications.subscribe({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
      registered = true;
    }
  } catch {
    /* best-effort — never throw into the UI */
  }
}
