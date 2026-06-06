/**
 * Push Notification service.
 * Uses Web Push (VAPID) for PWA + stores in DB for notification history.
 * All user-facing messages are bilingual: Swahili / English.
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import webpush from 'web-push';


// Configure VAPID once at startup
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@olomipay.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export interface NotificationPayload {
  title: string;
  body:  string;
  type:  string;
  data?: Record<string, any>;
}

// ── Native push (FCM) for the iOS/Android apps ────────────────────────────────
// Lazily initialised from FCM_SERVICE_ACCOUNT (the Firebase service-account JSON).
// Wrapped so a missing package or missing env NEVER crashes the server — push
// just falls back to web-push only.
let fcm: any = null;
try {
  const svc = process.env.FCM_SERVICE_ACCOUNT;
  if (svc) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
    }
    fcm = admin.messaging();
    console.log('[fcm] native push enabled');
  } else {
    console.log('[fcm] FCM_SERVICE_ACCOUNT not set — native push disabled (web-push only)');
  }
} catch (e: any) {
  console.warn('[fcm] init failed — native push disabled:', e?.message);
}

async function sendNativePush(userId: string, payload: NotificationPayload): Promise<void> {
  if (!fcm) return;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "token" FROM "DeviceToken" WHERE "userId" = $1`, userId,
  ).catch(() => [] as any[]);
  if (!rows.length) return;

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v);
  data.type = payload.type;

  // Unread count → shown as the app-icon badge / notification count, so the user
  // sees how many messages/alerts are waiting before opening the app.
  let badge = 0;
  try {
    const c = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS n FROM "Notification" WHERE "userId" = $1 AND "isRead" = false`, userId,
    );
    badge = c?.[0]?.n ?? 0;
  } catch { /* ignore */ }

  try {
    const resp = await fcm.sendEachForMulticast({
      tokens:       rows.map(r => r.token),
      notification: { title: payload.title, body: payload.body },
      data,
      android: {
        priority: 'high',
        notification: {
          sound:        'default',          // play a sound
          defaultSound: true,
          channelId:    'olomipay_default', // the HIGH-importance channel the app created
          defaultVibrateTimings: true,
          notificationCount: badge,         // number badge on the app icon
        },
      },
      apns: { payload: { aps: { sound: 'default', badge } } },
    });
    await Promise.all(resp.responses.map((r: any, i: number) => {
      const code = r.error?.code ?? '';
      if (!r.success && /not-registered|invalid-argument|invalid-registration/.test(code)) {
        return prisma.$executeRawUnsafe(`DELETE FROM "DeviceToken" WHERE "token" = $1`, rows[i].token).catch(() => {});
      }
      return Promise.resolve();
    }));
  } catch (e: any) {
    console.warn('[fcm] send failed:', e?.message);
  }
}

// ── Send push to all user subscriptions ──────────────────────────────────────

export async function sendPushToUser(userId: string, payload: NotificationPayload): Promise<void> {
  // 1. Save to DB (notification history)
  await prisma.notification.create({
    data: {
      userId,
      title:  payload.title,
      body:   payload.body,
      type:   payload.type,
      data:   payload.data ?? {},
    },
  });

  // 2. Send Web Push to all registered subscriptions
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });

  const pushPayload = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  '/icon-192.svg',
    badge: '/icon-192.svg',
    data:  payload.data,
  });

  await Promise.allSettled(
    subs.map((sub: any) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
        pushPayload,
      ).catch(async (err: { statusCode?: number }) => {
        // Remove invalid subscriptions (410 Gone)
        if (err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }),
    ),
  );

  // 3. Native push to the iOS/Android apps (FCM). No-op if FCM isn't configured.
  await sendNativePush(userId, payload).catch(() => {});
}

// ── Pre-built notification templates (Swahili + English) ─────────────────────

export const notify = {
  moneyReceived: (userId: string, amount: string, from: string) =>
    sendPushToUser(userId, {
      title: 'Umepokea pesa! 💚',
      body:  `Umepokea ${amount} kutoka ${from} / You received ${amount} from ${from}`,
      type:  'money_in',
      data:  { amount, from },
    }),

  moneySent: (userId: string, amount: string, to: string) =>
    sendPushToUser(userId, {
      title: 'Pesa imetumwa ✅',
      body:  `Umetuma ${amount} kwa ${to} / You sent ${amount} to ${to}`,
      type:  'money_out',
      data:  { amount, to },
    }),

  depositConfirmed: (userId: string, amountTzs: string, amountUsdc: string) =>
    sendPushToUser(userId, {
      title: 'Amana imefanikiwa! ✅',
      body:  `Amana yako ya ${amountTzs} (${amountUsdc} USDC) imefanikiwa / Deposit confirmed`,
      type:  'money_in',
      data:  { amountTzs, amountUsdc },
    }),

  lowBalance: (userId: string, balance: string) =>
    sendPushToUser(userId, {
      title: 'Salio chini ⚠️',
      body:  `Mkoba wako una ${balance} tu / Your balance is low: ${balance}`,
      type:  'low_balance',
      data:  { balance },
    }),

  yieldEarned: (userId: string, amount: string) =>
    sendPushToUser(userId, {
      title: 'Faida ya akiba! 🌱',
      body:  `Umepata faida ya ${amount} leo / You earned ${amount} in savings yield`,
      type:  'yield',
      data:  { amount },
    }),

  scheduledPaymentSent: (userId: string, amount: string, to: string) =>
    sendPushToUser(userId, {
      title: 'Malipo ya kawaida ✅',
      body:  `Malipo ya ${amount} yametumwa kwa ${to} / Scheduled payment sent`,
      type:  'scheduled',
      data:  { amount, to },
    }),

  transactionFailed: (userId: string, reason: string) =>
    sendPushToUser(userId, {
      title: 'Malipo hayakufanikiwa ❌',
      body:  `${reason} / Transaction failed: ${reason}`,
      type:  'failed',
      data:  { reason },
    }),

  claimAvailable: (phone: string, amount: string, claimUrl: string) =>
    // SMS only (no userId for unregistered users) — handled by SMS service
    Promise.resolve(),

  billPaid: (userId: string, billerName: string, amount: string, token?: string) =>
    sendPushToUser(userId, {
      title: `${billerName} imelipwa ✅`,
      body:  token
        ? `Token yako: ${token} / Your token: ${token}`
        : `Malipo ya ${amount} kwa ${billerName} yamefanikiwa`,
      type:  'money_out',
      data:  { billerName, amount, token },
    }),
};
