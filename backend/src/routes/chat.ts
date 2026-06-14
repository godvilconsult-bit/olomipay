/**
 * Order-scoped in-app chat between the people on an order (household, rider,
 * supplier). Realtime over Socket.io; a Web Push fires for offline recipients
 * (no in-app notification row, so chat doesn't spam the bell).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { emitToUser } from '../socket';
import { sendWebPush } from '../services/push';

const router = Router();

/** The user ids allowed to read/write this order's chat. */
async function participantsOf(orderId: string): Promise<Set<string> | null> {
  const order = await prisma.order.findUnique({
    where:  { id: orderId },
    select: { householdId: true, supplier: { select: { userId: true } }, delivery: { select: { riderId: true } } },
  });
  if (!order) return null;
  const set = new Set<string>([order.householdId]);
  if (order.supplier?.userId) set.add(order.supplier.userId);
  if (order.delivery?.riderId) set.add(order.delivery.riderId);
  return set;
}

// ── GET /api/chat/:orderId ─ history (marks the rest read) ───────────────────────
router.get('/:orderId', requireAuth, async (req: AuthRequest, res) => {
  const ps = await participantsOf(req.params.orderId);
  if (!ps) return res.status(404).json({ error: 'Order not found' });
  if (!ps.has(req.userId!)) return res.status(403).json({ error: 'Not your conversation' });
  const messages = await prisma.chatMessage.findMany({ where: { orderId: req.params.orderId }, orderBy: { createdAt: 'asc' }, take: 200 });
  await prisma.chatMessage.updateMany({ where: { orderId: req.params.orderId, senderId: { not: req.userId! }, readAt: null }, data: { readAt: new Date() } });
  res.json({ messages, me: req.userId });
});

// ── POST /api/chat/:orderId ─ send a message ─────────────────────────────────────
router.post('/:orderId', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Message required' });
  const ps = await participantsOf(req.params.orderId);
  if (!ps) return res.status(404).json({ error: 'Order not found' });
  if (!ps.has(req.userId!)) return res.status(403).json({ error: 'Not your conversation' });

  const msg = await prisma.chatMessage.create({ data: { orderId: req.params.orderId, senderId: req.userId!, body: parse.data.body } });
  const sender = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  for (const uid of ps) {
    if (uid === req.userId) continue;
    emitToUser(uid, 'chat:message', msg);
    sendWebPush(uid, { title: `💬 ${sender?.name ?? 'New message'}`, body: parse.data.body.slice(0, 90), url: `/chat/${req.params.orderId}`, tag: `chat-${req.params.orderId}` }).catch(() => {});
  }
  res.status(201).json({ message: msg });
});

export { router as chatRouter };
