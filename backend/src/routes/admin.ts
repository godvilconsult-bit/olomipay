import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';
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
    prisma.order.aggregate({ _sum: { commissionAmount: true }, where: { status: { in: ['DELIVERED', 'COMPLETED'] } } }),
  ]);
  res.json({
    users: { households, suppliers, riders },
    orders: { total: orders, delivered },
    gmv: gmv._sum.total ?? 0,
    platformRevenue: platform._sum.commissionAmount ?? 0,
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

export { router as adminRouter };
