/**
 * Buyer ↔ seller conversations, and the invoices that come out of them.
 *
 * The existing ChatMessage is scoped to an Order — it only exists once someone
 * has already bought. This is the conversation that happens *before*: ask about
 * specs, agree a price and quantity, then the seller raises an invoice.
 *
 * Two routers live here because the invoice is the outcome of the thread; they
 * share the access rules and splitting them would duplicate that logic.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { actingOrgId } from '../services/freight';
import { toMinor, fromMinor } from '../lib/money';
import { makeOrderNo } from '../lib/ids';
import { notify } from '../services/notify';
import { emitToUser } from '../socket';

const conversations = Router();
const invoices      = Router();

const handle = (res: any, e: any) =>
  res.status(e?.http ?? 500).json({ error: e?.message ?? 'Request failed' });

/** Everyone who should be notified of activity in an org (its members). */
async function memberUserIds(orgId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { orgId }, select: { userId: true } });
  return rows.map(r => r.userId);
}

/** A thread is visible only to its two organizations. */
async function loadThreadFor(userId: string, conversationId: string) {
  const orgId = await actingOrgId(userId);
  const convo = await prisma.conversation.findUnique({
    where:   { id: conversationId },
    include: {
      buyer:   { select: { id: true, name: true, slug: true } },
      seller:  { select: { id: true, name: true, slug: true } },
      product: { select: { id: true, name: true, imageUrl: true } },
    },
  });
  if (!convo) throw Object.assign(new Error('Conversation not found'), { http: 404 });
  if (convo.buyerOrgId !== orgId && convo.sellerOrgId !== orgId) {
    throw Object.assign(new Error('Not your conversation'), { http: 403 });
  }
  return { convo, orgId, isSeller: convo.sellerOrgId === orgId };
}

// ── POST /api/messaging/conversations ─ start or reuse a thread ──────────────
conversations.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    sellerOrgId: z.string().optional(),
    productId:   z.string().optional(),
    subject:     z.string().trim().max(140).optional(),
    body:        z.string().trim().min(1).max(4_000),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { productId, subject, body } = parse.data as { productId?: string; subject?: string; body: string };

  try {
    const buyerOrgId = await actingOrgId(req.userId!);

    // The seller can be named directly, or inferred from the product being
    // asked about — the common case, since buyers arrive from a product page.
    let sellerOrgId = parse.data.sellerOrgId;
    if (!sellerOrgId && productId) {
      const offer = await prisma.offer.findFirst({
        where: { productId, isAvailable: true }, orderBy: { priceMinor: 'asc' }, select: { sellerOrgId: true },
      });
      sellerOrgId = offer?.sellerOrgId;
    }
    if (!sellerOrgId) return res.status(400).json({ error: 'No seller to message' });
    if (sellerOrgId === buyerOrgId) return res.status(400).json({ error: 'You cannot message yourself' });

    // Reuse an open thread about the same product rather than fragmenting the
    // history across many one-message conversations.
    let convo = await prisma.conversation.findFirst({
      where: { buyerOrgId, sellerOrgId, productId: productId ?? null, status: { not: 'CLOSED' } },
    });
    if (!convo) {
      convo = await prisma.conversation.create({
        data: { buyerOrgId, sellerOrgId, productId: productId ?? null, subject },
      });
    }

    const message = await prisma.message.create({
      data: { conversationId: convo.id, senderUserId: req.userId!, body },
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });

    for (const uid of await memberUserIds(sellerOrgId)) {
      emitToUser(uid, 'conversation:message', { conversationId: convo.id, message });
      await notify(uid, {
        title: 'New enquiry 💬',
        body:  body.slice(0, 120),
        type:  'chat',
        data:  { conversationId: convo.id },
      });
    }

    res.status(201).json({ conversation: convo, message });
  } catch (e) { handle(res, e); }
});

// ── GET /api/messaging/conversations ─ my threads ────────────────────────────
conversations.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = await actingOrgId(req.userId!);
    const rows = await prisma.conversation.findMany({
      where:   { OR: [{ buyerOrgId: orgId }, { sellerOrgId: orgId }] },
      orderBy: { lastMessageAt: 'desc' },
      take:    100,
      include: {
        buyer:    { select: { id: true, name: true, slug: true } },
        seller:   { select: { id: true, name: true, slug: true } },
        product:  { select: { id: true, name: true, imageUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count:   { select: { invoices: true } },
      },
    });

    res.json({
      orgId,
      conversations: rows.map(c => ({
        id: c.id, status: c.status, subject: c.subject,
        lastMessageAt: c.lastMessageAt,
        // "Who am I talking to" is the useful field, not buyer/seller.
        counterparty: c.sellerOrgId === orgId ? c.buyer : c.seller,
        iAmSeller: c.sellerOrgId === orgId,
        product: c.product,
        lastMessage: c.messages[0] ?? null,
        invoiceCount: c._count.invoices,
        unread: c.messages[0] && !c.messages[0].readAt && c.messages[0].senderUserId !== req.userId,
      })),
    });
  } catch (e) { handle(res, e); }
});

// ── GET /api/messaging/conversations/:id ─ the thread ────────────────────────
conversations.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { convo, orgId, isSeller } = await loadThreadFor(req.userId!, req.params.id);
    const messages = await prisma.message.findMany({
      where: { conversationId: convo.id }, orderBy: { createdAt: 'asc' }, take: 500,
    });

    // Mark the other side's messages read on open.
    await prisma.message.updateMany({
      where: { conversationId: convo.id, senderUserId: { not: req.userId! }, readAt: null },
      data:  { readAt: new Date() },
    });

    const invoiceRows = await prisma.invoice.findMany({
      where: { conversationId: convo.id }, orderBy: { issuedAt: 'desc' },
    });

    res.json({
      conversation: {
        id: convo.id, status: convo.status, subject: convo.subject, product: convo.product,
        counterparty: isSeller ? convo.buyer : convo.seller,
        iAmSeller: isSeller,
      },
      me: req.userId,
      orgId,
      messages,
      invoices: invoiceRows.map(i => ({ ...i, total: fromMinor(i.totalMinor, i.currency) })),
    });
  } catch (e) { handle(res, e); }
});

// ── POST /api/messaging/conversations/:id/messages ───────────────────────────
conversations.post('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ body: z.string().trim().min(1).max(4_000) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const { convo, orgId } = await loadThreadFor(req.userId!, req.params.id);
    const message = await prisma.message.create({
      data: { conversationId: convo.id, senderUserId: req.userId!, body: parse.data.body! },
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });

    const otherOrgId = convo.buyerOrgId === orgId ? convo.sellerOrgId : convo.buyerOrgId;
    for (const uid of await memberUserIds(otherOrgId)) {
      emitToUser(uid, 'conversation:message', { conversationId: convo.id, message });
      await notify(uid, { title: 'New message 💬', body: parse.data.body!.slice(0, 120), type: 'chat', data: { conversationId: convo.id } });
    }

    res.status(201).json({ message });
  } catch (e) { handle(res, e); }
});

// ── POST /api/messaging/conversations/:id/agree ──────────────────────────────
// Marks terms settled. The seller can then raise an invoice against the thread.
conversations.post('/:id/agree', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { convo } = await loadThreadFor(req.userId!, req.params.id);
    const updated = await prisma.conversation.update({ where: { id: convo.id }, data: { status: 'AGREED' } });
    res.json({ conversation: updated });
  } catch (e) { handle(res, e); }
});

// ── POST /api/invoices ─ the seller bills what was agreed ────────────────────
invoices.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    conversationId: z.string(),
    lines: z.array(z.object({
      description: z.string().trim().min(1).max(200),
      qty:         z.coerce.number().positive(),
      unitPrice:   z.coerce.number().nonnegative(),   // major units, as typed
    })).min(1).max(50),
    deliveryFee: z.coerce.number().nonnegative().default(0),
    tax:         z.coerce.number().nonnegative().default(0),
    currency:    z.string().length(3).optional(),
    dueAt:       z.coerce.date().optional(),
    notes:       z.string().trim().max(1_000).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { conversationId, lines, deliveryFee, tax, dueAt, notes } = parse.data as any;

  try {
    const { convo, orgId, isSeller } = await loadThreadFor(req.userId!, conversationId);
    if (!isSeller) return res.status(403).json({ error: 'Only the seller can raise an invoice' });

    const org = await prisma.organization.findUniqueOrThrow({
      where:   { id: orgId },
      include: { supplierProfile: { select: { payProvider: true, payNumber: true, payName: true } } },
    });
    const currency = parse.data.currency ?? org.currency;

    // Snapshot the lines in minor units. Rounding happens once, per line, so the
    // stored total always equals the sum of what is printed.
    const priced = lines.map((l: any) => {
      const unitPriceMinor = toMinor(l.unitPrice, currency);
      return {
        description: l.description,
        qty: l.qty,
        unitPriceMinor,
        lineTotalMinor: Math.round(unitPriceMinor * l.qty),
      };
    });
    const subtotalMinor = priced.reduce((n: number, l: any) => n + l.lineTotalMinor, 0);
    const deliveryMinor = toMinor(deliveryFee, currency);
    const taxMinor      = toMinor(tax, currency);

    const pay = org.supplierProfile;
    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-${makeOrderNo()}`,
        sellerOrgId: orgId,
        buyerOrgId:  convo.buyerOrgId,
        conversationId: convo.id,
        currency,
        lines: priced as any,
        subtotalMinor, deliveryMinor, taxMinor,
        totalMinor: subtotalMinor + deliveryMinor + taxMinor,
        // Snapshot, not a join: the invoice must still say where to pay even if
        // the seller later changes their mobile-money number.
        payTo: pay ? { provider: pay.payProvider, number: pay.payNumber, name: pay.payName } as any : undefined,
        notes, dueAt,
        status: 'SENT',
      },
    });

    for (const uid of await memberUserIds(convo.buyerOrgId)) {
      emitToUser(uid, 'invoice:new', { invoiceId: invoice.id, conversationId: convo.id });
      await notify(uid, {
        title: 'Invoice received 🧾',
        body:  `${invoice.number} · ${currency} ${fromMinor(invoice.totalMinor, currency).toLocaleString()}`,
        type:  'payment', data: { invoiceId: invoice.id, conversationId: convo.id },
      });
    }

    res.status(201).json({ invoice: { ...invoice, total: fromMinor(invoice.totalMinor, currency) } });
  } catch (e) { handle(res, e); }
});

// ── GET /api/invoices ─ issued to me or by me ────────────────────────────────
invoices.get('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    role:   z.enum(['seller', 'buyer', 'any']).default('any'),
    status: z.enum(['DRAFT', 'SENT', 'PAID', 'VOID']).optional(),
  }).safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { role, status } = parse.data;

  try {
    const orgId = await actingOrgId(req.userId!);
    const where: any = {};
    if (role === 'seller')      where.sellerOrgId = orgId;
    else if (role === 'buyer')  where.buyerOrgId  = orgId;
    else where.OR = [{ sellerOrgId: orgId }, { buyerOrgId: orgId }];
    if (status) where.status = status;

    const rows = await prisma.invoice.findMany({
      where, orderBy: { issuedAt: 'desc' }, take: 100,
      include: {
        seller: { select: { id: true, name: true, slug: true } },
        buyer:  { select: { id: true, name: true, slug: true } },
      },
    });

    // "Track all supplier chats if payment is complete" — each invoice carries
    // its thread and paid state, so an unpaid thread is one filter away.
    res.json({
      orgId,
      invoices: rows.map(i => ({
        ...i,
        total: fromMinor(i.totalMinor, i.currency),
        isPaid: i.status === 'PAID',
        iAmSeller: i.sellerOrgId === orgId,
      })),
      unpaidTotalMinor: rows.filter(i => i.status === 'SENT' && i.sellerOrgId === orgId)
                            .reduce((n, i) => n + i.totalMinor, 0),
    });
  } catch (e) { handle(res, e); }
});

// ── POST /api/invoices/:id/paid ─ seller confirms settlement ─────────────────
invoices.post('/:id/paid', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ paymentRef: z.string().trim().max(120).optional() }).safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const orgId = await actingOrgId(req.userId!);
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    // Only the payee marks an invoice settled — a buyer claiming payment is not
    // evidence that money arrived.
    if (invoice.sellerOrgId !== orgId) return res.status(403).json({ error: 'Only the seller can confirm payment' });
    if (invoice.status === 'PAID')     return res.status(409).json({ error: 'Already marked paid' });

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data:  { status: 'PAID', paidAt: new Date(), paymentRef: parse.data.paymentRef },
    });

    for (const uid of await memberUserIds(invoice.buyerOrgId)) {
      await notify(uid, { title: 'Payment confirmed ✅', body: `${invoice.number} is settled.`, type: 'payment', data: { invoiceId: invoice.id } });
    }

    res.json({ invoice: { ...updated, total: fromMinor(updated.totalMinor, updated.currency) } });
  } catch (e) { handle(res, e); }
});

export { conversations as conversationsRouter, invoices as invoicesRouter };
