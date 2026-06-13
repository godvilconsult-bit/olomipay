/**
 * Web Push (VAPID) — delivers notifications to PWA users even when the app is
 * closed (the service worker wakes up). Gracefully no-ops until VAPID keys are
 * configured, so nothing breaks in dev. Generate keys once with:
 *   npx web-push generate-vapid-keys
 * then set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT).
 *
 * Native APK push (FCM) is a separate channel layered on top later; the
 * PushSubscription store + this dispatcher are channel-agnostic.
 */
import webpush from 'web-push';
import { prisma } from '../lib/prisma';

const PUBLIC  = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@jikoconnect.tz';
export const PUSH_CONFIGURED = !!(PUBLIC && PRIVATE);

if (PUSH_CONFIGURED) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); }
  catch (e: any) { console.error('[push] bad VAPID keys:', e?.message); }
}

export function pushPublicKey(): string | null {
  return PUSH_CONFIGURED ? PUBLIC : null;
}

/** Fire a web push to all of a user's subscriptions; prune dead ones. */
export async function sendWebPush(userId: string, payload: { title: string; body: string; url?: string; tag?: string }): Promise<void> {
  if (!PUSH_CONFIGURED) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const data = JSON.stringify({ url: '/dashboard', ...payload });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dhKey, auth: s.authKey } }, data);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } }).catch(() => {});
      } else {
        console.error('[push] send failed:', e?.statusCode ?? e?.message);
      }
    }
  }));
}
