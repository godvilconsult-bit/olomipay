/**
 * Public storefront API tests.
 *
 * The headline behaviour: anyone can browse without a token, and one product
 * page lists every seller who offers it, cheapest first. That is the marketplace
 * dynamic the gas app never had.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { catalogRouter } from '../../routes/catalog';
import { backfillMarketplace } from '../../services/backfill';
import { serveRouter, type TestClient } from './httpHarness';
import { makeSupplier, makeProduct, makeInventory } from './factories';

let api: TestClient;
const silent = () => {};

/** Unique token so assertions ignore rows other test files created. */
const TAG = `zz${Date.now().toString(36)}`;

beforeAll(async () => {
  await prisma.$connect();
  api = await serveRouter('/api/catalog', catalogRouter);
});

afterAll(async () => {
  await api?.close();
});

describe('GET /categories', () => {
  it('returns the category tree without a token', async () => {
    await backfillMarketplace({ log: silent });

    const { status, body } = await api.get('/api/catalog/categories');

    expect(status).toBe(200);
    const keys = body.flat.map((c: any) => c.key);
    expect(keys).toContain('lpg_refill');
    expect(keys).toContain('lpg_accessory');

    const refill = body.flat.find((c: any) => c.key === 'lpg_refill');
    expect(refill.attributeSchema.properties.brand).toBeDefined();
  });
});

describe('GET /products', () => {
  it('lists a product with its cheapest offer and seller count', async () => {
    const shop = await makeSupplier();
    const product = await makeProduct({ name: `${TAG} Solo Refill`, brand: 'Oryx' });
    await makeInventory(shop.profile.id, product.id, { price: 45_000, stock: 5 });
    await backfillMarketplace({ log: silent });

    const { status, body } = await api.get(`/api/catalog/products?q=${TAG}%20Solo`);

    expect(status).toBe(200);
    expect(body.total).toBe(1);
    const row = body.products[0];
    expect(row.name).toBe(`${TAG} Solo Refill`);
    expect(row.sellerCount).toBe(1);
    // Minor units and major units are both exposed so a client never guesses.
    expect(row.from.priceMinor).toBe(4_500_000);
    expect(row.from.price).toBe(45_000);
    expect(row.from.currency).toBe('TZS');
    expect(row.attributes.brand).toBe('Oryx');
  });

  it('hides products nobody is selling — a catalog entry is not merchandise', async () => {
    await makeProduct({ name: `${TAG} Phantom Item` });
    await backfillMarketplace({ log: silent });

    const { body } = await api.get(`/api/catalog/products?q=${TAG}%20Phantom`);

    expect(body.total).toBe(0);
  });

  it('hides out-of-stock offers by default and reveals them on request', async () => {
    const shop = await makeSupplier();
    const product = await makeProduct({ name: `${TAG} Sold Out` });
    await makeInventory(shop.profile.id, product.id, { price: 30_000, stock: 0 });
    await backfillMarketplace({ log: silent });

    const hidden = await api.get(`/api/catalog/products?q=${TAG}%20Sold`);
    expect(hidden.body.total).toBe(0);

    const shown = await api.get(`/api/catalog/products?q=${TAG}%20Sold&inStock=false`);
    expect(shown.body.total).toBe(1);
  });

  it('filters by category and by brand attribute', async () => {
    const shop = await makeSupplier();
    const gas = await makeProduct({ name: `${TAG} Filter Gas`, brand: 'Taifa Gas', type: 'REFILL' });
    const acc = await makeProduct({ name: `${TAG} Filter Acc`, brand: 'Camel', type: 'ACCESSORY', sizeKg: null });
    await makeInventory(shop.profile.id, gas.id, { price: 40_000, stock: 3 });
    await makeInventory(shop.profile.id, acc.id, { price: 10_000, stock: 3 });
    await backfillMarketplace({ log: silent });

    const byCategory = await api.get(`/api/catalog/products?q=${TAG}%20Filter&category=lpg_accessory`);
    expect(byCategory.body.total).toBe(1);
    expect(byCategory.body.products[0].name).toContain('Filter Acc');

    const byBrand = await api.get(`/api/catalog/products?q=${TAG}%20Filter&brand=Taifa%20Gas`);
    expect(byBrand.body.total).toBe(1);
    expect(byBrand.body.products[0].name).toContain('Filter Gas');
  });

  it('sorts by price and reports brand facets', async () => {
    const shop = await makeSupplier();
    const cheap = await makeProduct({ name: `${TAG} Sort Cheap`, brand: 'BrandLow' });
    const dear  = await makeProduct({ name: `${TAG} Sort Dear`,  brand: 'BrandHigh' });
    await makeInventory(shop.profile.id, cheap.id, { price: 12_000, stock: 4 });
    await makeInventory(shop.profile.id, dear.id,  { price: 90_000, stock: 4 });
    await backfillMarketplace({ log: silent });

    const asc = await api.get(`/api/catalog/products?q=${TAG}%20Sort&sort=price_asc`);
    expect(asc.body.products.map((p: any) => p.from.price)).toEqual([12_000, 90_000]);

    const desc = await api.get(`/api/catalog/products?q=${TAG}%20Sort&sort=price_desc`);
    expect(desc.body.products.map((p: any) => p.from.price)).toEqual([90_000, 12_000]);

    const brands = asc.body.facets.brands.map((b: any) => b.name);
    expect(brands).toContain('BrandLow');
    expect(brands).toContain('BrandHigh');
  });

  it('applies a price range using the currency exponent, not a hardcoded x100', async () => {
    const shop = await makeSupplier();
    const p = await makeProduct({ name: `${TAG} Range Item` });
    await makeInventory(shop.profile.id, p.id, { price: 50_000, stock: 2 });
    await backfillMarketplace({ log: silent });

    const inside  = await api.get(`/api/catalog/products?q=${TAG}%20Range&min=40000&max=60000`);
    const outside = await api.get(`/api/catalog/products?q=${TAG}%20Range&min=60000`);

    expect(inside.body.total).toBe(1);
    expect(outside.body.total).toBe(0);
  });

  it('rejects a limit beyond the cap rather than dumping the catalog', async () => {
    const { status } = await api.get('/api/catalog/products?limit=5000');
    expect(status).toBe(400);
  });
});

describe('GET /products/:id — competing offers', () => {
  it('lists every seller of one product, cheapest first', async () => {
    // This is the whole reason Offer is split from Product.
    const a = await makeSupplier();
    const b = await makeSupplier();
    const c = await makeSupplier();
    const product = await makeProduct({ name: `${TAG} Contested 15kg` });
    await makeInventory(a.profile.id, product.id, { price: 47_000, stock: 5 });
    await makeInventory(b.profile.id, product.id, { price: 43_000, stock: 5 });
    await makeInventory(c.profile.id, product.id, { price: 51_000, stock: 5 });
    await backfillMarketplace({ log: silent });

    const { status, body } = await api.get(`/api/catalog/products/${product.id}`);

    expect(status).toBe(200);
    expect(body.product.sellerCount).toBe(3);
    expect(body.product.offers.map((o: any) => o.price)).toEqual([43_000, 47_000, 51_000]);
    expect(body.product.from.price).toBe(43_000);

    // Each offer carries who is selling it, so the page can rank on trust too.
    const top = body.product.offers[0];
    expect(top.seller.slug).toBeTruthy();
    expect(top.seller.kind).toBe('RETAILER');
    expect(top.inStock).toBe(true);
  });

  it('404s on an unknown product', async () => {
    const { status } = await api.get('/api/catalog/products/does-not-exist');
    expect(status).toBe(404);
  });
});

describe('GET /sellers', () => {
  it('serves a storefront by slug with its listings', async () => {
    const shop = await makeSupplier();
    const product = await makeProduct({ name: `${TAG} Storefront Item` });
    await makeInventory(shop.profile.id, product.id, { price: 33_000, stock: 6 });
    await backfillMarketplace({ log: silent });

    const org = await prisma.supplierProfile
      .findUniqueOrThrow({ where: { id: shop.profile.id }, include: { org: true } });

    const { status, body } = await api.get(`/api/catalog/sellers/${org.org!.slug}`);

    expect(status).toBe(200);
    expect(body.seller.kind).toBe('RETAILER');
    expect(body.seller.canSell).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);

    const listing = body.listings.find((l: any) => l.product.name === `${TAG} Storefront Item`);
    expect(listing).toBeDefined();
    expect(listing.offer.price).toBe(33_000);
  });

  it('lists sellers in a directory, wholesalers filterable from retailers', async () => {
    await makeSupplier();
    await backfillMarketplace({ log: silent });

    const { status, body } = await api.get('/api/catalog/sellers?kind=RETAILER');

    expect(status).toBe(200);
    expect(body.sellers.length).toBeGreaterThan(0);
    expect(body.sellers.every((s: any) => s.kind === 'RETAILER')).toBe(true);
  });

  it('404s on an unknown storefront', async () => {
    const { status } = await api.get('/api/catalog/sellers/no-such-shop');
    expect(status).toBe(404);
  });
});
