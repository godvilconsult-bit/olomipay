/**
 * Seller listings — the feature that makes the marketplace general.
 *
 * The load-bearing test is the last one: a seller creates a product in a
 * non-gas category and it appears in the public catalog. Before this existed,
 * the storefront could only ever show LPG, because there was no way to bring
 * any other product into existence.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { listingsRouter } from '../../routes/listings';
import { catalogRouter } from '../../routes/catalog';
import { seedCategories } from '../../services/categories';
import { serveRouter, type TestClient } from './httpHarness';

let api: TestClient;
let shop: TestClient;
const silent = () => {};
const TAG = `ml${Date.now().toString(36)}`;

let seq = 0;
const phone = () => `+2554${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;

/** requireAuth reads a Bearer JWT of { userId, role }, same as the socket layer. */
function tokenFor(userId: string, role = 'SUPPLIER') {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

async function makeSellerAccount(name: string, canSell = true) {
  const user = await prisma.user.create({ data: { phone: phone(), pinHash: 'x', role: 'SUPPLIER', name } });
  const org  = await prisma.organization.create({
    data: {
      name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${seq++}`,
      kind: canSell ? 'RETAILER' : 'INDIVIDUAL',
      canBuy: true, canSell, canCarry: false, currency: 'TZS',
    },
  });
  await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: 'OWNER' } });
  await prisma.user.update({ where: { id: user.id }, data: { primaryOrgId: org.id } });
  return { user, org, token: tokenFor(user.id) };
}

async function categoryByKey(key: string) {
  return prisma.category.findUniqueOrThrow({ where: { key } });
}

beforeAll(async () => {
  await prisma.$connect();
  await seedCategories(silent);
  api  = await serveRouter('/api/listings', listingsRouter);
  shop = await serveRouter('/api/catalog',  catalogRouter);
});

afterAll(async () => {
  await api?.close();
  await shop?.close();
});

describe('the category tree is not gas-only', () => {
  it('offers categories well beyond LPG', async () => {
    const seller = await makeSellerAccount('Cat Lister');
    const { status, body } = await api.get('/api/listings/categories', seller.token);

    expect(status).toBe(200);
    const keys = body.categories.map((c: any) => c.key);

    // Gas survives as one branch among many.
    expect(keys).toContain('lpg_refill');
    // ...alongside genuinely unrelated verticals.
    expect(keys).toContain('phones');
    expect(keys).toContain('cement');
    expect(keys).toContain('cooking_oil');
    expect(keys).toContain('clothing');
    expect(keys.length).toBeGreaterThan(10);
  });

  it('shows each leaf with its parent, so the picker reads sensibly', async () => {
    const seller = await makeSellerAccount('Path Lister');
    const { body } = await api.get('/api/listings/categories', seller.token);
    const phones = body.categories.find((c: any) => c.key === 'phones');
    expect(phones.path).toBe('Electronics › Phones & Tablets');
  });
});

describe('creating a product', () => {
  it('lets a seller create a product in any category', async () => {
    const seller = await makeSellerAccount('Gadget Shop');
    const phones = await categoryByKey('phones');

    const { status, body } = await api.post('/api/listings/products', {
      categoryId: phones.id,
      name: `${TAG} Smartphone X`,
      attributes: { brand: 'Tecno', model: 'Spark 20', storageGb: 128 },
    }, seller.token);

    expect(status).toBe(201);
    expect(body.product.name).toBe(`${TAG} Smartphone X`);
    expect(body.product.categoryId).toBe(phones.id);
    expect(body.product.attributes).toEqual({ brand: 'Tecno', model: 'Spark 20', storageGb: 128 });
  });

  it('enforces the attributes the category declares', async () => {
    const seller = await makeSellerAccount('Sloppy Shop');
    const cement = await categoryByKey('cement');

    const missing = await api.post('/api/listings/products', {
      categoryId: cement.id, name: `${TAG} Mystery Cement`, attributes: {},
    }, seller.token);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/brand/i);

    const wrongType = await api.post('/api/listings/products', {
      categoryId: cement.id, name: `${TAG} Odd Cement`, attributes: { brand: 'Twiga', weightKg: 'fifty' },
    }, seller.token);
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toMatch(/number/i);
  });

  it('refuses a seller-only action from an organization that cannot sell', async () => {
    const buyer = await makeSellerAccount('Just A Buyer', false);
    const phones = await categoryByKey('phones');

    const { status } = await api.post('/api/listings/products', {
      categoryId: phones.id, name: `${TAG} Nope`, attributes: { brand: 'X' },
    }, buyer.token);

    expect(status).toBe(403);
  });

  it('requires a token at all', async () => {
    const { status } = await api.post('/api/listings/products', { categoryId: 'x', name: 'y' });
    expect(status).toBe(401);
  });
});

describe('offering it for sale', () => {
  it('stores the typed price in integer minor units', async () => {
    const seller = await makeSellerAccount('Oil Trader');
    const oil = await categoryByKey('cooking_oil');

    const created = await api.post('/api/listings/products', {
      categoryId: oil.id, name: `${TAG} Sunflower Oil 5L`, attributes: { brand: 'Korie', volumeL: 5 },
    }, seller.token);

    const { status, body } = await api.post('/api/listings/offers', {
      productId: created.body.product.id, price: 22_500, stock: 40,
    }, seller.token);

    expect(status).toBe(201);
    expect(body.offer.priceMinor).toBe(2_250_000);   // TZS has two decimals
    expect(body.offer.price).toBe(22_500);
    expect(body.offer.currency).toBe('TZS');
  });

  it('updates rather than duplicating when the same product is re-listed', async () => {
    const seller = await makeSellerAccount('Repricer');
    const cat = await categoryByKey('cookware');
    const p = await api.post('/api/listings/products', {
      categoryId: cat.id, name: `${TAG} Frying Pan`, attributes: { brand: 'Generic' },
    }, seller.token);

    await api.post('/api/listings/offers', { productId: p.body.product.id, price: 12_000, stock: 5 }, seller.token);
    await api.post('/api/listings/offers', { productId: p.body.product.id, price: 9_500,  stock: 2 }, seller.token);

    const mine = await api.get('/api/listings/mine', seller.token);
    const rows = mine.body.listings.filter((l: any) => l.product.name === `${TAG} Frying Pan`);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(9_500);
    expect(rows[0].stock).toBe(2);
  });

  it('lets a seller withdraw a listing, and only their own', async () => {
    const owner  = await makeSellerAccount('Owner Shop');
    const other  = await makeSellerAccount('Other Shop');
    const cat = await categoryByKey('tools');
    const p = await api.post('/api/listings/products', {
      categoryId: cat.id, name: `${TAG} Hammer`, attributes: { brand: 'Stanley' },
    }, owner.token);
    const offer = await api.post('/api/listings/offers', { productId: p.body.product.id, price: 8_000, stock: 3 }, owner.token);

    const forbidden = await api.del(`/api/listings/offers/${offer.body.offer.id}`, other.token);
    expect(forbidden.status).toBe(403);

    const ok = await api.del(`/api/listings/offers/${offer.body.offer.id}`, owner.token);
    expect(ok.status).toBe(200);
  });
});

describe('end to end: a non-gas product reaches the public storefront', () => {
  it('appears in the public catalog under its own category, with no gas involved', async () => {
    const seller = await makeSellerAccount('General Store');
    const cement = await categoryByKey('cement');

    const product = await api.post('/api/listings/products', {
      categoryId: cement.id,
      name: `${TAG} Portland Cement 50kg`,
      attributes: { brand: 'Twiga', weightKg: 50, grade: '42.5N' },
    }, seller.token);

    await api.post('/api/listings/offers', {
      productId: product.body.product.id, price: 19_000, stock: 200, moq: 10,
    }, seller.token);

    // Now browse it the way any anonymous visitor would — no token.
    const browse = await shop.get(`/api/catalog/products?q=${TAG}%20Portland`);

    expect(browse.status).toBe(200);
    expect(browse.body.total).toBe(1);
    const row = browse.body.products[0];
    expect(row.name).toBe(`${TAG} Portland Cement 50kg`);
    expect(row.category.key).toBe('cement');
    expect(row.from.price).toBe(19_000);
    expect(row.attributes.grade).toBe('42.5N');

    // And filtering by the new category works, proving the tree is live.
    const byCat = await shop.get(`/api/catalog/products?q=${TAG}&category=cement`);
    expect(byCat.body.total).toBe(1);
  });
});
