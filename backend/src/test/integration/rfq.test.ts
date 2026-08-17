/**
 * Request for quotation.
 *
 * The load-bearing property is that RFQ and freight share one Quote model: a
 * bid carries either an rfqId or a loadId, never both, and the unique
 * constraints on each pair must not collide.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { rfqRouter } from '../../routes/rfq';
import { seedCategories } from '../../services/categories';
import { serveRouter, type TestClient } from './httpHarness';

let api: TestClient;
const silent = () => {};
let seq = 0;
const phone = () => `+2551${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;
const tokenFor = (userId: string) => jwt.sign({ userId, role: 'SUPPLIER' }, process.env.JWT_SECRET!, { expiresIn: '1h' });

async function party(name: string, canSell: boolean) {
  const user = await prisma.user.create({ data: { phone: phone(), pinHash: 'x', role: canSell ? 'SUPPLIER' : 'HOUSEHOLD', name } });
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

beforeAll(async () => {
  await prisma.$connect();
  await seedCategories(silent);
  api = await serveRouter('/api/rfq', rfqRouter);
});
afterAll(async () => { await api?.close(); });

describe('posting a request', () => {
  it('stores the budget in minor units and returns it in major', async () => {
    const buyer = await party('RFQ Buyer', false);
    const cat = await prisma.category.findUniqueOrThrow({ where: { key: 'cement' } });

    const { status, body } = await api.post('/api/rfq', {
      title: 'Portland cement, 500 bags',
      categoryId: cat.id, qty: 500, unit: 'bag', target: 9_500_000,
      spec: '42.5N, delivered to Mwanza',
    }, buyer.token);

    expect(status).toBe(201);
    expect(body.rfq.reference).toMatch(/^RFQ-/);
    expect(body.rfq.status).toBe('OPEN');
    expect(body.rfq.targetMinor).toBe(950_000_000);   // TZS has two decimals
    expect(body.rfq.target).toBe(9_500_000);
    expect(new Date(body.rfq.closesAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('bidding', () => {
  async function openRfq() {
    const buyer = await party('Bid Buyer', false);
    const r = await api.post('/api/rfq', { title: 'Need 100 hoodies', qty: 100 }, buyer.token);
    return { buyer, rfqId: r.body.rfq.id as string };
  }

  it('lets a seller quote and notifies the buyer', async () => {
    const { buyer, rfqId } = await openRfq();
    const seller = await party('Bid Seller', true);

    const { status, body } = await api.post(`/api/rfq/${rfqId}/quotes`, {
      amount: 1_200_000, leadDays: 10, message: 'Ex-Dar, 10 days',
    }, seller.token);

    expect(status).toBe(201);
    expect(body.quote.amountMinor).toBe(120_000_000);
    expect(body.quote.amount).toBe(1_200_000);
    expect(body.quote.status).toBe('PENDING');

    // First bid moves the request out of OPEN so the buyer sees activity.
    const after = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
    expect(after.status).toBe('QUOTED');

    const seen = await prisma.notification.findMany({ where: { userId: buyer.user.id, type: 'rfq' } });
    expect(seen.length).toBeGreaterThan(0);
  });

  it('replaces a seller previous bid rather than stacking another', async () => {
    const { rfqId } = await openRfq();
    const seller = await party('Rebid Seller', true);

    await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 900_000 }, seller.token);
    await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 850_000 }, seller.token);

    const quotes = await prisma.quote.findMany({ where: { rfqId } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].amountMinor).toBe(85_000_000);
  });

  it('refuses a bid from an organization that cannot sell, and self-bidding', async () => {
    const { buyer, rfqId } = await openRfq();
    const notSeller = await party('Browser Only', false);

    expect((await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 100 }, notSeller.token)).status).toBe(403);
    expect((await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 100 }, buyer.token)).status).toBe(400);
  });

  it('hides rival bids from sellers but shows the buyer all of them', async () => {
    const { buyer, rfqId } = await openRfq();
    const a = await party('Seller A', true);
    const b = await party('Seller B', true);
    await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 700_000 }, a.token);
    await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 800_000 }, b.token);

    const asBuyer  = await api.get(`/api/rfq/${rfqId}`, buyer.token);
    const asSeller = await api.get(`/api/rfq/${rfqId}`, a.token);

    expect(asBuyer.body.isBuyer).toBe(true);
    expect(asBuyer.body.rfq.quotes).toHaveLength(2);
    // A seller seeing rivals' prices turns the board into a price-fixing signal.
    expect(asSeller.body.isBuyer).toBe(false);
    expect(asSeller.body.rfq.quotes).toHaveLength(1);
    expect(asSeller.body.quoteCount).toBe(2);
  });
});

describe('awarding', () => {
  it('accepts one bid, rejects the rest, and only the buyer may do it', async () => {
    const buyer = await party('Award Buyer', false);
    const winner = await party('Cheap Seller', true);
    const loser  = await party('Pricey Seller', true);

    const r = await api.post('/api/rfq', { title: 'Need 40 solar kits', qty: 40 }, buyer.token);
    const rfqId = r.body.rfq.id;
    const cheap = await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 500_000 }, winner.token);
    await api.post(`/api/rfq/${rfqId}/quotes`, { amount: 750_000 }, loser.token);

    // A seller cannot award themselves the job.
    expect((await api.post(`/api/rfq/quotes/${cheap.body.quote.id}/accept`, {}, winner.token)).status).toBe(403);

    const awarded = await api.post(`/api/rfq/quotes/${cheap.body.quote.id}/accept`, {}, buyer.token);
    expect(awarded.status).toBe(200);
    expect(awarded.body.rfq.status).toBe('AWARDED');

    const quotes = await prisma.quote.findMany({ where: { rfqId } });
    expect(quotes.find(q => q.bidderOrgId === winner.org.id)!.status).toBe('ACCEPTED');
    expect(quotes.find(q => q.bidderOrgId === loser.org.id)!.status).toBe('REJECTED');

    // Awarding twice is refused.
    expect((await api.post(`/api/rfq/quotes/${cheap.body.quote.id}/accept`, {}, buyer.token)).status).toBe(409);
  });
});

describe('sharing Quote with freight', () => {
  it('an RFQ bid carries rfqId and no loadId, so the two boards never collide', async () => {
    const buyer  = await party('Shape Buyer', false);
    const seller = await party('Shape Seller', true);
    const r = await api.post('/api/rfq', { title: 'Shape check', qty: 1 }, buyer.token);
    const q = await api.post(`/api/rfq/${r.body.rfq.id}/quotes`, { amount: 1_000 }, seller.token);

    const row = await prisma.quote.findUniqueOrThrow({ where: { id: q.body.quote.id } });
    expect(row.rfqId).toBe(r.body.rfq.id);
    expect(row.loadId).toBeNull();
  });
});
