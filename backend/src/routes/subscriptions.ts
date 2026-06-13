/**
 * Household auto-refill subscriptions. Create one from a past order (1-tap) or
 * from explicit items; pause/resume/cancel. The scheduler in services/
 * subscriptions.ts places the actual recurring orders.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const DAY = 864e5;

async function withVendorNames(subs: any[]) {
  const ids = [...new Set(subs.map((s) => s.supplierId))];
  const sups = await prisma.supplierProfile.findMany({ where: { id: { in: ids } }, select: { id: true, businessName: true } });
  const map = new Map(sups.map((s) => [s.id, s.businessName]));
  return subs.map((s) => ({ ...s, vendorName: map.get(s.supplierId) ?? null }));
}

// ── GET /api/subscriptions ─ my auto-refills ─────────────────────────────────────
router.get('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const subs = await prisma.subscription.findMany({ where: { householdId: req.userId }, orderBy: { createdAt: 'desc' } });
  res.json({ subscriptions: await withVendorNames(subs) });
});

// ── POST /api/subscriptions ─ create from explicit items ─────────────────────────
router.post('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    supplierId:   z.string(),
    addressId:    z.string(),
    items:        z.array(z.object({ productId: z.string(), qty: z.number().int().min(1).max(20) })).min(1),
    intervalDays: z.number().int().min(3).max(120).default(30),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { supplierId, addressId, items, intervalDays } = parse.data;
  const addr = await prisma.address.findFirst({ where: { id: addressId, userId: req.userId } });
  if (!addr) return res.status(404).json({ error: 'Address not found' });
  const sub = await prisma.subscription.create({
    data: { householdId: req.userId!, supplierId, addressId, items, intervalDays, nextRunAt: new Date(Date.now() + intervalDays * DAY) },
  });
  res.status(201).json({ subscription: sub });
});

// ── POST /api/subscriptions/from-order/:orderId ─ 1-tap "repeat this every N days"
router.post('/from-order/:orderId', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({ intervalDays: z.number().int().min(3).max(120).default(30) }).safeParse(req.body);
  const intervalDays = parse.success ? parse.data.intervalDays : 30;
  const order = await prisma.order.findFirst({ where: { id: req.params.orderId, householdId: req.userId }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = order.items.map((i) => ({ productId: i.productId, qty: i.qty }));
  if (items.length === 0) return res.status(400).json({ error: 'Order has no items' });
  const addr = await prisma.address.findFirst({ where: { userId: req.userId, isDefault: true } }) ?? await prisma.address.findFirst({ where: { id: order.addressId, userId: req.userId } });
  if (!addr) return res.status(400).json({ error: 'Set a delivery location first' });
  const sub = await prisma.subscription.create({
    data: { householdId: req.userId!, supplierId: order.supplierId, addressId: addr.id, items, intervalDays, nextRunAt: new Date(Date.now() + intervalDays * DAY) },
  });
  res.status(201).json({ subscription: sub });
});

router.patch('/:id', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({ isActive: z.boolean().optional(), intervalDays: z.number().int().min(3).max(120).optional() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const r = await prisma.subscription.updateMany({ where: { id: req.params.id, householdId: req.userId }, data: parse.data });
  if (r.count === 0) return res.status(404).json({ error: 'Subscription not found' });
  res.json({ ok: true });
});

router.delete('/:id', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  await prisma.subscription.deleteMany({ where: { id: req.params.id, householdId: req.userId } });
  res.json({ ok: true });
});

export { router as subscriptionsRouter };
