/**
 * Distributors (B2B upstream). Gas shops restock wholesale from regional
 * distributors through the app:
 *   shop places a RestockOrder → distributor ACCEPT → DISPATCH → shop RECEIVED.
 * On RECEIVED the shop's retail Inventory is topped up automatically, closing the
 * upstream supply gap so households can keep ordering.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';

const router = Router();

function restockNo(): string {
  return `RS-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
}
const distFor = (userId?: string) => prisma.distributorProfile.findUnique({ where: { userId: userId! } });
const shopFor = (userId?: string) => prisma.supplierProfile.findUnique({ where: { userId: userId! } });

// ── Distributor: own profile + wholesale catalog ─────────────────────────────────
router.get('/me', requireRole('DISTRIBUTOR'), async (req: AuthRequest, res) => {
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  const stock = await prisma.distributorStock.findMany({ where: { distributorId: d.id }, include: { product: true }, orderBy: { id: 'desc' } });
  res.json({ profile: d, stock });
});

router.put('/me', requireRole('DISTRIBUTOR'), async (req: AuthRequest, res) => {
  const parse = z.object({
    businessName: z.string().min(1).max(120).optional(),
    phone:    z.string().max(20).optional(),
    region:   z.string().max(60).optional(),
    district: z.string().max(60).optional(),
    brands:   z.string().max(200).optional(),
    lat:      z.number().optional(),
    lng:      z.number().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  const profile = await prisma.distributorProfile.update({ where: { id: d.id }, data: parse.data });
  res.json({ profile });
});

// Upsert a wholesale stock line.
router.post('/me/stock', requireRole('DISTRIBUTOR'), async (req: AuthRequest, res) => {
  const parse = z.object({
    productId:   z.string().min(1),
    price:       z.number().int().min(0),
    stock:       z.number().int().min(0).default(0),
    isAvailable: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  const { productId, price, stock, isAvailable } = parse.data;
  const row = await prisma.distributorStock.upsert({
    where:  { distributorId_productId: { distributorId: d.id, productId } },
    update: { price, stock, isAvailable },
    create: { distributorId: d.id, productId, price, stock, isAvailable },
  });
  res.json({ stock: row });
});

router.delete('/me/stock/:productId', requireRole('DISTRIBUTOR'), async (req: AuthRequest, res) => {
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  await prisma.distributorStock.deleteMany({ where: { distributorId: d.id, productId: req.params.productId } });
  res.json({ ok: true });
});

// Incoming restock orders for this distributor.
router.get('/me/orders', requireRole('DISTRIBUTOR'), async (req: AuthRequest, res) => {
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  const orders = await prisma.restockOrder.findMany({
    where:   { distributorId: d.id },
    include: { items: true, supplier: { select: { businessName: true, phone: true, region: true, district: true } } },
    orderBy: { createdAt: 'desc' },
    take:    100,
  });
  res.json({ orders });
});

// Distributor moves an order along its lifecycle.
async function advance(req: AuthRequest, res: any, from: string[], to: string, stamp: 'acceptedAt' | 'dispatchedAt' | null, title: string, body: (no: string) => string) {
  const d = await distFor(req.userId);
  if (!d) return res.status(404).json({ error: 'No distributor profile' });
  const o = await prisma.restockOrder.findFirst({ where: { id: req.params.id, distributorId: d.id }, include: { supplier: { select: { userId: true } } } });
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (!from.includes(o.status)) return res.status(400).json({ error: `Cannot ${to} from ${o.status}` });
  await prisma.restockOrder.update({ where: { id: o.id }, data: { status: to, ...(stamp ? { [stamp]: new Date() } : {}) } });
  await notify(o.supplier.userId, { title, body: body(o.orderNo), type: 'restock', data: { restockId: o.id } }).catch(() => {});
  res.json({ ok: true });
}
router.post('/orders/:id/accept',   requireRole('DISTRIBUTOR'), (req: AuthRequest, res) => advance(req, res, ['PLACED'], 'ACCEPTED', 'acceptedAt', 'Restock accepted ✅', (no) => `${no}: your distributor accepted the order.`));
router.post('/orders/:id/dispatch', requireRole('DISTRIBUTOR'), (req: AuthRequest, res) => advance(req, res, ['ACCEPTED'], 'DISPATCHED', 'dispatchedAt', 'Restock on the way 🚚', (no) => `${no}: your stock has been dispatched.`));
router.post('/orders/:id/cancel',   requireRole('DISTRIBUTOR'), (req: AuthRequest, res) => advance(req, res, ['PLACED', 'ACCEPTED'], 'CANCELLED', null, 'Restock declined', (no) => `${no}: the distributor could not fulfil this order.`));

// ── Shop side ────────────────────────────────────────────────────────────────────
// Place a restock order with a distributor.
router.post('/restock', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const parse = z.object({
    distributorId: z.string().min(1),
    items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1) })).min(1),
    payMethod: z.enum(['CREDIT', 'CASH', 'MOBILE']).default('CREDIT'),
    note: z.string().max(300).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const shop = await shopFor(req.userId);
  if (!shop) return res.status(404).json({ error: 'No supplier profile' });

  const dist = await prisma.distributorProfile.findUnique({ where: { id: parse.data.distributorId } });
  if (!dist || !dist.isActive) return res.status(404).json({ error: 'Distributor not available' });

  const stock = await prisma.distributorStock.findMany({
    where:   { distributorId: dist.id, productId: { in: parse.data.items.map(i => i.productId) }, isAvailable: true },
    include: { product: true },
  });
  const lines = parse.data.items.map((i) => {
    const s = stock.find(x => x.productId === i.productId);
    return s ? { productId: i.productId, brand: s.product.brand, name: s.product.name, qty: i.qty, unitPrice: s.price } : null;
  }).filter(Boolean) as { productId: string; brand: string; name: string; qty: number; unitPrice: number }[];
  if (lines.length === 0) return res.status(400).json({ error: 'None of those items are stocked by this distributor' });

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const order = await prisma.restockOrder.create({
    data: { orderNo: restockNo(), supplierId: shop.id, distributorId: dist.id, total, payMethod: parse.data.payMethod, note: parse.data.note ?? null, items: { create: lines } },
    include: { items: true },
  });
  await notify(dist.userId, { title: '📦 New restock order', body: `${shop.businessName} ordered TZS ${total.toLocaleString()} of stock (${order.orderNo}).`, type: 'restock', data: { restockId: order.id } }).catch(() => {});
  res.status(201).json({ order });
});

// The shop's own restock orders.
router.get('/restock/mine', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const shop = await shopFor(req.userId);
  if (!shop) return res.status(404).json({ error: 'No supplier profile' });
  const orders = await prisma.restockOrder.findMany({
    where:   { supplierId: shop.id },
    include: { items: true, distributor: { select: { businessName: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take:    100,
  });
  res.json({ orders });
});

// Shop confirms receipt → top up retail inventory + draw down wholesale stock.
router.post('/restock/:id/received', requireRole('SUPPLIER'), async (req: AuthRequest, res) => {
  const shop = await shopFor(req.userId);
  if (!shop) return res.status(404).json({ error: 'No supplier profile' });
  const order = await prisma.restockOrder.findFirst({ where: { id: req.params.id, supplierId: shop.id }, include: { items: true, distributor: { select: { userId: true } } } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['DISPATCHED', 'ACCEPTED'].includes(order.status)) return res.status(400).json({ error: `Cannot receive from ${order.status}` });

  await prisma.$transaction(async (tx) => {
    await tx.restockOrder.update({ where: { id: order.id }, data: { status: 'RECEIVED', receivedAt: new Date() } });
    for (const it of order.items) {
      await tx.inventory.upsert({
        where:  { supplierId_productId: { supplierId: shop.id, productId: it.productId } },
        update: { stock: { increment: it.qty }, isAvailable: true },
        create: { supplierId: shop.id, productId: it.productId, price: it.unitPrice, stock: it.qty, isAvailable: true },
      });
      await tx.distributorStock.updateMany({ where: { distributorId: order.distributorId, productId: it.productId }, data: { stock: { decrement: it.qty } } });
    }
  });
  await notify(order.distributor.userId, { title: 'Restock received ✅', body: `${order.orderNo}: the shop confirmed receipt.`, type: 'restock', data: { restockId: order.id } }).catch(() => {});
  res.json({ ok: true });
});

// ── Discovery (any signed-in user; mainly shops) ─────────────────────────────────
// Search active distributors, optionally by region.
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const region = (req.query.region as string | undefined)?.trim();
  const distributors = await prisma.distributorProfile.findMany({
    where:   { isActive: true, ...(region ? { region } : {}) },
    select:  { id: true, businessName: true, region: true, district: true, brands: true, isVerified: true, phone: true, _count: { select: { stock: true } } },
    orderBy: [{ isVerified: 'desc' }, { businessName: 'asc' }],
    take:    100,
  });
  res.json({ distributors });
});

// A distributor's public profile + available wholesale catalog.
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const d = await prisma.distributorProfile.findUnique({ where: { id: req.params.id } });
  if (!d) return res.status(404).json({ error: 'Distributor not found' });
  const stock = await prisma.distributorStock.findMany({
    where:   { distributorId: d.id, isAvailable: true, stock: { gt: 0 } },
    include: { product: true },
    orderBy: { price: 'asc' },
  });
  res.json({ distributor: d, stock });
});

export { router as distributorsRouter };
