import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { makeOtp } from '../lib/ids';
import { etaMinutes, haversineKm } from '../lib/geo';
import { notify } from '../services/notify';
import { emitToUser, emitToRiders } from '../socket';

const router = Router();

async function myProfile(userId: string) {
  return prisma.supplierProfile.findUnique({ where: { userId } });
}

// ── GET /api/suppliers/me ─ profile + headline stats ─────────────────────────────
router.get('/me', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'Supplier profile not found' });
  const [pending, today, lowStock] = await Promise.all([
    prisma.order.count({ where: { supplierId: profile.id, status: { in: ['ALERTED', 'ACCEPTED', 'BROADCAST', 'CLAIMED', 'PICKED'] } } }),
    prisma.order.count({ where: { supplierId: profile.id, placedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.inventory.count({ where: { supplierId: profile.id, stock: { lte: 3 } } }),
  ]);
  res.json({ profile, stats: { pending, today, lowStock } });
});

// ── PUT /api/suppliers/me ─ update profile / open-close / location ────────────────
router.put('/me', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({
    businessName: z.string().max(120).optional(),
    phone:        z.string().max(20).optional(),
    region:       z.string().max(60).optional(),
    district:     z.string().max(60).optional(),
    ward:         z.string().max(60).optional(),
    lat:          z.number().optional(),
    lng:          z.number().optional(),
    isOpen:       z.boolean().optional(),
    distributor:  z.string().max(120).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const profile = await prisma.supplierProfile.update({ where: { userId: req.userId }, data: parse.data });
  res.json({ profile });
});

// ── Inventory ────────────────────────────────────────────────────────────────────
router.get('/inventory', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const inventory = await prisma.inventory.findMany({ where: { supplierId: profile.id }, include: { product: true }, orderBy: { product: { brand: 'asc' } } });
  res.json({ inventory });
});

router.post('/inventory', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({
    productId:   z.string(),
    price:       z.number().min(0),
    stock:       z.number().int().min(0),
    isAvailable: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });

  const { productId, price, stock, isAvailable } = parse.data;
  const inv = await prisma.inventory.upsert({
    where:  { supplierId_productId: { supplierId: profile.id, productId } },
    update: { price, stock, isAvailable },
    create: { supplierId: profile.id, productId, price, stock, isAvailable },
    include: { product: true },
  });
  res.json({ inventory: inv });
});

router.delete('/inventory/:id', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  await prisma.inventory.deleteMany({ where: { id: req.params.id, supplierId: profile.id } });
  res.json({ ok: true });
});

// ── GET /api/suppliers/orders ─ live order queue ─────────────────────────────────
router.get('/orders', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const orders = await prisma.order.findMany({
    where:   { supplierId: profile.id },
    include: { items: true, address: true, payment: true, delivery: true, household: { select: { name: true, phone: true } } },
    orderBy: { placedAt: 'desc' },
    take:    50,
  });
  res.json({ orders });
});

// ── POST /api/suppliers/orders/:id/accept ─ accept → broadcast to riders ──────────
router.post('/:id/accept', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });

  const order = await prisma.order.findFirst({ where: { id: req.params.id, supplierId: profile.id }, include: { address: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PLACED', 'ALERTED'].includes(order.status)) return res.status(409).json({ error: 'Order already handled' });

  const otp = makeOtp();
  await prisma.$transaction(async (tx) => {
    await tx.delivery.upsert({
      where:  { orderId: order.id },
      update: { status: 'PENDING', otp, riderFee: order.deliveryFee, pickupLat: profile.lat, pickupLng: profile.lng, dropLat: order.address.lat, dropLng: order.address.lng },
      create: { orderId: order.id, status: 'PENDING', otp, riderFee: order.deliveryFee, pickupLat: profile.lat, pickupLng: profile.lng, dropLat: order.address.lat, dropLng: order.address.lng },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: 'BROADCAST', acceptedAt: new Date() } });
  });

  const tripKm = profile.lat != null && profile.lng != null ? haversineKm(profile.lat, profile.lng, order.address.lat, order.address.lng) : null;

  // Broadcast the job to every rider in the region.
  emitToRiders(profile.region, 'job:new', {
    orderId: order.id, orderNo: order.orderNo, vendor: profile.businessName,
    payout: order.deliveryFee, tripKm: tripKm != null ? Math.round(tripKm * 10) / 10 : null,
    tripEtaMin: tripKm != null ? etaMinutes(tripKm) : null,
  });
  emitToUser(order.householdId, 'order:accepted', { orderId: order.id, otp });
  await notify(order.householdId, { title: 'Oda imekubaliwa ✅', body: `${profile.businessName} inaandaa gesi yako. Namba ya uthibitisho: ${otp}`, type: 'order', data: { orderId: order.id, otp } });

  res.json({ ok: true, otp });
});

// ── POST /api/suppliers/orders/:id/reject ────────────────────────────────────────
router.post('/:id/reject', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const order = await prisma.order.findFirst({ where: { id: req.params.id, supplierId: profile.id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PLACED', 'ALERTED'].includes(order.status)) return res.status(409).json({ error: 'Order already handled' });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: req.body?.reason ?? 'Declined by vendor' } });
    for (const it of order.items) {
      await tx.inventory.updateMany({ where: { supplierId: profile.id, productId: it.productId }, data: { stock: { increment: it.qty } } });
    }
  });
  emitToUser(order.householdId, 'order:rejected', { orderId: order.id });
  await notify(order.householdId, { title: 'Oda imekataliwa', body: `Samahani, ${profile.businessName} hawawezi kutimiza oda hii sasa.`, type: 'order', data: { orderId: order.id } });
  res.json({ ok: true });
});

// ── Restock (middle-mile) ────────────────────────────────────────────────────────
router.get('/restock', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const requests = await prisma.restockRequest.findMany({ where: { supplierId: profile.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ requests });
});

router.post('/restock', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({
    productId:   z.string().optional(),
    distributor: z.string().max(120).optional(),
    qty:         z.number().int().min(1),
    note:        z.string().max(300).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const request = await prisma.restockRequest.create({
    data: { supplierId: profile.id, productId: parse.data.productId ?? null, distributor: parse.data.distributor ?? profile.distributor, qty: parse.data.qty, note: parse.data.note ?? null },
  });
  res.json({ request });
});

// ── GET /api/suppliers/payouts ───────────────────────────────────────────────────
router.get('/payouts', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const payouts = await prisma.payout.findMany({ where: { userId: req.userId, role: 'SUPPLIER' }, orderBy: { createdAt: 'desc' }, take: 50 });
  const pending = payouts.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
  const paid    = payouts.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
  res.json({ payouts, pending, paid });
});

export { router as suppliersRouter };
