/**
 * Phase 2 backfill tests.
 *
 * The suite shares one database with the other integration files, so every
 * assertion is scoped to entities this file creates rather than to global
 * counts — the backfill legitimately converts everything it finds.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { backfillMarketplace } from '../../services/backfill';
import { toMinor } from '../../lib/money';
import { makeSupplier, makeHousehold, makeProduct, makeInventory } from './factories';

let seq = 0;
const uniquePhone = () => `+2556${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;

async function makeRider() {
  return prisma.user.create({
    data: { phone: uniquePhone(), pinHash: 'x', role: 'RIDER', name: 'Test Rider' },
  });
}

async function makeDistributor(businessName = 'Test Depot') {
  const user = await prisma.user.create({
    data: { phone: uniquePhone(), pinHash: 'x', role: 'DISTRIBUTOR', name: 'Depot Owner' },
  });
  const profile = await prisma.distributorProfile.create({
    data: { userId: user.id, businessName, region: 'Dar es Salaam', lat: -6.82, lng: 39.27 },
  });
  return { user, profile };
}

const silent = () => {};

beforeAll(async () => {
  await prisma.$connect();
});

describe('backfill — catalog', () => {
  it('creates the gas categories with an attribute schema', async () => {
    await backfillMarketplace({ log: silent });

    const refill = await prisma.category.findUnique({ where: { key: 'lpg_refill' } });
    expect(refill).not.toBeNull();
    expect(refill!.unitType).toBe('piece');

    const schema = refill!.attributeSchema as any;
    expect(schema.properties.brand).toBeDefined();
    expect(schema.properties.sizeKg).toBeDefined();
    expect(schema.required).toContain('brand');
  });

  it('maps a gas product onto its category and copies brand/size into attributes', async () => {
    const product = await makeProduct({ type: 'REFILL', brand: 'Taifa Gas', name: '6kg Refill', sizeKg: 6 });

    await backfillMarketplace({ log: silent });

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id }, include: { category: true },
    });
    expect(after.category?.key).toBe('lpg_refill');
    expect(after.attributes).toEqual({ brand: 'Taifa Gas', sizeKg: 6 });

    // The legacy columns must be untouched — phase 8 drops them, not phase 2.
    expect(after.brand).toBe('Taifa Gas');
    expect(after.sizeKg).toBe(6);
  });

  it('omits sizeKg for accessories so attributes match the category schema', async () => {
    const product = await makeProduct({ type: 'ACCESSORY', brand: 'Generic', name: 'Regulator', sizeKg: null });

    await backfillMarketplace({ log: silent });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { category: true } });
    expect(after.category?.key).toBe('lpg_accessory');
    expect(after.attributes).toEqual({ brand: 'Generic' });
    expect(after.attributes).not.toHaveProperty('sizeKg');
  });
});

describe('backfill — organizations', () => {
  it('turns a shop into a RETAILER org that can buy and sell', async () => {
    const { user, profile } = await makeSupplier();

    await backfillMarketplace({ log: silent });

    const after = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { org: true } });
    expect(after.org).not.toBeNull();
    expect(after.org!.kind).toBe('RETAILER');
    expect(after.org!.canSell).toBe(true);
    expect(after.org!.canBuy).toBe(true);   // a shop restocks from upstream
    expect(after.org!.currency).toBe('TZS');
    expect(after.org!.countryCode).toBe('TZ');

    // The owner is linked both ways.
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: after.orgId! } },
    });
    expect(membership?.role).toBe('OWNER');

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(owner.primaryOrgId).toBe(after.orgId);
  });

  it('turns a depot into a WHOLESALER org', async () => {
    const { profile } = await makeDistributor();

    await backfillMarketplace({ log: silent });

    const after = await prisma.distributorProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { org: true } });
    expect(after.org!.kind).toBe('WHOLESALER');
    expect(after.org!.canSell).toBe(true);
  });

  it('gives a rider a CARRIER org that can carry but not sell', async () => {
    const rider = await makeRider();

    await backfillMarketplace({ log: silent });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: rider.id }, include: { primaryOrg: true } });
    expect(after.primaryOrg!.kind).toBe('CARRIER');
    expect(after.primaryOrg!.canCarry).toBe(true);
    expect(after.primaryOrg!.canSell).toBe(false);
  });

  it('gives a household an INDIVIDUAL org so orders can always link org to org', async () => {
    const household = await makeHousehold();

    await backfillMarketplace({ log: silent });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: household.id }, include: { primaryOrg: true } });
    expect(after.primaryOrg!.kind).toBe('INDIVIDUAL');
    expect(after.primaryOrg!.canBuy).toBe(true);
    expect(after.primaryOrg!.canSell).toBe(false);
  });

  it('gives two shops with the same name distinct slugs', async () => {
    const a = await makeSupplier();
    const b = await makeSupplier();   // factory uses the same businessName

    await backfillMarketplace({ log: silent });

    const orgA = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: a.profile.id }, include: { org: true } });
    const orgB = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: b.profile.id }, include: { org: true } });

    expect(orgA.org!.slug).not.toBe(orgB.org!.slug);
    expect(orgA.org!.slug).toMatch(/^test-gas-shop/);
    expect(orgB.org!.slug).toMatch(/^test-gas-shop/);
  });
});

describe('backfill — offers', () => {
  it('converts retail inventory to an Offer in integer minor units', async () => {
    const { profile } = await makeSupplier();
    const product = await makeProduct({ name: '45kg Refill', sizeKg: 45 });
    await makeInventory(profile.id, product.id, { price: 45_000, stock: 7 });

    await backfillMarketplace({ log: silent });

    const shop = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const offer = await prisma.offer.findUniqueOrThrow({
      where: { sellerOrgId_productId: { sellerOrgId: shop.orgId!, productId: product.id } },
    });

    // 45 000 TZS stored as 4 500 000 minor units (TZS has two decimals).
    expect(offer.priceMinor).toBe(toMinor(45_000, 'TZS'));
    expect(offer.priceMinor).toBe(4_500_000);
    expect(offer.currency).toBe('TZS');
    expect(offer.stock).toBe(7);
    expect(offer.moq).toBe(1);          // retail has no minimum
  });

  it('converts wholesale stock to an Offer carrying a minimum order quantity', async () => {
    const { profile } = await makeDistributor('Wholesale Depot');
    const product = await makeProduct({ name: '15kg Wholesale' });
    await prisma.distributorStock.create({
      data: { distributorId: profile.id, productId: product.id, price: 38_000, stock: 200 },
    });

    await backfillMarketplace({ log: silent });

    const depot = await prisma.distributorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const offer = await prisma.offer.findUniqueOrThrow({
      where: { sellerOrgId_productId: { sellerOrgId: depot.orgId!, productId: product.id } },
    });

    expect(offer.priceMinor).toBe(3_800_000);
    expect(offer.stock).toBe(200);
    expect(offer.moq).toBeGreaterThan(1); // wholesale sells in bulk
  });

  it('keeps retail and wholesale offers for the same product separate', async () => {
    // The two tiers are different sellers, so both can list one product — which
    // is the whole point of splitting Offer from Product.
    const shop  = await makeSupplier();
    const depot = await makeDistributor('Dual Tier Depot');
    const product = await makeProduct({ name: 'Shared 15kg' });
    await makeInventory(shop.profile.id, product.id, { price: 45_000, stock: 5 });
    await prisma.distributorStock.create({
      data: { distributorId: depot.profile.id, productId: product.id, price: 38_000, stock: 100 },
    });

    await backfillMarketplace({ log: silent });

    const offers = await prisma.offer.findMany({ where: { productId: product.id } });
    expect(offers).toHaveLength(2);
    expect(offers.map(o => o.priceMinor).sort((a, b) => a - b)).toEqual([3_800_000, 4_500_000]);
  });
});

describe('backfill — idempotency', () => {
  it('is safe to run twice: no duplicate orgs, memberships or offers', async () => {
    const { user, profile } = await makeSupplier();
    const product = await makeProduct({ name: 'Idempotent 15kg' });
    await makeInventory(profile.id, product.id, { price: 50_000, stock: 4 });

    await backfillMarketplace({ log: silent });

    const afterFirst = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const orgId = afterFirst.orgId!;

    const secondRun = await backfillMarketplace({ log: silent });

    // Nothing left for the second pass to convert.
    expect(secondRun.retailerOrgs).toBe(0);
    expect(secondRun.products).toBe(0);

    const afterSecond = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(afterSecond.orgId).toBe(orgId);   // org was not recreated

    expect(await prisma.membership.count({ where: { userId: user.id, orgId } })).toBe(1);
    expect(await prisma.offer.count({ where: { sellerOrgId: orgId, productId: product.id } })).toBe(1);
  });

  it('refreshes price and stock on re-run rather than duplicating the offer', async () => {
    const { profile } = await makeSupplier();
    const product = await makeProduct({ name: 'Repriced 15kg' });
    const inv = await makeInventory(profile.id, product.id, { price: 40_000, stock: 10 });

    await backfillMarketplace({ log: silent });

    await prisma.inventory.update({ where: { id: inv.id }, data: { price: 52_000, stock: 3 } });
    await backfillMarketplace({ log: silent });

    const shop = await prisma.supplierProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const offers = await prisma.offer.findMany({ where: { sellerOrgId: shop.orgId!, productId: product.id } });

    expect(offers).toHaveLength(1);
    expect(offers[0].priceMinor).toBe(5_200_000);
    expect(offers[0].stock).toBe(3);
  });
});
