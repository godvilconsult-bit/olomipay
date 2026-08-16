/**
 * Core order placement — shared by manual checkout, 1-tap reorder, the
 * auto-refill scheduler, and storefront offer checkout.
 *
 * Extracted from routes/orders.ts so services no longer import from routes.
 * That direction was already awkward (services/subscriptions reached back into
 * a route module) and became a genuine import cycle once offerCheckout needed
 * it too. Behaviour is unchanged; routes/orders re-exports it for compatibility.
 *
 * Throws Error with an `http` status code on validation failures.
 */
import { prisma } from '../lib/prisma';
import { computeOrderMoney } from '../lib/fees';
import { makeOrderNo } from '../lib/ids';
import { notify } from './notify';
import { emitToUser } from '../socket';

export const orderInclude = {
  items:    true,
  payment:  true,
  delivery: { include: { rider: { select: { id: true, name: true, phone: true, profilePicUrl: true, riderProfile: { select: { vehicleType: true, plateNo: true, rating: true } } } } } },
  supplier: { select: { id: true, businessName: true, phone: true, lat: true, lng: true, region: true, payProvider: true, payNumber: true, payName: true } },
  address:  true,
  review:   true,
} as const;

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

      // Dual-write to the storefront Offer. Without this the catalog keeps
      // showing stock that a legacy-path order already consumed. updateMany is
      // a deliberate no-op when the backfill has not created an Offer yet.
      const inv = invs.find(v => v.id === i.inventoryId)!;
      if (supplier.orgId) {
        await tx.offer.updateMany({
          where: { sellerOrgId: supplier.orgId, productId: inv.productId },
          data:  { stock: { decrement: i.qty } },
        });
      }
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
