import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { settlementSplit } from '../lib/fees';
import { haversineKm, etaMinutes } from '../lib/geo';
import { notify } from '../services/notify';
import { emitToUser, emitToRiders } from '../socket';

const router = Router();

async function riderRegion(userId: string): Promise<string> {
  const rp = await prisma.riderProfile.findUnique({ where: { userId }, select: { region: true } });
  return rp?.region ?? 'ALL';
}

// ── POST /api/jobs/online | /offline ─────────────────────────────────────────────
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

// ── GET /api/jobs/available ─ open delivery jobs in my region ─────────────────────
router.get('/available', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const region = await riderRegion(req.userId!);
  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;

  const orders = await prisma.order.findMany({
    where:   { status: 'BROADCAST', supplier: { region }, delivery: { status: 'PENDING' } },
    include: { supplier: { select: { businessName: true, lat: true, lng: true, district: true } }, address: true, delivery: true, items: true },
    orderBy: { placedAt: 'asc' },
    take:    30,
  });

  const jobs = orders.map(o => {
    const pickKm = lat != null && lng != null && o.supplier.lat != null && o.supplier.lng != null
      ? haversineKm(lat, lng, o.supplier.lat, o.supplier.lng) : null;
    const tripKm = o.supplier.lat != null && o.supplier.lng != null
      ? haversineKm(o.supplier.lat, o.supplier.lng, o.address.lat, o.address.lng) : null;
    return {
      orderId:     o.id,
      orderNo:     o.orderNo,
      deliveryId:  o.delivery!.id,
      vendor:      o.supplier.businessName,
      pickup:      { lat: o.supplier.lat, lng: o.supplier.lng, district: o.supplier.district },
      drop:        { lat: o.address.lat, lng: o.address.lng, label: o.address.label, ward: o.address.ward, district: o.address.district },
      itemCount:   o.items.reduce((s, i) => s + i.qty, 0),
      payout:      o.deliveryFee,
      toPickupKm:  pickKm != null ? Math.round(pickKm * 10) / 10 : null,
      tripKm:      tripKm != null ? Math.round(tripKm * 10) / 10 : null,
      tripEtaMin:  tripKm != null ? etaMinutes(tripKm) : null,
    };
  });

  res.json({ region, count: jobs.length, jobs });
});

// ── POST /api/jobs/:orderId/claim ─ first rider wins ─────────────────────────────
router.post('/:orderId/claim', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const orderId = req.params.orderId;
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) return res.status(404).json({ error: 'Job not found' });

  // Atomic claim — only succeeds if still unclaimed.
  const claimed = await prisma.delivery.updateMany({
    where: { orderId, status: 'PENDING', riderId: null },
    data:  { riderId: req.userId, status: 'CLAIMED', claimedAt: new Date() },
  });
  if (claimed.count === 0) return res.status(409).json({ error: 'Job already taken' });

  const order = await prisma.order.update({
    where:   { id: orderId },
    data:    { status: 'CLAIMED' },
    include: { supplier: true, delivery: true, address: true },
  });
  await prisma.riderProfile.update({ where: { userId: req.userId }, data: { status: 'ON_JOB' } });

  const rider = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, phone: true, riderProfile: { select: { vehicleType: true, plateNo: true, rating: true } } } });

  // Tell the household + vendor; clear the job from other riders' feeds.
  emitToUser(order.householdId, 'order:claimed', { orderId, rider });
  emitToUser(order.supplier.userId, 'order:claimed', { orderId, rider });
  emitToRiders(order.supplier.region, 'job:taken', { orderId });
  await notify(order.householdId, { title: 'Dereva amepatikana 🏍️', body: `${rider?.name ?? 'Rider'} anakuja kuchukua gesi yako.`, type: 'order', data: { orderId } });

  res.json({ ok: true, order, otp: order.delivery?.otp });
});

// ── POST /api/jobs/:orderId/pick ─ collected from vendor ─────────────────────────
router.post('/:orderId/pick', requireRole('RIDER'), async (req: AuthRequest, res) => {
  const delivery = await prisma.delivery.findUnique({ where: { orderId: req.params.orderId } });
  if (!delivery || delivery.riderId !== req.userId) return res.status(404).json({ error: 'Job not found' });
  if (delivery.status !== 'CLAIMED') return res.status(409).json({ error: 'Job not in a pickable state' });

  await prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'PICKED', pickedAt: new Date() } });
  const order = await prisma.order.update({ where: { id: req.params.orderId }, data: { status: 'PICKED' } });
  emitToUser(order.householdId, 'order:picked', { orderId: order.id });
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

  const split = settlementSplit({ itemsTotal: order.itemsTotal, deliveryFee: order.deliveryFee, commissionAmount: order.commissionAmount });

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), proofPhotoUrl: parse.data.proofPhotoUrl ?? null } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });

    // Cash-on-delivery: mark collected. Mobile-money was settled at checkout.
    if (order.payment && order.payment.status !== 'PAID') {
      await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'PAID', paidAt: new Date(), provider: order.payment.provider ?? 'CASH' } });
    }

    // Three-way payout ledger.
    await tx.payout.createMany({
      data: [
        { userId: order.supplier.userId, orderId: order.id, role: 'SUPPLIER', amount: split.supplierAmount, status: 'PENDING' },
        { userId: req.userId!,           orderId: order.id, role: 'RIDER',    amount: split.riderAmount,    status: 'PENDING' },
      ],
    });

    await tx.riderProfile.update({ where: { userId: req.userId! }, data: { status: 'ONLINE', totalDeliveries: { increment: 1 }, totalEarnings: { increment: split.riderAmount } } });
  });

  emitToUser(order.householdId, 'order:delivered', { orderId: order.id });
  await notify(order.householdId, { title: 'Gesi imefika! ✅', body: `Asante kwa kutumia JIKO CONNECT. Tafadhali mpe dereva nyota.`, type: 'order', data: { orderId: order.id } });

  res.json({ ok: true, earned: split.riderAmount });
});

// ── GET /api/jobs/active ─ rider's current job ───────────────────────────────────
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
    prisma.delivery.findMany({
      where:   { riderId: req.userId, status: 'DELIVERED' },
      include: { order: { select: { orderNo: true, deliveryFee: true, deliveredAt: true } } },
      orderBy: { deliveredAt: 'desc' },
      take:    50,
    }),
  ]);
  res.json({
    totalDeliveries: profile?.totalDeliveries ?? 0,
    totalEarnings:   profile?.totalEarnings ?? 0,
    rating:          profile?.rating ?? 0,
    status:          profile?.status ?? 'OFFLINE',
    history,
  });
});

export { router as jobsRouter };
