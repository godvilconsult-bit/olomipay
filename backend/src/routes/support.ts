/**
 * Trust & safety (Tier 2): raise an order dispute, and a rider SOS that alerts
 * admins with the rider's live location.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';
import { emitToUser } from '../socket';

const router = Router();

// ── POST /api/support/dispute ─ raise an issue on an order ───────────────────────
router.post('/dispute', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    orderId: z.string(),
    reason:  z.string().min(2).max(80),
    detail:  z.string().max(500).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const order = await prisma.order.findUnique({
    where:  { id: parse.data.orderId },
    select: { id: true, orderNo: true, householdId: true, supplier: { select: { userId: true } }, delivery: { select: { riderId: true } } },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const ps = new Set([order.householdId, order.supplier?.userId, order.delivery?.riderId].filter(Boolean) as string[]);
  if (!ps.has(req.userId!)) return res.status(403).json({ error: 'Not your order' });

  const dispute = await prisma.dispute.create({ data: { orderId: order.id, raisedById: req.userId!, reason: parse.data.reason, detail: parse.data.detail ?? null } });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, { title: 'New dispute ⚠️', body: `${order.orderNo}: ${parse.data.reason}`, type: 'dispute', data: { disputeId: dispute.id, orderId: order.id } })));
  res.status(201).json({ dispute });
});

// ── POST /api/support/sos ─ emergency alert (rider) → admins ─────────────────────
router.post('/sos', requireAuth, async (req: AuthRequest, res) => {
  const lat = typeof req.body?.lat === 'number' ? req.body.lat : null;
  const lng = typeof req.body?.lng === 'number' ? req.body.lng : null;
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, phone: true, role: true } });
  const where = lat != null ? ` near ${lat.toFixed(4)}, ${lng!.toFixed(4)}` : '';
  const body = `${u?.name ?? 'A user'} (${u?.role}) triggered SOS${where}. Call ${u?.phone}.`;
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => {
    emitToUser(a.id, 'sos', { userId: req.userId, lat, lng, name: u?.name, phone: u?.phone });
    return notify(a.id, { title: '🚨 SOS alert', body, type: 'sos', data: { lat, lng, phone: u?.phone } });
  }));
  res.json({ ok: true });
});

export { router as supportRouter };
