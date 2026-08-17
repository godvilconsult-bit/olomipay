/**
 * Request for quotation — a buyer posts what they need, sellers bid.
 *
 * The other half of a B2B marketplace: the catalog serves "I know what I want
 * and who sells it", RFQ serves "here is my requirement, who can meet it". It is
 * structurally the freight load board with products instead of cargo, which is
 * why `Quote` carries both an rfqId and a loadId rather than there being two
 * bidding implementations to keep in step.
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

const router = Router();

const handle = (res: any, e: any) =>
  res.status(e?.http ?? 500).json({ error: e?.message ?? 'Request failed' });

async function memberUserIds(orgId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { orgId }, select: { userId: true } });
  return rows.map(r => r.userId);
}

/** Money out, so a client never has to know the minor-unit scale. */
const view = (r: any) => ({
  ...r,
  target: r.targetMinor != null ? fromMinor(r.targetMinor, r.currency) : null,
  quotes: r.quotes?.map((q: any) => ({ ...q, amount: fromMinor(q.amountMinor, q.currency) })),
});

// ── POST /api/rfq ─ post a requirement ───────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    title:      z.string().trim().min(3).max(160),
    categoryId: z.string().optional(),
    spec:       z.string().trim().max(4_000).optional(),
    attributes: z.record(z.any()).optional(),
    qty:        z.coerce.number().int().positive().default(1),
    unit:       z.string().trim().max(20).optional(),
    target:     z.coerce.number().nonnegative().optional(),   // major units
    currency:   z.string().length(3).optional(),
    closesInDays: z.coerce.number().int().min(1).max(90).default(14),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data as any;

  try {
    const buyerOrgId = await actingOrgId(req.userId!);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: buyerOrgId } });
    const currency = d.currency ?? org.currency;

    const rfq = await prisma.rfq.create({
      data: {
        reference: `RFQ-${makeOrderNo()}`,
        buyerOrgId,
        categoryId: d.categoryId ?? null,
        title: d.title,
        spec: d.spec ?? null,
        attributes: d.attributes ?? undefined,
        qty: d.qty,
        unit: d.unit ?? null,
        targetMinor: d.target != null ? toMinor(d.target, currency) : null,
        currency,
        closesAt: new Date(Date.now() + d.closesInDays * 864e5),
      },
    });

    res.status(201).json({ rfq: view(rfq) });
  } catch (e) { handle(res, e); }
});

// ── GET /api/rfq ─ the request board sellers work from ───────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    mine:     z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    category: z.string().optional(),
    status:   z.enum(['OPEN', 'QUOTED', 'AWARDED', 'CLOSED', 'CANCELLED']).optional(),
    page:     z.coerce.number().int().min(1).default(1),
    limit:    z.coerce.number().int().min(1).max(60).default(24),
  }).safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { mine, category, status, page, limit } = parse.data;

  try {
    const orgId = await actingOrgId(req.userId!);
    const where: any = {};
    if (mine) where.buyerOrgId = orgId;
    // Sellers see live requests only; an expired RFQ is noise on a bidding board.
    else { where.closesAt = { gte: new Date() }; where.buyerOrgId = { not: orgId }; }
    if (status) where.status = status;
    else if (!mine) where.status = { in: ['OPEN', 'QUOTED'] };
    if (category) where.category = { key: category };

    const [total, rows] = await Promise.all([
      prisma.rfq.count({ where }),
      prisma.rfq.findMany({
        where, orderBy: { closesAt: 'asc' },
        skip: (page - 1) * limit, take: limit,
        include: {
          buyer:    { select: { id: true, name: true, slug: true, isVerified: true, countryCode: true } },
          category: { select: { key: true, name: true, unitType: true } },
          _count:   { select: { quotes: true } },
        },
      }),
    ]);

    res.json({ total, page, limit, orgId, rfqs: rows.map(view) });
  } catch (e) { handle(res, e); }
});

// ── GET /api/rfq/:id ─────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = await actingOrgId(req.userId!);
    const rfq = await prisma.rfq.findUnique({
      where:   { id: req.params.id },
      include: {
        buyer:    { select: { id: true, name: true, slug: true, isVerified: true } },
        category: { select: { key: true, name: true, unitType: true } },
        quotes:   { orderBy: { amountMinor: 'asc' }, include: { bidder: { select: { id: true, name: true, slug: true, isVerified: true, rating: true } } } },
      },
    });
    if (!rfq) return res.status(404).json({ error: 'Request not found' });

    // Only the buyer sees every bid. A seller seeing rivals' prices turns the
    // board into a price-fixing signal, same reasoning as the freight bid book.
    const isBuyer = rfq.buyerOrgId === orgId;
    const quotes = isBuyer ? rfq.quotes : rfq.quotes.filter(q => q.bidderOrgId === orgId);

    res.json({ rfq: view({ ...rfq, quotes }), isBuyer, quoteCount: rfq.quotes.length });
  } catch (e) { handle(res, e); }
});

// ── POST /api/rfq/:id/quotes ─ a seller bids ─────────────────────────────────
router.post('/:id/quotes', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    amount:   z.coerce.number().positive(),      // major units, per the qty asked
    currency: z.string().length(3).optional(),
    leadDays: z.coerce.number().int().min(0).max(365).optional(),
    message:  z.string().trim().max(600).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data as any;

  try {
    const bidderOrgId = await actingOrgId(req.userId!);
    const [rfq, org] = await Promise.all([
      prisma.rfq.findUnique({ where: { id: req.params.id } }),
      prisma.organization.findUnique({ where: { id: bidderOrgId }, select: { canSell: true } }),
    ]);
    if (!rfq) return res.status(404).json({ error: 'Request not found' });
    // Self-bidding is checked before selling rights: telling a buyer they are
    // not set up to sell, when the real problem is that this is their own
    // request, sends them off to fix the wrong thing.
    if (rfq.buyerOrgId === bidderOrgId) return res.status(400).json({ error: 'You cannot quote on your own request' });
    if (!org?.canSell) return res.status(403).json({ error: 'Your organization is not set up to sell' });
    if (!['OPEN', 'QUOTED'].includes(rfq.status)) return res.status(409).json({ error: 'This request is no longer accepting quotes' });
    if (rfq.closesAt < new Date()) return res.status(409).json({ error: 'This request has closed' });

    const currency = d.currency ?? rfq.currency;
    const quote = await prisma.quote.upsert({
      where:  { rfqId_bidderOrgId: { rfqId: rfq.id, bidderOrgId } },
      update: {
        amountMinor: toMinor(d.amount, currency), currency,
        message: d.message ?? null,
        etaDrop: d.leadDays != null ? new Date(Date.now() + d.leadDays * 864e5) : null,
        status: 'PENDING', decidedAt: null,
      },
      create: {
        rfqId: rfq.id, bidderOrgId,
        amountMinor: toMinor(d.amount, currency), currency,
        message: d.message ?? null,
        etaDrop: d.leadDays != null ? new Date(Date.now() + d.leadDays * 864e5) : null,
      },
    });

    if (rfq.status === 'OPEN') await prisma.rfq.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });

    for (const uid of await memberUserIds(rfq.buyerOrgId)) {
      emitToUser(uid, 'rfq:quote', { rfqId: rfq.id, quoteId: quote.id });
      await notify(uid, {
        title: 'New quote received',
        body:  `${rfq.title} — ${currency} ${fromMinor(quote.amountMinor, currency).toLocaleString()}`,
        type:  'rfq', data: { rfqId: rfq.id },
      });
    }

    res.status(201).json({ quote: { ...quote, amount: fromMinor(quote.amountMinor, currency) } });
  } catch (e) { handle(res, e); }
});

// ── POST /api/rfq/quotes/:quoteId/accept ─ the buyer awards ──────────────────
router.post('/quotes/:quoteId/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = await actingOrgId(req.userId!);
    const quote = await prisma.quote.findUnique({ where: { id: req.params.quoteId }, include: { rfq: true } });
    if (!quote?.rfq) return res.status(404).json({ error: 'Quote not found' });
    if (quote.rfq.buyerOrgId !== orgId) return res.status(403).json({ error: 'Only the buyer can accept a quote' });
    if (quote.rfq.status === 'AWARDED')  return res.status(409).json({ error: 'This request has already been awarded' });
    if (quote.status !== 'PENDING')      return res.status(409).json({ error: 'That quote is no longer available' });

    const result = await prisma.$transaction(async (tx) => {
      const accepted = await tx.quote.update({
        where: { id: quote.id }, data: { status: 'ACCEPTED', decidedAt: new Date() },
      });
      // Losing bids are closed explicitly, so sellers are not left waiting.
      await tx.quote.updateMany({
        where: { rfqId: quote.rfqId!, id: { not: quote.id }, status: 'PENDING' },
        data:  { status: 'REJECTED', decidedAt: new Date() },
      });
      const rfq = await tx.rfq.update({
        where: { id: quote.rfqId! },
        data:  { status: 'AWARDED', awardedQuoteId: quote.id },
      });
      return { rfq, quote: accepted };
    });

    for (const uid of await memberUserIds(quote.bidderOrgId)) {
      emitToUser(uid, 'rfq:awarded', { rfqId: quote.rfqId, quoteId: quote.id });
      await notify(uid, {
        title: 'Your quote was accepted',
        body:  `${quote.rfq.title} — agree delivery with the buyer.`,
        type:  'rfq', data: { rfqId: quote.rfqId },
      });
    }

    res.json({ rfq: view(result.rfq), quote: result.quote });
  } catch (e) { handle(res, e); }
});

export { router as rfqRouter };
