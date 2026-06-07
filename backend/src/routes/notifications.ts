import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { pushStatus } from '../services/notifications';

const router = Router();

const ok  = (data: any) => ({ success: true,  data });
const err = (msg: string, status = 400) => ({ success: false, error: msg, _status: status });

// ── GET /api/notifications/config ────────────────────────────────────────────
// Public, no secrets — just whether each background-push channel is configured
// on the server. Open in any browser to diagnose: nativeFcm/webPush = false
// means that channel's env vars aren't set, so background pushes can't be sent.
router.get('/config', (_req, res) => {
  res.json(ok(pushStatus()));
});

// ── GET /api/notifications/status ────────────────────────────────────────────
// Diagnostic: which background-push channels the server has configured, and
// whether THIS user's device is registered to receive them. Visit while logged
// in to instantly see why background notifications may not be arriving.
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const ch = pushStatus();
  const [devTokens, webSubs] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "DeviceToken" WHERE "userId" = $1`, req.userId!).catch(() => [{ n: 0 }]),
    prisma.pushSubscription.count({ where: { userId: req.userId! } }).catch(() => 0),
  ]);
  const myDeviceTokens = devTokens?.[0]?.n ?? 0;
  const willReceiveBackground =
    (ch.nativeFcm && myDeviceTokens > 0) || (ch.webPush && (webSubs as number) > 0);
  return res.json(ok({
    channels:           ch,             // { nativeFcm, webPush } — server config
    myDeviceTokens,                     // FCM tokens registered for this device
    myWebSubscriptions: webSubs,        // web-push subscriptions for this user
    willReceiveBackground,              // the bottom line
  }));
});

// ── POST /api/notifications/subscribe ────────────────────────────────────────

router.post('/subscribe', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    endpoint:  z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth:   z.string(),
    }),
  }).safeParse(req.body);

  if (!parse.success) return res.status(400).json(err(parse.error.errors[0].message));

  const { endpoint, keys } = parse.data;

  await prisma.pushSubscription.upsert({
    where:  { endpoint },
    update: { p256dhKey: keys.p256dh, authKey: keys.auth },
    create: { userId: req.userId!, endpoint, p256dhKey: keys.p256dh, authKey: keys.auth },
  });

  return res.json(ok({ message: 'Subscribed to push notifications' }));
});

// ── POST /api/notifications/register-device ───────────────────────────────────
// Native app (Capacitor) registers its FCM/APNs device token here so the
// backend can push money/chat notifications to the phone.
router.post('/register-device', requireAuth, async (req: AuthRequest, res) => {
  const token    = String(req.body?.token ?? '').trim();
  const platform = String(req.body?.platform ?? 'android').slice(0, 16);
  if (!token) return res.status(400).json(err('token required'));
  await prisma.$executeRawUnsafe(
    `INSERT INTO "DeviceToken" ("userId","token","platform") VALUES ($1,$2,$3)
     ON CONFLICT ("token") DO UPDATE SET "userId" = $1, "platform" = $3`,
    req.userId!, token, platform,
  ).catch(() => {});
  return res.json(ok({ message: 'Device registered' }));
});

// ── DELETE /api/notifications/unsubscribe ─────────────────────────────────────

router.delete('/unsubscribe', requireAuth, async (req: AuthRequest, res) => {
  await prisma.pushSubscription.deleteMany({ where: { userId: req.userId! } });
  return res.json(ok({ message: 'Unsubscribed' }));
});

// ── GET /api/notifications/history ───────────────────────────────────────────

router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const limit  = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where:   { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    offset,
    }),
    prisma.notification.count({ where: { userId: req.userId! } }),
  ]);

  return res.json(ok({ notifications, total, unread: notifications.filter((n: { isRead: boolean }) => !n.isRead).length }));
});

// ── POST /api/notifications/read ─────────────────────────────────────────────

router.post('/read', requireAuth, async (req: AuthRequest, res) => {
  const { ids } = req.body;
  if (ids && Array.isArray(ids)) {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, id: { in: ids } },
      data:  { isRead: true },
    });
  } else {
    // Mark all as read
    await prisma.notification.updateMany({
      where: { userId: req.userId! },
      data:  { isRead: true },
    });
  }
  return res.json(ok({ message: 'Marked as read' }));
});

// ── GET /api/notifications/vapid-key ─────────────────────────────────────────

router.get('/vapid-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json(err('Push notifications not configured', 503));
  return res.json(ok({ publicKey: key }));
});

export { router as notificationsRouter };
