import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { pushPublicKey } from '../services/push';

const router = Router();

// ── Web Push subscription management ──────────────────────────────────────────────
// The frontend fetches the VAPID public key, subscribes the service worker, and
// POSTs the subscription here so the backend can push when the app is closed.
router.get('/vapid', (_req, res) => res.json({ publicKey: pushPublicKey() }));

router.post('/subscribe', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid subscription' });
  const { endpoint, keys } = parse.data;
  await prisma.pushSubscription.upsert({
    where:  { endpoint },
    update: { userId: req.userId!, p256dhKey: keys.p256dh, authKey: keys.auth },
    create: { userId: req.userId!, endpoint, p256dhKey: keys.p256dh, authKey: keys.auth },
  });
  res.json({ ok: true });
});

router.post('/unsubscribe', requireAuth, async (req: AuthRequest, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  res.json({ ok: true });
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: req.userId, isRead: false } }),
  ]);
  res.json({ notifications: items, unread });
});

router.post('/read-all', requireAuth, async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({ where: { userId: req.userId, isRead: false }, data: { isRead: true } });
  res.json({ ok: true });
});

router.post('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId }, data: { isRead: true } });
  res.json({ ok: true });
});

export { router as notificationsRouter };
