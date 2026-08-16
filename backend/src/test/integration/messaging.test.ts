/**
 * Pre-order conversations and the invoices that come out of them.
 *
 * The flow under test is the marketplace one: a buyer asks about a product, the
 * two sides agree, the seller raises an invoice, and payment is tracked to
 * settlement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { conversationsRouter, invoicesRouter } from '../../routes/messaging';
import { listingsRouter, checkImages } from '../../routes/listings';
import { seedCategories } from '../../services/categories';
import { serveRouter, type TestClient } from './httpHarness';

let chat: TestClient;
let bill: TestClient;
let sell: TestClient;
const silent = () => {};
const TAG = `cv${Date.now().toString(36)}`;

let seq = 0;
const phone = () => `+2553${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;
const tokenFor = (userId: string, role = 'SUPPLIER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });

async function makeParty(name: string, canSell: boolean) {
  const user = await prisma.user.create({ data: { phone: phone(), pinHash: 'x', role: 'HOUSEHOLD', name } });
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
  chat = await serveRouter('/api/messaging/conversations', conversationsRouter);
  bill = await serveRouter('/api/invoices', invoicesRouter);
  sell = await serveRouter('/api/listings', listingsRouter);
});

afterAll(async () => {
  await chat?.close(); await bill?.close(); await sell?.close();
});

describe('product images', () => {
  it('accepts up to four images', () => {
    expect(checkImages(['a', 'b', 'c', 'd'])).toBeNull();
    expect(checkImages(['a', 'b', 'c', 'd', 'e'])).toMatch(/At most 4/);
  });

  it('measures decoded bytes, not base64 length, and caps the gallery at 50 MB', () => {
    // ~40 MB decoded, well inside the limit.
    const fortyMb = 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((40 * 1024 * 1024 * 4) / 3));
    expect(checkImages([fortyMb])).toBeNull();

    // Two of them exceed it together, which is the point of a combined cap.
    const problem = checkImages([fortyMb, fortyMb]);
    expect(problem).toMatch(/50 MB/);
  });
});

describe('starting a conversation', () => {
  it('infers the seller from the product and notifies them', async () => {
    const seller = await makeParty('Invoice Seller', true);
    const buyer  = await makeParty('Curious Buyer', false);
    const cat = await prisma.category.findUniqueOrThrow({ where: { key: 'cookware' } });

    const p = await sell.post('/api/listings/products', {
      categoryId: cat.id, name: `${TAG} Steel Pot`, attributes: { brand: 'Generic' },
    }, seller.token);
    await sell.post('/api/listings/offers', { productId: p.body.product.id, price: 30_000, stock: 10 }, seller.token);

    const { status, body } = await chat.post('/api/messaging/conversations', {
      productId: p.body.product.id,
      body: 'Do you deliver 20 of these to Mwanza?',
    }, buyer.token);

    expect(status).toBe(201);
    expect(body.conversation.sellerOrgId).toBe(seller.org.id);
    expect(body.conversation.buyerOrgId).toBe(buyer.org.id);

    const notes = await prisma.notification.findMany({ where: { userId: seller.user.id, type: 'chat' } });
    expect(notes.length).toBeGreaterThan(0);
  });

  it('reuses the open thread instead of fragmenting the history', async () => {
    const seller = await makeParty('Reuse Seller', true);
    const buyer  = await makeParty('Reuse Buyer', false);

    const a = await chat.post('/api/messaging/conversations', { sellerOrgId: seller.org.id, body: 'first' }, buyer.token);
    const b = await chat.post('/api/messaging/conversations', { sellerOrgId: seller.org.id, body: 'second' }, buyer.token);

    expect(b.body.conversation.id).toBe(a.body.conversation.id);
    const msgs = await prisma.message.findMany({ where: { conversationId: a.body.conversation.id } });
    expect(msgs).toHaveLength(2);
  });

  it('refuses to let anyone read a thread they are not part of', async () => {
    const seller  = await makeParty('Private Seller', true);
    const buyer   = await makeParty('Private Buyer', false);
    const outsider = await makeParty('Nosy Party', false);

    const c = await chat.post('/api/messaging/conversations', { sellerOrgId: seller.org.id, body: 'private terms' }, buyer.token);

    const asOutsider = await chat.get(`/api/messaging/conversations/${c.body.conversation.id}`, outsider.token);
    expect(asOutsider.status).toBe(403);

    const asSeller = await chat.get(`/api/messaging/conversations/${c.body.conversation.id}`, seller.token);
    expect(asSeller.status).toBe(200);
  });

  it('will not let you message yourself', async () => {
    const solo = await makeParty('Solo Trader', true);
    const { status } = await chat.post('/api/messaging/conversations', { sellerOrgId: solo.org.id, body: 'hi me' }, solo.token);
    expect(status).toBe(400);
  });
});

describe('agreeing and invoicing', () => {
  async function thread() {
    const seller = await makeParty('Billing Seller', true);
    const buyer  = await makeParty('Billing Buyer', false);
    const c = await chat.post('/api/messaging/conversations', { sellerOrgId: seller.org.id, body: '50 bags please' }, buyer.token);
    return { seller, buyer, conversationId: c.body.conversation.id as string };
  }

  it('lets the seller invoice what was agreed, in minor units', async () => {
    const { seller, buyer, conversationId } = await thread();
    await chat.post(`/api/messaging/conversations/${conversationId}/agree`, {}, buyer.token);

    const { status, body } = await bill.post('/api/invoices', {
      conversationId,
      lines: [
        { description: 'Portland cement 50kg', qty: 50, unitPrice: 19_000 },
        { description: 'Loading',              qty: 1,  unitPrice: 15_000 },
      ],
      deliveryFee: 60_000,
    }, seller.token);

    expect(status).toBe(201);
    const inv = body.invoice;
    expect(inv.number).toMatch(/^INV-/);
    expect(inv.status).toBe('SENT');
    // 50 x 19 000 + 15 000 = 965 000 subtotal, + 60 000 delivery = 1 025 000
    expect(inv.subtotalMinor).toBe(96_500_000);
    expect(inv.totalMinor).toBe(102_500_000);
    expect(inv.total).toBe(1_025_000);

    // The stored total must equal the sum of the printed lines.
    const lineSum = (inv.lines as any[]).reduce((n, l) => n + l.lineTotalMinor, 0);
    expect(lineSum + inv.deliveryMinor + inv.taxMinor).toBe(inv.totalMinor);

    const seen = await prisma.notification.findMany({ where: { userId: buyer.user.id, type: 'payment' } });
    expect(seen.some(n => n.title.includes('Invoice'))).toBe(true);
    expect(seller).toBeTruthy();
  });

  it('refuses to let the buyer invoice themselves', async () => {
    const { buyer, conversationId } = await thread();
    const { status } = await bill.post('/api/invoices', {
      conversationId, lines: [{ description: 'x', qty: 1, unitPrice: 1 }],
    }, buyer.token);
    expect(status).toBe(403);
  });

  it('tracks settlement, and only the payee may confirm it', async () => {
    const { seller, buyer, conversationId } = await thread();
    const created = await bill.post('/api/invoices', {
      conversationId, lines: [{ description: 'Goods', qty: 2, unitPrice: 5_000 }],
    }, seller.token);
    const id = created.body.invoice.id;

    // A buyer saying "I paid" is not evidence money arrived.
    const byBuyer = await bill.post(`/api/invoices/${id}/paid`, {}, buyer.token);
    expect(byBuyer.status).toBe(403);

    const bySeller = await bill.post(`/api/invoices/${id}/paid`, { paymentRef: 'MPESA123' }, seller.token);
    expect(bySeller.status).toBe(200);
    expect(bySeller.body.invoice.status).toBe('PAID');
    expect(bySeller.body.invoice.paymentRef).toBe('MPESA123');

    const again = await bill.post(`/api/invoices/${id}/paid`, {}, seller.token);
    expect(again.status).toBe(409);
  });

  it('reports what is still owed, so unpaid threads are one filter away', async () => {
    const { seller, conversationId } = await thread();
    await bill.post('/api/invoices', { conversationId, lines: [{ description: 'Unpaid goods', qty: 1, unitPrice: 7_000 }] }, seller.token);

    const { body } = await bill.get('/api/invoices?role=seller&status=SENT', seller.token);

    expect(body.invoices.length).toBeGreaterThan(0);
    expect(body.invoices.every((i: any) => i.isPaid === false)).toBe(true);
    expect(body.unpaidTotalMinor).toBeGreaterThan(0);
    // Each unpaid invoice carries its thread, which is what "track supplier
    // chats until payment completes" needs.
    expect(body.invoices.every((i: any) => i.conversationId)).toBe(true);
  });
});
