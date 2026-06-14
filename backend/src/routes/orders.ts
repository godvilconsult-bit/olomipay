import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { computeOrderMoney } from '../lib/fees';
import { makeOrderNo } from '../lib/ids';
import { notify } from '../services/notify';
import { refundPayment } from '../services/payments';
import { sendSms } from '../services/sms';
import { onOrderCompleted } from '../services/rewards';
import { emitToUser } from '../socket';

const router = Router();

const orderInclude = {
  items:    true,
  payment:  true,
  delivery: { include: { rider: { select: { id: true, name: true, phone: true, profilePicUrl: true, riderProfile: { select: { vehicleType: true, plateNo: true, rating: true } } } } } },
  supplier: { select: { id: true, businessName: true, phone: true, lat: true, lng: true, region: true, payProvider: true, payNumber: true, payName: true } },
  address:  true,
  review:   true,
} as const;

// Core placement logic — shared by POST / (manual), POST /:id/reorder (1-tap),
// and the auto-refill subscription scheduler.
// Throws Error with an `http` status code on validation failures.
export async function placeOrder(
  userId: string, supplierId: string, addressId: string,
  items: { inventoryId: string; qty: number }[], note?: string,
) {
  const [supplier, address] = await Promise.all([
    prisma.supplierProfile.findUnique({ where: { id: supplierId } }),
    prisma.address.findFirst({ where: { id: addressId, userId } }),
  ]);
  if (!supplier || !supplier.isOpen) throw Object.assign(new Error('Vendor unavailable'), { http: 404 });
  if (!address) throw Object.assign(new Error('Delivery address not found'), { http: 404 });

  const invIds = items.map(i => i.inventoryId);
  const invs   = await prisma.inventory.findMany({ where: { id: { in: invIds }, supplierId }, include: { product: true } });
  if (invs.length !== invIds.length) throw Object.assign(new Error('Some items are not sold by this vendor'), { http: 400 });

  const lineItems = items.map(i => {
    const inv = invs.find(v => v.id === i.inventoryId)!;
    if (inv.stock < i.qty) throw Object.assign(new Error(`${inv.product.brand} ${inv.product.name} is out of stock`), { http: 409 });
    return {
      productId: inv.productId, productName: inv.product.name, brand: inv.product.brand,
      sizeKg: inv.product.sizeKg, qty: i.qty, unitPrice: inv.price, lineTotal: inv.price * i.qty,
    };
  });

  const itemsTotal = lineItems.reduce((s, l) => s + l.lineTotal, 0);
  // Per-line types drive accessory-aware commission (Phase 3); tier drives the
  // gas commission rate (Phase 2).
  const moneyLines = items.map(i => {
    const inv = invs.find(v => v.id === i.inventoryId)!;
    return { type: inv.product.type, lineTotal: inv.price * i.qty };
  });
  const money = computeOrderMoney({
    itemsTotal, lines: moneyLines, tier: supplier.tier,
    supplierLat: supplier.lat, supplierLng: supplier.lng,
    dropLat: address.lat, dropLng: address.lng,
  });

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNo:          makeOrderNo(),
        householdId:      userId,
        supplierId,
        addressId,
        note:             note ?? null,
        status:           'ALERTED',
        itemsTotal:       money.itemsTotal,
        deliveryFee:      money.deliveryFee,
        serviceFee:       money.serviceFee,
        surgeMultiplier:  money.surgeMultiplier,
        total:            money.total,
        commissionPct:    money.commissionPct,
        commissionAmount: money.commissionAmount,
        riderNet:         money.riderAmount,
        platformAmount:   money.platformAmount,
        items:   { create: lineItems },
        // Collected now by mobile money: gas + service fee. The rider fee is
        // settled on delivery; the platform's delivery margin is taken from it.
        payment: { create: { amount: money.upfrontAmount, status: 'PENDING' } },
      },
      include: orderInclude,
    });
    for (const i of items) {
      await tx.inventory.update({ where: { id: i.inventoryId }, data: { stock: { decrement: i.qty } } });
    }
    return created;
  });

  emitToUser(supplier.userId, 'order:new', order);
  await notify(supplier.userId, {
    title: 'New order! 🔔',
    body:  `${order.orderNo} · TZS ${money.total.toLocaleString()} · ${money.distanceKm} km`,
    type:  'order', data: { orderId: order.id },
  });
  await notify(userId, { title: 'Order placed ✅', body: `${order.orderNo} sent to ${supplier.businessName}. Complete your payment.`, type: 'order', data: { orderId: order.id } });

  // Low-stock auto-nudge: tell the supplier to reorder anything this order drained.
  const LOW = Number(process.env.JIKO_LOW_STOCK ?? 3);
  const lowItems = items
    .map(i => { const inv = invs.find(v => v.id === i.inventoryId)!; return { name: `${inv.product.brand} ${inv.product.name}`, left: inv.stock - i.qty }; })
    .filter(x => x.left <= LOW);
  if (lowItems.length) await notify(supplier.userId, { title: 'Low stock ⚠️', body: `${lowItems.map(x => `${x.name} (${x.left} left)`).join(', ')}. Reorder soon.`, type: 'restock' }).catch(() => {});

  return { order, money };
}

// ── POST /api/orders ─ place an order (household) ────────────────────────────────
router.post('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    supplierId: z.string(),
    addressId:  z.string(),
    note:       z.string().max(300).optional(),
    items:      z.array(z.object({ inventoryId: z.string(), qty: z.number().int().min(1).max(20) })).min(1),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const { order, money } = await placeOrder(req.userId!, parse.data.supplierId, parse.data.addressId, parse.data.items as { inventoryId: string; qty: number }[], parse.data.note);
    res.status(201).json({ order, money });
  } catch (e: any) {
    res.status(e?.http ?? 500).json({ error: e?.message ?? 'Failed to place order' });
  }
});

// ── POST /api/orders/:id/reorder ─ 1-tap reorder ─────────────────────────────────
// Re-places a past order: re-resolves each item to the vendor's CURRENT in-stock
// inventory (prices/stock may have changed) and delivers to the household's
// current default address. Skips items no longer available and reports them.
router.post('/:id/reorder', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const past = await prisma.order.findFirst({
    where: { id: req.params.id, householdId: req.userId }, include: { items: true },
  });
  if (!past) return res.status(404).json({ error: 'Order not found' });

  const resolved: { inventoryId: string; qty: number }[] = [];
  const unavailable: string[] = [];
  for (const it of past.items) {
    const inv = await prisma.inventory.findFirst({
      where: { supplierId: past.supplierId, productId: it.productId, stock: { gte: it.qty } },
    });
    if (inv) resolved.push({ inventoryId: inv.id, qty: it.qty });
    else unavailable.push(`${it.brand ?? ''} ${it.productName ?? ''}`.trim() || 'an item');
  }
  if (resolved.length === 0) {
    return res.status(409).json({ error: `Not available from this vendor right now: ${unavailable.join(', ')}` });
  }

  // Deliver to the current default address, falling back to the past order's.
  let addr = await prisma.address.findFirst({ where: { userId: req.userId, isDefault: true } });
  if (!addr) addr = await prisma.address.findFirst({ where: { id: past.addressId, userId: req.userId } });
  if (!addr) return res.status(400).json({ error: 'Set a delivery location first' });

  try {
    const { order, money } = await placeOrder(req.userId!, past.supplierId, addr.id, resolved, past.note ?? undefined);
    res.status(201).json({ order, money, ...(unavailable.length ? { skipped: unavailable } : {}) });
  } catch (e: any) {
    res.status(e?.http ?? 500).json({ error: e?.message ?? 'Could not reorder' });
  }
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
  await notify(order.supplier.userId, { title: 'Order cancelled', body: `${order.orderNo} was cancelled by the household.`, type: 'order', data: { orderId: order.id } });
  const refunded = await refundPayment(order.id);
  if (refunded) await notify(order.householdId, { title: 'Refund initiated 💸', body: `TZS ${refunded.toLocaleString()} for ${order.orderNo} is being returned to your mobile money.`, type: 'payment', data: { orderId: order.id } });
  res.json({ ok: true, refunded });
});

// ── POST /api/orders/:id/confirm-fee ─ household agrees to the rider fee ──────────
router.post('/:id/confirm-fee', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId }, include: { delivery: true, supplier: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'RIDER_ACCEPTED') return res.status(409).json({ error: 'No fee awaiting confirmation' });

  await prisma.order.update({ where: { id: order.id }, data: { status: 'FEE_CONFIRMED' } });
  if (order.delivery?.riderId) {
    emitToUser(order.delivery.riderId, 'fee:confirmed', { orderId: order.id });
    await notify(order.delivery.riderId, { title: 'Fee confirmed — proceed 🏍️', body: `You'll earn TZS ${(order.riderNet || order.deliveryFee).toLocaleString()}. Collect and deliver.`, type: 'order', data: { orderId: order.id } });
  }
  emitToUser(order.supplier.userId, 'order:tracking', { orderId: order.id });
  await notify(order.supplier.userId, { title: 'Delivery starting 🏍️', body: `${order.orderNo}: household confirmed the rider fee. Rider is collecting.`, type: 'order', data: { orderId: order.id } });
  // SMS the household their delivery code as a fallback (works without data/push).
  if (order.delivery?.otp && req.userPhone) sendSms(req.userPhone, `JIKO: Your delivery code is ${order.delivery.otp}. Give it to the rider when your gas arrives.`).catch(() => {});
  res.json({ ok: true });
});

// ── POST /api/orders/:id/complete ─ household confirms receipt ────────────────────
router.post('/:id/complete', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, householdId: req.userId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'DELIVERED') return res.status(409).json({ error: 'Order is not awaiting confirmation' });
  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: orderInclude });
  onOrderCompleted(order.id).catch(() => {}); // loyalty points + referral bonus (best-effort)
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
