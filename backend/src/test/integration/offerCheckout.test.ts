/**
 * Storefront checkout tests.
 *
 * Buying from an Offer must produce exactly the same order as the legacy path —
 * same money, same stock movement, same alerts — because it routes through the
 * same placeOrder. What is new here is the Offer→Inventory resolution, the
 * minimum-order-quantity rule that makes the wholesale tier real, and keeping
 * Offer.stock in step with Inventory.stock.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { placeOrderFromOffers } from '../../services/offerCheckout';
import { backfillMarketplace } from '../../services/backfill';
import { makeOrderableWorld, makeSupplier, makeProduct, makeInventory, makeHousehold, makeAddress } from './factories';

const silent = () => {};

async function offerFor(supplierProfileId: string, productId: string) {
  const shop = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: supplierProfileId } });
  return prisma.offer.findUniqueOrThrow({
    where: { sellerOrgId_productId: { sellerOrgId: shop.orgId!, productId } },
  });
}

async function expectRejection(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e: any) { return { http: e?.http, message: e?.message ?? '' }; }
  throw new Error('Expected checkout to reject, but it resolved');
}

beforeAll(async () => { await prisma.$connect(); });

describe('checkout from an offer', () => {
  it('places a real order and decrements both Inventory and Offer stock', async () => {
    const w = await makeOrderableWorld({ price: 45_000, stock: 10 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);

    const { order } = await placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 2 }]);

    expect(order.status).toBe('ALERTED');
    expect(order.itemsTotal).toBe(90_000);
    expect(order.items[0].qty).toBe(2);

    // Both sides of the dual-write must move together, or the catalog starts
    // advertising stock that is already sold.
    const inv   = await prisma.inventory.findUniqueOrThrow({ where: { id: w.inventory.id } });
    const after = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(inv.stock).toBe(8);
    expect(after.stock).toBe(8);
  });

  it('produces the same money as the legacy path', async () => {
    const w = await makeOrderableWorld({ price: 50_000, stock: 10 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);

    const { order } = await placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 2 }]);

    expect(order.commissionAmount).toBe(8_000);          // 100 000 at FREE tier 8%
    expect(order.serviceFee).toBe(500);
    expect(order.total).toBe(order.itemsTotal + order.deliveryFee + order.serviceFee);
    // The conservation invariant still holds through the new entry point.
    const supplierAmount = order.itemsTotal - order.commissionAmount;
    expect(supplierAmount + order.riderNet + order.platformAmount).toBe(order.total);
  });

  it('falls back to the buyer default address when none is given', async () => {
    const w = await makeOrderableWorld({ stock: 5 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);

    const { order } = await placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 1 }]);

    expect(order.addressId).toBe(w.address.id);
  });

  it('lets a shop owner buy too — buyers are not only households', async () => {
    // The universal-marketplace premise: a retailer restocking upstream is an
    // ordinary buyer. requireAuth rather than requireRole is what allows it.
    const seller = await makeSupplier();
    const buyerShop = await makeSupplier();
    const product = await makeProduct({ name: 'Cross-tier 15kg' });
    await makeInventory(seller.profile.id, product.id, { price: 40_000, stock: 20 });
    await makeAddress(buyerShop.user.id);
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(seller.profile.id, product.id);

    const { order } = await placeOrderFromOffers(buyerShop.user.id, [{ offerId: offer.id, qty: 3 }]);

    expect(order.householdId).toBe(buyerShop.user.id);
    expect(order.itemsTotal).toBe(120_000);
  });
});

describe('checkout rejections', () => {
  it('refuses a basket mixing two sellers rather than silently splitting it', async () => {
    const a = await makeOrderableWorld({ stock: 5 });
    const b = await makeSupplier();
    const otherProduct = await makeProduct({ name: 'Other seller 6kg' });
    await makeInventory(b.profile.id, otherProduct.id, { price: 20_000, stock: 5 });
    await backfillMarketplace({ log: silent });

    const offerA = await offerFor(a.supplier.profile.id, a.product.id);
    const offerB = await offerFor(b.profile.id, otherProduct.id);

    const err = await expectRejection(() =>
      placeOrderFromOffers(a.household.id, [{ offerId: offerA.id, qty: 1 }, { offerId: offerB.id, qty: 1 }]),
    );

    expect(err.http).toBe(400);
    expect(err.message).toMatch(/same seller/i);
  });

  it('enforces the wholesale minimum order quantity', async () => {
    // Without this the moq column is decorative and wholesale is just retail.
    const w = await makeOrderableWorld({ stock: 100 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);
    await prisma.offer.update({ where: { id: offer.id }, data: { moq: 10 } });

    const err = await expectRejection(() =>
      placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 4 }]),
    );
    expect(err.http).toBe(400);
    expect(err.message).toMatch(/minimum order is 10/i);

    // At or above the minimum it goes through.
    const { order } = await placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 10 }]);
    expect(order.items[0].qty).toBe(10);
  });

  it('rejects a quantity beyond the offer stock', async () => {
    const w = await makeOrderableWorld({ stock: 3 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);

    const err = await expectRejection(() =>
      placeOrderFromOffers(w.household.id, [{ offerId: offer.id, qty: 9 }]),
    );
    expect(err.http).toBe(409);
    expect(err.message).toMatch(/out of stock/i);
  });

  it('rejects a closed seller', async () => {
    const household = await makeHousehold();
    await makeAddress(household.id);
    const shop = await makeSupplier({ isOpen: false });
    const product = await makeProduct({ name: 'Closed shop 15kg' });
    await makeInventory(shop.profile.id, product.id, { price: 30_000, stock: 5 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(shop.profile.id, product.id);

    const err = await expectRejection(() =>
      placeOrderFromOffers(household.id, [{ offerId: offer.id, qty: 1 }]),
    );
    expect(err.http).toBe(409);
    expect(err.message).toMatch(/closed/i);
  });

  it('rejects an unknown offer', async () => {
    const w = await makeOrderableWorld();
    const err = await expectRejection(() =>
      placeOrderFromOffers(w.household.id, [{ offerId: 'nope', qty: 1 }]),
    );
    expect(err.http).toBe(404);
  });

  it('tells a buyer with no address what to do', async () => {
    const buyer = await makeHousehold();           // no address created
    const w = await makeOrderableWorld({ stock: 5 });
    await backfillMarketplace({ log: silent });
    const offer = await offerFor(w.supplier.profile.id, w.product.id);

    const err = await expectRejection(() =>
      placeOrderFromOffers(buyer.id, [{ offerId: offer.id, qty: 1 }]),
    );
    expect(err.http).toBe(400);
    expect(err.message).toMatch(/address/i);
  });
});
