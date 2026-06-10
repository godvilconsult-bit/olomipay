import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

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
