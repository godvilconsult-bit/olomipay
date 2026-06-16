import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';
import { postTxn } from '../services/wallet';
import { runDueSubscriptions } from '../services/subscriptions';
import { hashPin } from '../lib/pin';

const router = Router();

// ── GET /api/admin/stats ─ platform overview ─────────────────────────────────────
router.get('/stats', requireAdmin, async (_req: AuthRequest, res) => {
  const [households, suppliers, riders, orders, delivered, gmv, platform] = await Promise.all([
    prisma.user.count({ where: { role: 'HOUSEHOLD' } }),
    prisma.supplierProfile.count(),
    prisma.riderProfile.count(),
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: ['DELIVERED', 'COMPLETED'] } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { status: { in: ['DELIVERED', 'COMPLETED'] } } }),
    prisma.order.aggregate({
      _sum: { platformAmount: true, commissionAmount: true, serviceFee: true, deliveryFee: true },
      where: { status: { in: ['DELIVERED', 'COMPLETED'] } },
    }),
  ]);
  const commission = platform._sum.commissionAmount ?? 0;
  const service    = platform._sum.serviceFee ?? 0;
  // Delivery margin isn't a column; derive it from gross delivery fees.
  const deliveryMargin = Math.round((platform._sum.deliveryFee ?? 0) * Number(process.env.JIKO_DELIVERY_MARGIN_PCT ?? 0.15));
  const platformRevenue = platform._sum.platformAmount ?? (commission + service + deliveryMargin);

  // 7-day order trend + top vendors.
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 6);
  const [recent, grouped] = await Promise.all([
    prisma.order.findMany({ where: { placedAt: { gte: since } }, select: { placedAt: true } }),
    prisma.order.groupBy({ by: ['supplierId'], _count: { _all: true }, where: { status: { in: ['DELIVERED', 'COMPLETED'] } }, orderBy: { _count: { supplierId: 'desc' } }, take: 5 }),
  ]);
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), count: recent.filter(o => o.placedAt >= d && o.placedAt < next).length };
  });
  const supNames = await prisma.supplierProfile.findMany({ where: { id: { in: grouped.map(g => g.supplierId) } }, select: { id: true, businessName: true } });
  const topVendors = grouped.map(g => ({ name: supNames.find(s => s.id === g.supplierId)?.businessName ?? '—', count: g._count._all }));

  res.json({
    users: { households, suppliers, riders },
    orders: { total: orders, delivered },
    gmv: gmv._sum.total ?? 0,
    platformRevenue,
    revenueBreakdown: { commission, serviceFee: service, deliveryMargin },
    trend, topVendors,
  });
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req: AuthRequest, res) => {
  const role = req.query.role as string | undefined;
  const users = await prisma.user.findMany({
    where:   role ? { role: role as any } : {},
    select:  { id: true, phone: true, name: true, role: true, region: true, kycStatus: true, isFrozen: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take:    100,
  });
  res.json({ users });
});

// ── GET /api/admin/orders ─ full service-flow record across all users ────────────
router.get('/orders', requireAdmin, async (req: AuthRequest, res) => {
  const orders = await prisma.order.findMany({
    include: {
      items:    true,
      payment:  { select: { status: true, provider: true } },
      household: { select: { name: true, phone: true } },
      supplier:  { select: { businessName: true, phone: true } },
      delivery:  { include: { rider: { select: { name: true, phone: true } } } },
    },
    orderBy: { placedAt: 'desc' },
    take:    200,
  });
  res.json({ orders });
});

// ── GET /api/admin/kyc ─ pending KYC submissions with selfie + ID images ──────────
router.get('/kyc', requireAdmin, async (_req: AuthRequest, res) => {
  const pending = await prisma.user.findMany({
    where:   { kycStatus: 'SUBMITTED' },
    select:  { id: true, name: true, phone: true, role: true, region: true, kycName: true, kycIdType: true, kycIdNumber: true, kycSelfieUrl: true, kycIdUrl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ pending });
});

// ── POST /api/admin/kyc/:userId ─ approve / reject KYC + verify role profile ──────
router.post('/kyc/:userId', requireAdmin, async (req: AuthRequest, res) => {
  const parse = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });

  const user = await prisma.user.update({ where: { id: req.params.userId }, data: { kycStatus: parse.data.status } });
  const verified = parse.data.status === 'APPROVED';
  if (user.role === 'SUPPLIER') await prisma.supplierProfile.updateMany({ where: { userId: user.id }, data: { isVerified: verified } });
  if (user.role === 'RIDER')    await prisma.riderProfile.updateMany({ where: { userId: user.id }, data: { isVerified: verified } });

  await notify(user.id, {
    title: verified ? 'Akaunti imethibitishwa ✅' : 'Uthibitisho umekataliwa',
    body:  verified ? 'Sasa unaweza kuanza kutumia JIKO CONNECT kikamilifu.' : 'Tafadhali wasilisha tena taarifa zako sahihi.',
    type:  'kyc',
  });
  res.json({ ok: true, user: { id: user.id, kycStatus: user.kycStatus } });
});

router.post('/users/:userId/freeze', requireAdmin, async (req: AuthRequest, res) => {
  const frozen = Boolean(req.body?.frozen ?? true);
  await prisma.user.update({ where: { id: req.params.userId }, data: { isFrozen: frozen } });
  res.json({ ok: true, frozen });
});

// ── DELETE /api/admin/users/:userId ─ remove a user + all their data ──────────────
router.delete('/users/:userId', requireAdmin, async (req: AuthRequest, res) => {
  const id = req.params.userId;
  const u = await prisma.user.findUnique({ where: { id }, include: { supplierProfile: true, riderProfile: true } });
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.isAdmin) return res.status(400).json({ error: 'Cannot delete an admin' });
  const supplierId = u.supplierProfile?.id;

  await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { OR: [{ householdId: id }, ...(supplierId ? [{ supplierId }] : [])] }, select: { id: true } });
    const oids = orders.map((o) => o.id);
    // Deliveries this rider made on OTHER people's orders → just unlink the rider.
    await tx.delivery.updateMany({ where: { riderId: id, orderId: { notIn: oids } }, data: { riderId: null } });
    await tx.payout.deleteMany({ where: { OR: [{ userId: id }, { orderId: { in: oids } }] } });
    await tx.review.deleteMany({ where: { authorId: id } });
    await tx.order.deleteMany({ where: { id: { in: oids } } }); // cascades items/payment/delivery/review
    await tx.user.delete({ where: { id } });                    // cascades addresses/notifications/push/tokens/profiles→inventory
  });
  res.json({ ok: true });
});

// ── Products catalog ─────────────────────────────────────────────────────────────
router.get('/products', requireAdmin, async (_req: AuthRequest, res) => {
  const products = await prisma.product.findMany({ orderBy: [{ brand: 'asc' }, { sizeKg: 'asc' }] });
  res.json({ products });
});

router.post('/products', requireAdmin, async (req: AuthRequest, res) => {
  const parse = z.object({
    brand:    z.string().max(60),
    name:     z.string().max(80),
    type:     z.enum(['REFILL', 'CYLINDER', 'ACCESSORY']).default('REFILL'),
    sizeKg:   z.number().optional(),
    imageUrl: z.string().url().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { brand, name, type, sizeKg, imageUrl } = parse.data;
  const product = await prisma.product.create({ data: { brand, name, type, sizeKg, imageUrl } });
  res.status(201).json({ product });
});

// ── EWURA price caps ─────────────────────────────────────────────────────────────
router.get('/price-caps', requireAdmin, async (_req: AuthRequest, res) => {
  const caps = await prisma.priceCap.findMany({ orderBy: { region: 'asc' } });
  res.json({ caps });
});

router.post('/price-caps', requireAdmin, async (req: AuthRequest, res) => {
  const parse = z.object({ region: z.string().max(60), productId: z.string().optional(), maxPrice: z.number().min(0) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { region, productId, maxPrice } = parse.data;
  const cap = await prisma.priceCap.upsert({
    where:  { region_productId: { region, productId: productId ?? null as any } },
    update: { maxPrice },
    create: { region, productId: productId ?? null, maxPrice },
  });
  res.json({ cap });
});

// ── POST /api/admin/suppliers/:id/tier ─ set plan + featured slot (Phase 2) ───────
router.post('/suppliers/:id/tier', requireAdmin, async (req: AuthRequest, res) => {
  const parse = z.object({
    tier:     z.enum(['FREE', 'STANDARD', 'PREMIUM']).optional(),
    featured: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const profile = await prisma.supplierProfile.update({
    where: { id: req.params.id },
    data:  { ...(parse.data.tier && { tier: parse.data.tier }), ...(parse.data.featured !== undefined && { featured: parse.data.featured }) },
  }).catch(() => null);
  if (!profile) return res.status(404).json({ error: 'Supplier not found' });
  await notify(profile.userId, {
    title: parse.data.featured ? 'You are now Featured ⭐' : `Plan updated: ${profile.tier}`,
    body:  parse.data.featured ? 'Your shop now appears at the top of nearby search.' : `Your JIKO CONNECT plan is now ${profile.tier}.`,
    type:  'account',
  }).catch(() => {});
  res.json({ profile });
});

// ── GET /api/admin/suppliers ─ list suppliers with tier/featured for management ───
router.get('/suppliers', requireAdmin, async (_req: AuthRequest, res) => {
  const suppliers = await prisma.supplierProfile.findMany({
    select:  { id: true, businessName: true, region: true, tier: true, featured: true, isVerified: true, rating: true, _count: { select: { orders: true } } },
    orderBy: [{ featured: 'desc' }, { businessName: 'asc' }],
    take:    200,
  });
  res.json({ suppliers });
});

// ── Brand ads (Phase 3) ───────────────────────────────────────────────────────────
router.get('/ads', requireAdmin, async (_req: AuthRequest, res) => {
  const ads = await prisma.brandAd.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ ads });
});

const ANIMATIONS = ['none', 'pulse', 'shine', 'slide', 'float', 'zoom'] as const;
const adBody = z.object({
  brand:     z.string().min(1).max(60),
  title:     z.string().min(1).max(120),
  subtitle:  z.string().max(200).optional(),
  imageUrl:  z.string().max(3_000_000).optional(),
  ctaLabel:  z.string().max(40).optional(),
  linkUrl:   z.string().max(2000).optional(),
  bgColor:   z.string().max(20).optional(),
  animation: z.enum(ANIMATIONS).default('none'),
  region:    z.string().max(60).optional(),
  type:      z.enum(['REFILL', 'CYLINDER', 'ACCESSORY']).optional(),
  weight:    z.number().int().min(1).max(100).default(1),
  isActive:  z.boolean().default(true),
});

router.post('/ads', requireAdmin, async (req: AuthRequest, res) => {
  const parse = adBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data;
  // Empty strings → null so optional columns stay clean.
  const ad = await prisma.brandAd.create({
    data: {
      brand: d.brand, title: d.title, subtitle: d.subtitle || null, imageUrl: d.imageUrl || null,
      ctaLabel: d.ctaLabel || null, linkUrl: d.linkUrl || null, bgColor: d.bgColor || null,
      animation: d.animation, region: d.region || null, type: d.type, weight: d.weight, isActive: d.isActive,
    },
  });
  res.status(201).json({ ad });
});

router.patch('/ads/:id', requireAdmin, async (req: AuthRequest, res) => {
  // Full editor: any subset of fields.
  const parse = adBody.partial().safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data;
  const data: any = {};
  for (const k of ['brand', 'title', 'animation', 'weight', 'isActive', 'type'] as const) if (d[k] !== undefined) data[k] = d[k];
  for (const k of ['subtitle', 'imageUrl', 'ctaLabel', 'linkUrl', 'bgColor', 'region'] as const) if (d[k] !== undefined) data[k] = (d[k] as string) || null;
  const ad = await prisma.brandAd.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!ad) return res.status(404).json({ error: 'Ad not found' });
  res.json({ ad });
});

router.delete('/ads/:id', requireAdmin, async (req: AuthRequest, res) => {
  await prisma.brandAd.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Cash-out disbursements (T1) ───────────────────────────────────────────────────
router.get('/cashouts', requireAdmin, async (_req: AuthRequest, res) => {
  const requests = await prisma.cashoutRequest.findMany({
    where:   { status: 'PENDING' },
    include: { user: { select: { name: true, phone: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ requests });
});

router.post('/cashouts/:id/paid', requireAdmin, async (req: AuthRequest, res) => {
  const cr = await prisma.cashoutRequest.findUnique({ where: { id: req.params.id } });
  if (!cr || cr.status !== 'PENDING') return res.status(404).json({ error: 'Request not found or already handled' });
  // Funds were already debited from the wallet at request time — just record the payout.
  await prisma.cashoutRequest.update({ where: { id: cr.id }, data: { status: 'PAID', paidAt: new Date(), providerRef: req.body?.ref ?? null } });
  await notify(cr.userId, { title: 'Cash-out paid ✅', body: `TZS ${cr.amount.toLocaleString()} has been sent to your mobile wallet.`, type: 'payout' });
  res.json({ ok: true });
});

router.post('/cashouts/:id/reject', requireAdmin, async (req: AuthRequest, res) => {
  const cr = await prisma.cashoutRequest.findUnique({ where: { id: req.params.id } });
  if (!cr || cr.status !== 'PENDING') return res.status(404).json({ error: 'Request not found or already handled' });
  // Return the reserved funds to the user's wallet.
  await postTxn(cr.userId, 'ADJUSTMENT', cr.amount, { note: 'Cash-out rejected — refunded' });
  await prisma.cashoutRequest.update({ where: { id: cr.id }, data: { status: 'FAILED' } });
  await notify(cr.userId, { title: 'Cash-out declined', body: `Your TZS ${cr.amount.toLocaleString()} request was declined and returned to your balance.`, type: 'payout' });
  res.json({ ok: true });
});

// ── Disputes (Tier 2) ─────────────────────────────────────────────────────────────
router.get('/disputes', requireAdmin, async (_req: AuthRequest, res) => {
  const disputes = await prisma.dispute.findMany({
    where:   { status: 'OPEN' },
    include: { order: { select: { orderNo: true, household: { select: { name: true, phone: true } }, supplier: { select: { businessName: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ disputes });
});

router.post('/disputes/:id/resolve', requireAdmin, async (req: AuthRequest, res) => {
  const parse = z.object({ status: z.enum(['RESOLVED', 'REJECTED']), resolution: z.string().max(500).optional() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'status must be RESOLVED or REJECTED' });
  const d = await prisma.dispute.update({ where: { id: req.params.id }, data: { status: parse.data.status, resolution: parse.data.resolution ?? null, resolvedAt: new Date() } }).catch(() => null);
  if (!d) return res.status(404).json({ error: 'Dispute not found' });
  await notify(d.raisedById, {
    title: parse.data.status === 'RESOLVED' ? 'Issue resolved ✅' : 'Issue reviewed',
    body:  parse.data.resolution ?? 'Our team has reviewed your report.',
    type:  'dispute',
  }).catch(() => {});
  res.json({ ok: true });
});

// ── POST /api/admin/run-subscriptions ─ fire due auto-refills now (ops/testing) ──
router.post('/run-subscriptions', requireAdmin, async (_req: AuthRequest, res) => {
  const placed = await runDueSubscriptions();
  res.json({ ok: true, placed });
});

// ── POST /api/admin/seed-demo ─ KYC-approved demo supplier + rider + household ────
router.post('/seed-demo', requireAdmin, async (_req: AuthRequest, res) => {
  const pin = hashPin('1234');

  // Supplier (verified, open, located)
  const sup = await prisma.user.upsert({
    where:  { phone: '+255788000001' },
    update: {},
    create: { phone: '+255788000001', pinHash: pin, role: 'SUPPLIER', name: 'Demo Gas Centre', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      supplierProfile: { create: { businessName: 'Demo Gas Centre', phone: '+255788000001', region: 'Dar es Salaam', district: 'Kinondoni', lat: -6.7725, lng: 39.2400, isOpen: true, isVerified: true } } },
  });
  await prisma.supplierProfile.updateMany({ where: { userId: sup.id }, data: { isVerified: true, isOpen: true, lat: -6.7725, lng: 39.2400, region: 'Dar es Salaam' } });
  const sp = await prisma.supplierProfile.findUnique({ where: { userId: sup.id } });
  if (sp) {
    const prods = await prisma.product.findMany({ where: { type: 'REFILL', sizeKg: { in: [6, 15] } }, take: 4 });
    for (const p of prods) {
      await prisma.inventory.upsert({
        where:  { supplierId_productId: { supplierId: sp.id, productId: p.id } },
        update: { stock: 15, isAvailable: true },
        create: { supplierId: sp.id, productId: p.id, price: p.sizeKg === 6 ? 22000 : 48000, stock: 15, isAvailable: true },
      });
    }
  }

  // Rider (verified, online, near the shop)
  const rid = await prisma.user.upsert({
    where:  { phone: '+255788000002' },
    update: {},
    create: { phone: '+255788000002', pinHash: pin, role: 'RIDER', name: 'Demo Rider', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      riderProfile: { create: { region: 'Dar es Salaam', vehicleType: 'MOTORBIKE', plateNo: 'MC 555 DEMO', isVerified: true, status: 'ONLINE', currentLat: -6.7740, currentLng: 39.2410 } } },
  });
  await prisma.riderProfile.updateMany({ where: { userId: rid.id }, data: { isVerified: true, status: 'ONLINE', currentLat: -6.7740, currentLng: 39.2410, region: 'Dar es Salaam' } });

  // Household (with default address)
  await prisma.user.upsert({
    where:  { phone: '+255788000003' },
    update: {},
    create: { phone: '+255788000003', pinHash: pin, role: 'HOUSEHOLD', name: 'Demo Household', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      addresses: { create: { label: 'Home', lat: -6.7900, lng: 39.2280, ward: 'Mikocheni', district: 'Kinondoni', region: 'Dar es Salaam', isDefault: true } } },
  });

  res.json({ ok: true, logins: { supplier: '0788000001', rider: '0788000002', household: '0788000003', pin: '1234' } });
});

// ── GET /api/admin/security ─ account safety: lockouts, failed logins, SOS ────────
router.get('/security', requireAdmin, async (_req: AuthRequest, res) => {
  const now = new Date();
  const [risky, sos, openDisputes] = await Promise.all([
    // Locked or repeatedly-failing accounts.
    prisma.user.findMany({
      where:   { OR: [{ lockedUntil: { not: null } }, { failedLoginCount: { gt: 0 } }] },
      select:  { id: true, name: true, phone: true, role: true, region: true, failedLoginCount: true, lockedUntil: true, lastSeenAt: true },
      orderBy: { failedLoginCount: 'desc' },
      take:    100,
    }),
    // Recent SOS alerts (stored as type:'sos' notifications to admins).
    prisma.notification.findMany({ where: { type: 'sos' }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, body: true, data: true, createdAt: true } }),
    prisma.dispute.count({ where: { status: 'OPEN' } }),
  ]);
  const locked = risky.map(u => ({ ...u, isLocked: !!(u.lockedUntil && u.lockedUntil > now) }));
  res.json({ locked, sos, openDisputes });
});

// ── POST /api/admin/users/:id/unlock ─ clear lock + failed-attempt counter ────────
router.post('/users/:id/unlock', requireAdmin, async (req: AuthRequest, res) => {
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { lockedUntil: null, failedLoginCount: 0 } }).catch(() => null);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

export { router as adminRouter };
