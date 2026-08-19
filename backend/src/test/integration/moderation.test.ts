/**
 * Seller moderation.
 *
 * The load-bearing test is the first one: suspending a seller must remove their
 * merchandise from the public catalog. Before this, isActive only hid the
 * storefront page and the seller directory — products stayed in browse and on
 * product pages, so a suspension did not actually take a bad seller off the
 * marketplace.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { catalogRouter } from '../../routes/catalog';
import { backfillMarketplace } from '../../services/backfill';
import { serveRouter, type TestClient } from './httpHarness';
import { makeSupplier, makeProduct, makeInventory } from './factories';

let shop: TestClient;
const silent = () => {};
const TAG = `md${Date.now().toString(36)}`;

beforeAll(async () => {
  await prisma.$connect();
  shop = await serveRouter('/api/catalog', catalogRouter);
});
afterAll(async () => { await shop?.close(); });

/** A seller with one listed product, wired through the normal backfill path. */
async function sellerWithProduct(name: string) {
  const s = await makeSupplier();
  const product = await makeProduct({ name });
  await makeInventory(s.profile.id, product.id, { price: 40_000, stock: 5 });
  await backfillMarketplace({ log: silent });
  const profile = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: s.profile.id } });
  return { orgId: profile.orgId!, productId: product.id, name };
}

describe('suspension removes merchandise from the marketplace', () => {
  it('hides a suspended seller from browse, not just from their storefront', async () => {
    const { orgId, name } = await sellerWithProduct(`${TAG} Suspendable Widget`);

    const before = await shop.get(`/api/catalog/products?q=${TAG}%20Suspendable`);
    expect(before.body.total).toBe(1);

    await prisma.organization.update({ where: { id: orgId }, data: { isActive: false } });

    const after = await shop.get(`/api/catalog/products?q=${TAG}%20Suspendable`);
    expect(after.body.total).toBe(0);
  });

  it('drops their offer from the product page too', async () => {
    // Otherwise the product page is a back door to a seller who has been
    // removed: the listing is gone from browse but still buyable by direct link.
    const { orgId, productId } = await sellerWithProduct(`${TAG} Backdoor Item`);

    const before = await shop.get(`/api/catalog/products/${productId}`);
    expect(before.body.product.offers.length).toBe(1);

    await prisma.organization.update({ where: { id: orgId }, data: { isActive: false } });

    const after = await shop.get(`/api/catalog/products/${productId}`);
    expect(after.body.product.offers.length).toBe(0);
    expect(after.body.product.sellerCount).toBe(0);
  });

  it('leaves other sellers of the same product untouched', async () => {
    // Suspending one seller must not take a shared catalog entry down with it.
    const good = await makeSupplier();
    const bad  = await makeSupplier();
    const product = await makeProduct({ name: `${TAG} Shared Item` });
    await makeInventory(good.profile.id, product.id, { price: 30_000, stock: 5 });
    await makeInventory(bad.profile.id,  product.id, { price: 25_000, stock: 5 });
    await backfillMarketplace({ log: silent });

    const badOrg = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: bad.profile.id } });
    await prisma.organization.update({ where: { id: badOrg.orgId! }, data: { isActive: false } });

    const page = await shop.get(`/api/catalog/products/${product.id}`);
    expect(page.body.product.offers.length).toBe(1);
    // The cheaper suspended offer is gone, so the displayed price rises to the
    // remaining legitimate seller's.
    expect(page.body.product.offers[0].price).toBe(30_000);
  });

  it('restores the listing when the suspension is lifted', async () => {
    const { orgId } = await sellerWithProduct(`${TAG} Reinstated Item`);
    await prisma.organization.update({ where: { id: orgId }, data: { isActive: false } });
    expect((await shop.get(`/api/catalog/products?q=${TAG}%20Reinstated`)).body.total).toBe(0);

    await prisma.organization.update({ where: { id: orgId }, data: { isActive: true } });
    expect((await shop.get(`/api/catalog/products?q=${TAG}%20Reinstated`)).body.total).toBe(1);
  });

  it('still honours an explicit seller filter alongside the isActive rule', async () => {
    // The seller query parameter and the moderation rule share one filter
    // object; an earlier version would have let one overwrite the other.
    const { orgId } = await sellerWithProduct(`${TAG} Filtered Item`);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

    const bySlug = await shop.get(`/api/catalog/products?q=${TAG}%20Filtered&seller=${org.slug}`);
    expect(bySlug.body.total).toBe(1);

    await prisma.organization.update({ where: { id: orgId }, data: { isActive: false } });
    const afterSuspend = await shop.get(`/api/catalog/products?q=${TAG}%20Filtered&seller=${org.slug}`);
    expect(afterSuspend.body.total).toBe(0);
  });
});
