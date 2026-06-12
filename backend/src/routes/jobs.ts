import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { settlementSplit } from '../lib/fees';
import { haversineKm, etaMinutes } from '../lib/geo';
import { notify } from '../services/notify';
import { emitToUser } from '../socket';

const router = Router();

// ── POST /api/jobs/online | /offline (+ optional photo/plate via profile) ─────────
router.post('/online', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const { lat, lng } = req.body ?? {};
  await prisma.riderProfile.update({
    where: { userId: req.userId },
    data:  { status: 'ONLINE', ...(typeof lat === 'number' && typeof lng === 'number' ? { currentLat: lat, currentLng: lng } : {}) },
  });
  res.json({ ok: true, status: 'ONLINE' });
});

router.post('/offline', requireRole('RIDER'), async (req: AuthRequest, res) => {
  await prisma.riderProfile.update({ where: { userId: req.userId }, data: { status: 'OFFLINE' } });
  res.json({ ok: true, status: 'OFFLINE' });
});

// ── PUT /api/jobs/profile ─ rider photo / plate / vehicle ─────────────────────────
router.put('/profile', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const parse = z.object({
    photoUrl:    z.string().max(500_000).optional(), // data URL or hosted URL
    plateNo:     z.string().max(20).optional(),
    vehicleType: z.enum(['MOTORBIKE', 'BAJAJI', 'CAR', 'TRUCK', 'BICYCLE']).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  if (parse.data.photoUrl !== undefined) await prisma.user.update({ where: { id: req.userId }, data: { profilePicUrl: parse.data.photoUrl } });
  if (parse.data.plateNo !== undefined || parse.data.vehicleType !== undefined) {
    await prisma.riderProfile.update({ where: { userId: req.userId }, data: { ...(parse.data.plateNo !== undefined && { plateNo: parse.data.plateNo }), ...(parse.data.vehicleType && { vehicleType: parse.data.vehicleType as any }) } });
  }
  res.json({ ok: true });
});

// ── GET /api/jobs/offers ─ pickup offers directed to me by suppliers ──────────────
router.get('/offers', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const offers = await prisma.delivery.findMany({
    where:   { riderId: req.userId, status: 'PENDING', order: { status: 'RIDER_OFFERED' } },
    include: { order: { include: { supplier: { select: { businessName: true, phone: true, lat: true, lng: true, district: true } }, address: true, items: true } } },
    orderBy: { id: 'desc' },
  });
  const list = offers.filter(o => o.order).map(o => {
    const tripKm = o.order!.supplier.lat != null && o.order!.supplier.lng != null
      ? haversineKm(o.order!.supplier.lat, o.order!.supplier.lng, o.order!.address.lat, o.order!.address.lng) : null;
    return {
      orderId: o.orderId, orderNo: o.order!.orderNo, vendor: o.order!.supplier.businessName,
      pickup: { lat: o.order!.supplier.lat, lng: o.order!.supplier.lng, district: o.order!.supplier.district },
      drop:   { lat: o.order!.address.lat, lng: o.order!.address.lng, label: o.order!.address.label, ward: o.order!.address.ward },
      itemCount: o.order!.items.reduce((s, i) => s + i.qty, 0),
      fee: o.order!.riderNet || o.order!.deliveryFee, tripKm: tripKm != null ? Math.round(tripKm * 10) / 10 : null,
      tripEtaMin: tripKm != null ? etaMinutes(tripKm) : null,
    };
  });
  res.json({ count: list.length, offers: list });
});

// ── POST /api/jobs/:orderId/accept-offer ─ rider accepts → fee proposed to home ───
router.post('/:orderId/accept-offer', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const delivery = await prisma.delivery.findUnique({ where: { orderId: req.params.orderId } });
  if (!delivery || delivery.riderId !== req.userId) return res.status(404).json({ error: 'Offer not found' });
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { supplier: true } });
  if (!order || order.status !== 'RIDER_OFFERED') return res.status(409).json({ error: 'Offer no longer valid' });

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'CLAIMED', claimedAt: new Date() } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'RIDER_ACCEPTED' } });
    await tx.riderProfile.update({ where: { userId: req.userId! }, data: { status: 'ON_JOB' } });
  });

  emitToUser(order.householdId, 'order:fee', { orderId: order.id, fee: order.deliveryFee });
  emitToUser(order.supplier.userId, 'order:rider-accepted', { orderId: order.id });
  await notify(order.householdId, { title: 'Confirm the rider fee', body: `Rider fee is TZS ${order.deliveryFee.toLocaleString()}. Confirm to start delivery.`, type: 'order', data: { orderId: order.id } });
  await notify(order.supplier.userId, { title: 'Rider accepted 🏍️', body: `${order.orderNo}: a rider accepted. Waiting for the household to confirm the fee.`, type: 'order', data: { orderId: order.id } });
  res.json({ ok: true, fee: order.riderNet || order.deliveryFee });
});

// ── POST /api/jobs/:orderId/decline-offer ─ release back to the supplier ──────────
router.post('/:orderId/decline-offer', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const delivery = await prisma.delivery.findUnique({ where: { orderId: req.params.orderId } });
  if (!delivery || delivery.riderId !== req.userId) return res.status(404).json({ error: 'Offer not found' });
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { supplier: true } });
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: delivery.id }, data: { riderId: null, status: 'PENDING' } });
    if (order) await tx.order.update({ where: { id: order.id }, data: { status: 'ACCEPTED' } });
  });
  if (order) emitToUser(order.supplier.userId, 'rider:declined', { orderId: order.id });
  res.json({ ok: true });
});

// ── POST /api/jobs/:orderId/pick ─ collected (only after household confirmed fee) ──
router.post('/:orderId/pick', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const delivery = await prisma.delivery.findUnique({ where: { orderId: req.params.orderId }, include: { order: true } });
  if (!delivery || delivery.riderId !== req.userId) return res.status(404).json({ error: 'Job not found' });
  if (delivery.order.status !== 'FEE_CONFIRMED') return res.status(409).json({ error: 'Waiting for the household to confirm the fee' });
  await prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'PICKED', pickedAt: new Date() } });
  const order = await prisma.order.update({ where: { id: req.params.orderId }, data: { status: 'PICKED' } });
  emitToUser(order.householdId, 'order:picked', { orderId: order.id });
  await notify(order.householdId, { title: 'Rider has your gas 🏍️', body: `${order.orderNo}: the rider picked up your order and is on the way.`, type: 'order', data: { orderId: order.id } });
  const sup = await prisma.supplierProfile.findUnique({ where: { id: order.supplierId }, select: { userId: true } });
  if (sup) await notify(sup.userId, { title: 'Rider collected the order', body: `${order.orderNo}: rider picked up and is heading to the household.`, type: 'order', data: { orderId: order.id } });
  res.json({ ok: true });
});

// ── POST /api/jobs/:orderId/deliver ─ OTP + proof, then settle ────────────────────
router.post('/:orderId/deliver', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const parse = z.object({ otp: z.string().min(3).max(6), proofPhotoUrl: z.string().url().optional() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'OTP is required' });

  const delivery = await prisma.delivery.findUnique({ where: { orderId: req.params.orderId } });
  if (!delivery || delivery.riderId !== req.userId) return res.status(404).json({ error: 'Job not found' });
  if (delivery.status !== 'PICKED') return res.status(409).json({ error: 'Collect the order before delivering' });
  if (delivery.otp && parse.data.otp !== delivery.otp) return res.status(400).json({ error: 'Wrong delivery code' });

  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { supplier: true, payment: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const split = settlementSplit({ itemsTotal: order.itemsTotal, deliveryFee: order.deliveryFee, serviceFee: order.serviceFee, commissionAmount: order.commissionAmount });

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), proofPhotoUrl: parse.data.proofPhotoUrl ?? null } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    if (order.payment && order.payment.status !== 'PAID') await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'PAID', paidAt: new Date(), provider: order.payment.provider ?? 'CASH' } });
    await tx.payout.createMany({ data: [
      { userId: order.supplier.userId, orderId: order.id, role: 'SUPPLIER', amount: split.supplierAmount, status: 'PENDING' },
      { userId: req.userId!,           orderId: order.id, role: 'RIDER',    amount: split.riderAmount,    status: 'PENDING' },
    ] });
    await tx.riderProfile.update({ where: { userId: req.userId! }, data: { status: 'ONLINE', totalDeliveries: { increment: 1 }, totalEarnings: { increment: split.riderAmount } } });
  });

  emitToUser(order.householdId, 'order:delivered', { orderId: order.id });
  await notify(order.householdId, { title: 'Gas delivered ✅', body: `Thanks for using JIKO CONNECT. Please rate your rider.`, type: 'order', data: { orderId: order.id } });
  await notify(order.supplier.userId, { title: 'Order delivered ✅', body: `${order.orderNo} was delivered. Your payout of TZS ${split.supplierAmount.toLocaleString()} is pending.`, type: 'payment', data: { orderId: order.id } });
  await notify(req.userId!, { title: 'Delivery complete 🎉', body: `You earned TZS ${split.riderAmount.toLocaleString()} for ${order.orderNo}.`, type: 'payment', data: { orderId: order.id } });
  res.json({ ok: true, earned: split.riderAmount });
});

// ── GET /api/jobs/active ─ rider's current job (destination + household phone) ─────
router.get('/active', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const delivery = await prisma.delivery.findFirst({
    where:   { riderId: req.userId, status: { in: ['CLAIMED', 'PICKED'] } },
    include: { order: { include: { supplier: { select: { businessName: true, phone: true, lat: true, lng: true } }, address: true, items: true, household: { select: { name: true, phone: true } } } } },
  });
  res.json({ delivery });
});

// ── GET /api/jobs/earnings ───────────────────────────────────────────────────────
router.get('/earnings', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const [profile, history] = await Promise.all([
    prisma.riderProfile.findUnique({ where: { userId: req.userId } }),
    prisma.delivery.findMany({ where: { riderId: req.userId, status: 'DELIVERED' }, include: { order: { select: { orderNo: true, deliveryFee: true, riderNet: true, deliveredAt: true } } }, orderBy: { deliveredAt: 'desc' }, take: 50 }),
  ]);
  res.json({ totalDeliveries: profile?.totalDeliveries ?? 0, totalEarnings: profile?.totalEarnings ?? 0, rating: profile?.rating ?? 0, status: profile?.status ?? 'OFFLINE', history });
});

export { router as jobsRouter };
