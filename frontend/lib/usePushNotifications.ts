/**
 * usePushNotifications
 * Registers the service worker, requests push permission, subscribes to VAPID,
 * and syncs the subscription with the backend.
 *
 * Call once after login (e.g. in dashboard layout).
 */

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt') || '';
}

/** Convert a base64 VAPID public key to Uint8Array for PushManager */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad  = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64  = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(b64);
  const out  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let _registered = false; // prevent double-registration per page load

export async function registerPush(): Promise<void> {
  if (_registered) return;
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // 1. Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 2. Request notification permission (only ask once — browser remembers)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // 3. Get VAPID public key from backend
    const keyRes = await fetch(`${API}/api/notifications/vapid-key`).then(r => r.json());
    if (!keyRes.success || !keyRes.data?.publicKey) return;

    // 4. Subscribe (browser handles dedup — returns existing if already subscribed)
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
    });

    const subJson = sub.toJSON();
    if (!subJson.keys) return;

    // 5. Send subscription to backend
    const token = getToken();
    if (!token) return;

    await fetch(`${API}/api/notifications/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys:     { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      }),
    });

    _registered = true;

    // 6. Listen for SW messages (navigation requests from notification click)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        window.location.href = event.data.url;
      }
    });
  } catch (e) {
    console.warn('[push] registration failed:', e);
  }
}

/** Call on logout to remove the push subscription */
export async function unregisterPush(): Promise<void> {
  _registered = false;
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`${API}/api/notifications/unsubscribe`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {}
}
