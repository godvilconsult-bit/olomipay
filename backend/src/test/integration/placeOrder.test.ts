/**
 * Characterization tests for order placement.
 *
 * These describe what the gas flow does *today*, not what it ought to do. They
 * exist so the universal-marketplace refactor has a regression baseline: when
 * Order becomes party-to-party and money moves to integer minor units, these
 * must still pass (or fail loudly and deliberately).
 *
 * See docs/refactor/UNIVERSAL-MARKETPLACE.md §10 (migration phases).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { placeOrder } from '../../routes/orders';
import { makeOrderableWorld, makeProduct, makeInventory, makeSupplier, makeHousehold, makeAddress } from './factories';

const DELIVERY_MARGIN_PCT = 0.15;
const SERVICE_FEE_FLAT    = 500;

/** placeOrder rejects by throwing an Error carrying an `http` status. */
async function expectRejection(fn: () => Promise<unknown>): Promise<{ http?: number; message: string }> {
  try {
    await fn();
  } catch (e: any) {
    return { http: e?.http, message: e?.message ?? '' };
  }
  throw new Error('Expected placeOrder to reject, but it resolved');
}

beforeAll(async () => {
  await prisma.$connect();
});

describe('placeOrder — happy path', () => {
  it('creates an ALERTED order with a pending upfront payment and snapshotted lines', async () => {
    const w = await makeOrderableWorld({ price: 45_000, stock: 10 });

    const { order, money } = await placeOrder(
      w.household.id, w.supplier.profile.id, w.address.id,
      [{ inventoryId: w.inventory.id, qty: 2 }],
      'leave at the gate',
    );

    expect(order.status).toBe('ALERTED');
    expect(order.orderNo).toBeTruthy();
    expect(order.note).toBe('leave at the gate');

    // Line items are snapshots — the order must not change if the product later does.
    expect(order.items).toHaveLength(1);
    const line = order.items[0];
    expect(line.productName).toBe('15kg Refill');
    expect(line.brand).toBe('Oryx');
    expect(line.sizeKg).toBe(15);
    expect(line.qty).toBe(2);
    expect(line.unitPrice).toBe(45_000);
    expect(line.lineTotal).toBe(90_000);

    // Upfront payment = goods + service fee. The rider fee is collected on delivery.
    expect(order.payment?.status).toBe('PENDING');
    expect(order.payment?.amount).toBe(money.upfrontAmount);
    expect(order.payment?.amount).toBe(order.itemsTotal + order.serviceFee);
  });

  it('decrements the vendor stock by the ordered quantity', async () => {
    const w = await makeOrderableWorld({ stock: 10 });

    await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 3 }]);

    const after = await prisma.inventory.findUniqueOrThrow({ where: { id: w.inventory.id } });
    expect(after.stock).toBe(7);
  });
});

describe('placeOrder — money', () => {
  it('conserves money: what the buyer pays equals what the three parties receive', async () => {
    // This is the invariant that must survive the migration to integer minor
    // units. If it ever breaks, money is being created or destroyed.
    const w = await makeOrderableWorld({ price: 45_000, stock: 10 });

    const { order } = await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 2 }]);

    const supplierAmount = order.itemsTotal - order.commissionAmount;
    expect(supplierAmount + order.riderNet + order.platformAmount).toBe(order.total);
  });

  it('composes the total as items + delivery + service fee', async () => {
    const w = await makeOrderableWorld({ price: 30_000, stock: 5 });

    const { order } = await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 1 }]);

    expect(order.itemsTotal).toBe(30_000);
    expect(order.serviceFee).toBe(SERVICE_FEE_FLAT);
    expect(order.total).toBe(order.itemsTotal + order.deliveryFee + order.serviceFee);
  });

  it('splits the delivery fee between rider and platform margin', async () => {
    const w = await makeOrderableWorld({ stock: 5 });

    const { order } = await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 1 }]);

    const margin = Math.round(order.deliveryFee * DELIVERY_MARGIN_PCT);
    expect(order.deliveryFee).toBeGreaterThan(0);
    expect(order.riderNet).toBe(order.deliveryFee - margin);
    expect(order.platformAmount).toBe(order.commissionAmount + order.serviceFee + margin);
  });

  it('charges 8% commission on a FREE-tier vendor', async () => {
    const w = await makeOrderableWorld({ tier: 'FREE', price: 50_000, stock: 5 });

    const { order } = await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 2 }]);

    expect(order.itemsTotal).toBe(100_000);
    expect(order.commissionAmount).toBe(8_000);
  });

  it('charges a reduced 5% commission on a PREMIUM-tier vendor', async () => {
    const w = await makeOrderableWorld({ tier: 'PREMIUM', price: 50_000, stock: 5 });

    const { order } = await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 2 }]);

    expect(order.commissionAmount).toBe(5_000);
  });

  it('charges the higher 12% accessory rate per line, blended with gas', async () => {
    const household = await makeHousehold();
    const supplier  = await makeSupplier({ tier: 'FREE' });
    const address   = await makeAddress(household.id);

    const gas       = await makeProduct({ type: 'REFILL', name: '15kg Refill' });
    const accessory = await makeProduct({ type: 'ACCESSORY', name: 'Regulator', sizeKg: null });
    const gasInv    = await makeInventory(supplier.profile.id, gas.id,       { price: 50_000, stock: 5 });
    const accInv    = await makeInventory(supplier.profile.id, accessory.id, { price: 10_000, stock: 5 });

    const { order } = await placeOrder(household.id, supplier.profile.id, address.id, [
      { inventoryId: gasInv.id, qty: 1 },
      { inventoryId: accInv.id, qty: 1 },
    ]);

    // 50 000 × 8% = 4 000   +   10 000 × 12% = 1 200
    expect(order.itemsTotal).toBe(60_000);
    expect(order.commissionAmount).toBe(5_200);
  });
});

describe('placeOrder — notifications', () => {
  it('notifies both the vendor and the buyer, emoji intact', async () => {
    // Guards two things at once: that placement notifies both parties, and that
    // the database can actually store the emoji in those titles. notify() traps
    // its own errors, so without asserting on the rows a broken encoding is
    // invisible — which is exactly how it slipped through the first run here.
    const w = await makeOrderableWorld({ stock: 10 });

    await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 2 }]);

    const vendorNotes = await prisma.notification.findMany({ where: { userId: w.supplier.user.id } });
    const buyerNotes  = await prisma.notification.findMany({ where: { userId: w.household.id } });

    expect(vendorNotes.some(n => n.title.includes('New order'))).toBe(true);
    expect(buyerNotes.some(n => n.title.includes('Order placed'))).toBe(true);
    expect(vendorNotes.some(n => n.title.includes('🔔'))).toBe(true);
    expect(buyerNotes.some(n => n.title.includes('✅'))).toBe(true);
  });

  it('nudges the vendor to restock when an order drains stock to the low-water mark', async () => {
    const w = await makeOrderableWorld({ stock: 5 }); // 5 − 3 = 2, at or below LOW_STOCK=3

    await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 3 }]);

    const restockNotes = await prisma.notification.findMany({
      where: { userId: w.supplier.user.id, type: 'restock' },
    });
    expect(restockNotes).toHaveLength(1);
    expect(restockNotes[0].body).toMatch(/2 left/);
  });

  it('does not nudge when plenty of stock remains', async () => {
    const w = await makeOrderableWorld({ stock: 20 });

    await placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 1 }]);

    const restockNotes = await prisma.notification.findMany({
      where: { userId: w.supplier.user.id, type: 'restock' },
    });
    expect(restockNotes).toHaveLength(0);
  });
});

describe('placeOrder — rejections', () => {
  it('rejects when the requested quantity exceeds stock, without touching the order table', async () => {
    const w = await makeOrderableWorld({ stock: 2 });
    const before = await prisma.order.count();

    const err = await expectRejection(() =>
      placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: w.inventory.id, qty: 5 }]),
    );

    expect(err.http).toBe(409);
    expect(err.message).toMatch(/out of stock/i);
    expect(await prisma.order.count()).toBe(before);
  });

  it('rejects a closed vendor', async () => {
    const household = await makeHousehold();
    const supplier  = await makeSupplier({ isOpen: false });
    const address   = await makeAddress(household.id);
    const product   = await makeProduct();
    const inventory = await makeInventory(supplier.profile.id, product.id);

    const err = await expectRejection(() =>
      placeOrder(household.id, supplier.profile.id, address.id, [{ inventoryId: inventory.id, qty: 1 }]),
    );

    expect(err.http).toBe(404);
  });

  it('rejects inventory belonging to a different vendor', async () => {
    const w     = await makeOrderableWorld();
    const other = await makeSupplier();
    const otherProduct   = await makeProduct({ name: 'Other 6kg' });
    const otherInventory = await makeInventory(other.profile.id, otherProduct.id);

    const err = await expectRejection(() =>
      placeOrder(w.household.id, w.supplier.profile.id, w.address.id, [{ inventoryId: otherInventory.id, qty: 1 }]),
    );

    expect(err.http).toBe(400);
    expect(err.message).toMatch(/not sold by this vendor/i);
  });

  it("rejects an address that belongs to somebody else", async () => {
    const w       = await makeOrderableWorld();
    const outsider = await makeHousehold();
    const theirs   = await makeAddress(outsider.id);

    const err = await expectRejection(() =>
      placeOrder(w.household.id, w.supplier.profile.id, theirs.id, [{ inventoryId: w.inventory.id, qty: 1 }]),
    );

    expect(err.http).toBe(404);
  });
});
