import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const ok  = (data: any) => ({ success: true,  data });
const err = (msg: string, status = 400) => ({ success: false, error: msg, _status: status });

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
