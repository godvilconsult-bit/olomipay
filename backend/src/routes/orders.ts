import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { computeOrderMoney } from '../lib/fees';
import { makeOrderNo } from '../lib/ids';
import { notify } from '../services/notify';
import { emitToUser } from '../socket';

const router = Router();

const orderInclude = {
  items:    true,
  payment:  true,
  delivery: { include: { rider: { select: { id: true, name: true, phone: true, riderProfile: { select: { vehicleType: true, plateNo: true, rating: true } } } } } },
  supplier: { select: { id: true, businessName: true, phone: true, lat: true, lng: true, region: true } },
  address:  true,
  review:   true,
} as const;

// ── POST /api/orders ─ place an order (household) ────────────────────────────────
router.post('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    supplierId: z.string(),
    addressId:  z.string(),
    note:       z.string().max(300).optional(),
    items:      z.array(z.object({ inventoryId: z.string(), qty: z.number().int().min(1).max(20) })).min(1),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const { supplierId, addressId, note, items } = parse.data;

  const [supplier, address] = await Promise.all([
    prisma.supplierProfile.findUnique({ where: { id: supplierId } }),
    prisma.address.findFirst({ where: { id: addressId, userId: req.userId } }),
  ]);
  if (!supplier || !supplier.isOpen) return res.status(404).json({ error: 'Vendor unavailable' });
  if (!address) return res.status(404).json({ error: 'Delivery address not found' });

  // Load the chosen inventory rows and validate stock + ownership.
  const invIds = items.map(i => i.inventoryId);
  const invs   = await prisma.inventory.findMany({ where: { id: { in: invIds }, supplierId }, include: { product: true } });
  if (invs.length !== invIds.length) return res.status(400).json({ error: 'Some items are not sold by this vendor' });

  const lineItems = items.map(i => {
    const inv = invs.find(v => v.id === i.inventoryId)!;
    if (inv.stock < i.qty) throw Object.assign(new Error(`${inv.product.brand} ${inv.product.name} is out of stock`), { http: 409 });
    return {
      productId:   inv.productId,
      productName: inv.product.name,
      brand:       inv.product.brand,
      sizeKg:      inv.product.sizeKg,
      qty:         i.qty,
      unitPrice:   inv.price,
      lineTotal:   inv.price * i.qty,
    };
  });

  const itemsTotal = lineItems.reduce((s, l) => s + l.lineTotal, 0);
  const money = computeOrderMoney({
    itemsTotal,
    supplierLat: supplier.lat, supplierLng: supplier.lng,
    dropLat: address.lat, dropLng: address.lng,
  });

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNo:          makeOrderNo(),
        householdId:      req.userId!,
        supplierId,
        addressId,
        note:             note ?? null,
        status:           'ALERTED',
        itemsTotal:       money.itemsTotal,
        deliveryFee:      money.deliveryFee,
        surgeMultiplier:  money.surgeMultiplier,
        total:            money.total,
        commissionPct:    money.commissionPct,
        commissionAmount: money.commissionAmount,
        items:   { create: lineItems },
        payment: { create: { amount: money.total, status: 'PENDING' } },
      },
      include: orderInclude,
    });
    // Reserve stock immediately.
    for (const i of items) {
      await tx.inventory.update({ where: { id: i.inventoryId }, data: { stock: { decrement: i.qty } } });
    }
    return created;
  });

  // Alert the vendor in real time.
  emitToUser(supplier.userId, 'order:new', order);
  await notify(supplier.userId, {
    title: 'Oda mpya! 🔔',
    body:  `${order.orderNo} · TZS ${money.total.toLocaleString()} · ${money.distanceKm} km`,
    type:  'order',
    data:  { orderId: order.id },
  });

  res.status(201).json({ order, money });
});

// ── GET /api/orders ─ my orders (household) ──────────────────────────────────────
router.get('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const orders = await prisma.order.findMany({
    where:   { householdId: req.userId },
    include: orderInclude,
    orderBy: { placedAt: 'desc' },
    take:    50,
  });
  res.json({ orders });
});

// ── GET /api/orders/:id ──────────────────────────────────────────────────────────
router.get('/:id', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId }, include: orderInclude });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

// ── POST /api/orders/:id/cancel ──────────────────────────────────────────────────
router.post('/:id/cancel', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId }, include: { items: true, supplier: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['PICKED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status))
    return res.status(409).json({ error: 'Order can no longer be cancelled' });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: req.body?.reason ?? 'Cancelled by household' } });
    // Return reserved stock.
    for (const it of order.items) {
      await tx.inventory.updateMany({ where: { supplierId: order.supplierId, productId: it.productId }, data: { stock: { increment: it.qty } } });
    }
  });

  emitToUser(order.supplier.userId, 'order:cancelled', { orderId: order.id });
  res.json({ ok: true });
});

// ── POST /api/orders/:id/complete ─ household confirms receipt ────────────────────
router.post('/:id/complete', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'DELIVERED') return res.status(409).json({ error: 'Order is not awaiting confirmation' });
  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: orderInclude });
  res.json({ order: updated });
});

// ── POST /api/orders/:id/review ──────────────────────────────────────────────────
router.post('/:id/review', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    supplierRating: z.number().int().min(1).max(5).optional(),
    riderRating:    z.number().int().min(1).max(5).optional(),
    comment:        z.string().max(500).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId }, include: { delivery: true, review: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.review) return res.status(409).json({ error: 'Already reviewed' });

  const { supplierRating, riderRating, comment } = parse.data;
  const riderId = order.delivery?.riderId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.review.create({
      data: { orderId: order.id, authorId: req.userId!, supplierId: order.supplierId, riderId, supplierRating, riderRating, comment },
    });
    // Roll the new rating into the supplier's running average.
    if (supplierRating) {
      const s = await tx.supplierProfile.findUnique({ where: { id: order.supplierId } });
      if (s) {
        const count = s.ratingCount + 1;
        await tx.supplierProfile.update({ where: { id: s.id }, data: { rating: (s.rating * s.ratingCount + supplierRating) / count, ratingCount: count } });
      }
    }
    if (riderRating && riderId) {
      const rp = await tx.riderProfile.findUnique({ where: { userId: riderId } });
      if (rp) {
        const count = rp.ratingCount + 1;
        await tx.riderProfile.update({ where: { userId: riderId }, data: { rating: (rp.rating * rp.ratingCount + riderRating) / count, ratingCount: count } });
      }
    }
  });

  res.json({ ok: true });
});

export { router as ordersRouter };
