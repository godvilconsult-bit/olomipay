import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { makeOtp } from '../lib/ids';
import { haversineKm, etaMinutes } from '../lib/geo';
import { notify } from '../services/notify';
import { refundPayment } from '../services/payments';
import { sendSms } from '../services/sms';
import { emitToUser } from '../socket';

const router = Router();

async function myProfile(userId: string) {
  return prisma.supplierProfile.findUnique({ where: { userId } });
}

// ── GET /api/suppliers/me ─ profile + headline stats ─────────────────────────────
router.get('/me', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'Supplier profile not found' });
  const [pending, today, lowStock] = await Promise.all([
    prisma.order.count({ where: { supplierId: profile.id, status: { in: ['ALERTED', 'ACCEPTED', 'RIDER_OFFERED', 'RIDER_ACCEPTED', 'FEE_CONFIRMED', 'PICKED'] } } }),
    prisma.order.count({ where: { supplierId: profile.id, placedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.inventory.count({ where: { supplierId: profile.id, stock: { lte: 3 } } }),
  ]);
  res.json({ profile, stats: { pending, today, lowStock } });
});

// ── PUT /api/suppliers/me ─ profile / open-close / location / payment methods ─────
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
    acceptsCash:  z.boolean().optional(),
    acceptsMobile: z.boolean().optional(),
    distributor:  z.string().max(120).optional(),
    openHour:     z.number().int().min(0).max(23).nullable().optional(),
    closeHour:    z.number().int().min(0).max(23).nullable().optional(),
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
  const parse = z.object({ productId: z.string(), price: z.number().min(0), stock: z.number().int().min(0), isAvailable: z.boolean().default(true) }).safeParse(req.body);
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
  // EWURA price-cap check: warn if priced above the regional cap (product-specific
  // cap wins over a region-wide one).
  const cap = await prisma.priceCap.findFirst({
    where: { region: profile.region, OR: [{ productId }, { productId: null }] },
    orderBy: { productId: 'desc' },
  });
  const capWarning = cap && price > cap.maxPrice
    ? `Price exceeds the EWURA cap of TZS ${cap.maxPrice.toLocaleString()} for ${profile.region}.`
    : null;
  res.json({ inventory: inv, ...(capWarning && { capWarning }) });
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
    include: { items: true, address: true, payment: true, delivery: { include: { rider: { select: { name: true, phone: true, profilePicUrl: true, riderProfile: { select: { plateNo: true, vehicleType: true } } } } } }, household: { select: { name: true, phone: true } } },
    orderBy: { placedAt: 'desc' },
    take:    50,
  });
  res.json({ orders });
});

// ── GET /api/suppliers/riders/nearby ─ online riders near the shop ────────────────
router.get('/riders/nearby', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const riders = await prisma.riderProfile.findMany({
    where:   { status: 'ONLINE', region: profile.region },
    include: { user: { select: { id: true, name: true, phone: true, profilePicUrl: true } } },
  });
  const list = riders.map(r => {
    const km = profile.lat != null && profile.lng != null && r.currentLat != null && r.currentLng != null
      ? haversineKm(profile.lat, profile.lng, r.currentLat, r.currentLng) : null;
    return {
      riderId: r.userId, name: r.user.name, phone: r.user.phone, photoUrl: r.user.profilePicUrl, isVerified: r.isVerified,
      plateNo: r.plateNo, vehicleType: r.vehicleType, rating: r.rating, totalDeliveries: r.totalDeliveries,
      lat: r.currentLat, lng: r.currentLng, distanceKm: km != null ? Math.round(km * 10) / 10 : null,
    };
  }).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  res.json({ shop: { lat: profile.lat, lng: profile.lng }, count: list.length, riders: list });
});

// ── POST /api/suppliers/:id/accept ─ confirm order (stock available + paid) ───────
router.post('/:id/accept', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const order = await prisma.order.findFirst({ where: { id: req.params.id, supplierId: profile.id }, include: { payment: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PLACED', 'ALERTED'].includes(order.status)) return res.status(409).json({ error: 'Order already handled' });
  const payOk = order.payment?.status === 'PAID' || order.payment?.provider === 'CASH';
  if (!payOk) return res.status(409).json({ error: 'Payment not received yet' });

  await prisma.order.update({ where: { id: order.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
  emitToUser(order.householdId, 'order:confirmed', { orderId: order.id });
  await notify(order.householdId, { title: 'Order confirmed ✅', body: `${profile.businessName} confirmed your order and is finding a rider.`, type: 'order', data: { orderId: order.id } });
  res.json({ ok: true });
});

// ── POST /api/suppliers/:orderId/assign-rider ─ offer the job to a chosen rider ────
router.post('/:orderId/assign-rider', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({ riderId: z.string() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'riderId required' });
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const order = await prisma.order.findFirst({ where: { id: req.params.orderId, supplierId: profile.id }, include: { address: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['ACCEPTED', 'RIDER_OFFERED'].includes(order.status)) return res.status(409).json({ error: 'Confirm the order first' });

  const otp = makeOtp();
  await prisma.$transaction(async (tx) => {
    await tx.delivery.upsert({
      where:  { orderId: order.id },
      update: { riderId: parse.data.riderId, status: 'PENDING', otp, riderFee: order.riderNet || order.deliveryFee, pickupLat: profile.lat, pickupLng: profile.lng, dropLat: order.address.lat, dropLng: order.address.lng },
      create: { orderId: order.id, riderId: parse.data.riderId, status: 'PENDING', otp, riderFee: order.riderNet || order.deliveryFee, pickupLat: profile.lat, pickupLng: profile.lng, dropLat: order.address.lat, dropLng: order.address.lng },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: 'RIDER_OFFERED' } });
  });
  emitToUser(parse.data.riderId, 'job:offered', { orderId: order.id, vendor: profile.businessName });
  await notify(parse.data.riderId, { title: 'New pickup offer 🏍️', body: `${profile.businessName} → ${order.address.label}`, type: 'order', data: { orderId: order.id } });
  // SMS the rider too — they may not have the app open / push set up yet.
  const rider = await prisma.user.findUnique({ where: { id: parse.data.riderId }, select: { phone: true } });
  if (rider) sendSms(rider.phone, `JIKO: New delivery from ${profile.businessName} to ${order.address.label}. Open the app to accept.`).catch(() => {});
  res.json({ ok: true });
});

// ── POST /api/suppliers/:id/reject ───────────────────────────────────────────────
router.post('/:id/reject', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const order = await prisma.order.findFirst({ where: { id: req.params.id, supplierId: profile.id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PLACED', 'ALERTED', 'ACCEPTED'].includes(order.status)) return res.status(409).json({ error: 'Order already handled' });
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: req.body?.reason ?? 'Declined by vendor' } });
    for (const it of order.items) await tx.inventory.updateMany({ where: { supplierId: profile.id, productId: it.productId }, data: { stock: { increment: it.qty } } });
  });
  emitToUser(order.householdId, 'order:rejected', { orderId: order.id });
  await notify(order.householdId, { title: 'Order declined', body: `Sorry, ${profile.businessName} can't fulfil this order now.`, type: 'order', data: { orderId: order.id } });
  const refunded = await refundPayment(order.id);
  if (refunded) await notify(order.householdId, { title: 'Refund initiated 💸', body: `TZS ${refunded.toLocaleString()} for ${order.orderNo} is being returned to your mobile money.`, type: 'payment', data: { orderId: order.id } });
  res.json({ ok: true, refunded });
});

// ── Restock (middle-mile) ────────────────────────────────────────────────────────
router.get('/restock', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const requests = await prisma.restockRequest.findMany({ where: { supplierId: profile.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ requests });
});

router.post('/restock', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({ productId: z.string().optional(), distributor: z.string().max(120).optional(), qty: z.number().int().min(1), note: z.string().max(300).optional() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const request = await prisma.restockRequest.create({ data: { supplierId: profile.id, productId: parse.data.productId ?? null, distributor: parse.data.distributor ?? profile.distributor, qty: parse.data.qty, note: parse.data.note ?? null } });
  res.json({ request });
});

// ── GET /api/suppliers/payouts ───────────────────────────────────────────────────
router.get('/payouts', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const payouts = await prisma.payout.findMany({ where: { userId: req.userId, role: 'SUPPLIER' }, orderBy: { createdAt: 'desc' }, take: 50 });
  const pending = payouts.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
  const paid    = payouts.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
  res.json({ payouts, pending, paid });
});

// ── GET /api/suppliers/analytics ─ sales today/week + top products (Tier 4) ──────
router.get('/analytics', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 864e5);
  const settled = { in: ['DELIVERED', 'COMPLETED'] as any };
  const [today, week, topProducts, wallet] = await Promise.all([
    prisma.order.aggregate({ _sum: { itemsTotal: true, commissionAmount: true }, _count: true, where: { supplierId: profile.id, status: settled, deliveredAt: { gte: dayStart } } }),
    prisma.order.aggregate({ _sum: { itemsTotal: true, commissionAmount: true }, _count: true, where: { supplierId: profile.id, status: settled, deliveredAt: { gte: weekStart } } }),
    prisma.orderItem.groupBy({ by: ['productName'], _sum: { qty: true }, where: { order: { supplierId: profile.id } }, orderBy: { _sum: { qty: 'desc' } }, take: 5 }),
    prisma.wallet.findUnique({ where: { userId: req.userId } }),
  ]);
  const net = (a: typeof today) => (a._sum.itemsTotal ?? 0) - (a._sum.commissionAmount ?? 0);
  res.json({
    today: { sales: today._sum.itemsTotal ?? 0, net: net(today), orders: today._count },
    week:  { sales: week._sum.itemsTotal ?? 0,  net: net(week),  orders: week._count },
    topProducts: topProducts.map(p => ({ name: p.productName, qty: p._sum.qty ?? 0 })),
    walletBalance: wallet?.balance ?? 0,
  });
});

// ── POST /api/suppliers/upgrade-request ─ ask to move to a paid plan (Phase 2) ────
router.post('/upgrade-request', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({ tier: z.enum(['STANDARD', 'PREMIUM']) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'tier must be STANDARD or PREMIUM' });
  const profile = await myProfile(req.userId!);
  if (!profile) return res.status(404).json({ error: 'No supplier profile' });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map(a => notify(a.id, {
    title: 'Plan upgrade request 💼',
    body:  `${profile.businessName} (${profile.region}) wants the ${parse.data.tier} plan.`,
    type:  'account', data: { supplierId: profile.id, tier: parse.data.tier },
  })));
  res.json({ ok: true });
});

export { router as suppliersRouter };
