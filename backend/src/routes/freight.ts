/**
 * Freight marketplace API — the load board.
 *
 * Authenticated: unlike the product catalog, a load board exposes commercially
 * sensitive movements (who is shipping what, where, when), so browsing requires
 * an account even though quoting requires a carrier organization.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  postLoad, quoteOnLoad, acceptQuote,
  matchLoadsForRoute, matchRoutesForLoad, actingOrgId,
  type NewLoad,
} from '../services/freight';

// The project compiles with strictNullChecks off, which makes zod infer every
// parsed field as optional. safeParse has already guaranteed the required ones,
// so the casts below assert what the schema enforced — same pattern as
// routes/orders.

const router = Router();

const handle = (res: any, e: any) =>
  res.status(e?.http ?? 500).json({ error: e?.message ?? 'Request failed' });

const coord = z.coerce.number().min(-180).max(180);

// ── POST /api/freight/loads ─ post cargo ─────────────────────────────────────
router.post('/loads', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    originLat: coord, originLng: coord, destLat: coord, destLng: coord,
    originLabel: z.string().max(120).optional(),
    destLabel:   z.string().max(120).optional(),
    pickupFrom:  z.coerce.date(),
    pickupTo:    z.coerce.date(),
    weightKg:    z.coerce.number().positive(),
    volumeM3:    z.coerce.number().positive().optional(),
    cargoType:   z.string().max(60).optional(),
    isHazmat:    z.boolean().optional(),
    needsRefrigeration: z.boolean().optional(),
    budgetMinor: z.coerce.number().int().nonnegative().optional(),
    currency:    z.string().length(3).optional(),
    notes:       z.string().max(500).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    res.status(201).json({ load: await postLoad(req.userId!, parse.data as NewLoad) });
  } catch (e) { handle(res, e); }
});

// ── GET /api/freight/loads ─ the board ───────────────────────────────────────
router.get('/loads', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    status:   z.enum(['OPEN', 'QUOTED', 'AWARDED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']).optional(),
    mine:     z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    maxWeight: z.coerce.number().positive().optional(),
    page:     z.coerce.number().int().min(1).default(1),
    limit:    z.coerce.number().int().min(1).max(60).default(24),
  }).safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { status, mine, maxWeight, page, limit } = parse.data;

  const where: any = {};
  if (status) where.status = status;
  else where.status = { in: ['OPEN', 'QUOTED'] };
  if (maxWeight) where.weightKg = { lte: maxWeight };
  if (mine) where.shipperOrgId = await actingOrgId(req.userId!).catch(() => '__none__');

  const [total, loads] = await Promise.all([
    prisma.load.count({ where }),
    prisma.load.findMany({
      where, orderBy: { pickupFrom: 'asc' },
      skip: (page - 1) * limit, take: limit,
      include: {
        shipper: { select: { id: true, name: true, slug: true, isVerified: true } },
        _count:  { select: { quotes: true } },
      },
    }),
  ]);

  res.json({ total, page, limit, loads });
});

// ── GET /api/freight/loads/:id ───────────────────────────────────────────────
router.get('/loads/:id', requireAuth, async (req: AuthRequest, res) => {
  const load = await prisma.load.findUnique({
    where:   { id: req.params.id },
    include: {
      shipper: { select: { id: true, name: true, slug: true, isVerified: true } },
      quotes:  { orderBy: { amountMinor: 'asc' }, include: { bidder: { select: { id: true, name: true, slug: true, isVerified: true, rating: true } } } },
    },
  });
  if (!load) return res.status(404).json({ error: 'Load not found' });

  // Only the shipper sees the full bid book; carriers see their own bid only,
  // otherwise the board becomes a price-fixing signal.
  const orgId = await actingOrgId(req.userId!).catch(() => null);
  const isShipper = orgId === load.shipperOrgId;
  const quotes = isShipper ? load.quotes : load.quotes.filter(q => q.bidderOrgId === orgId);

  res.json({ load: { ...load, quotes }, isShipper, quoteCount: load.quotes.length });
});

// ── POST /api/freight/loads/:id/quotes ─ bid ─────────────────────────────────
router.post('/loads/:id/quotes', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountMinor: z.coerce.number().int().positive(),
    currency:    z.string().length(3).optional(),
    etaPickup:   z.coerce.date().optional(),
    etaDrop:     z.coerce.date().optional(),
    message:     z.string().max(300).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const bid = parse.data as { amountMinor: number; currency?: string; etaPickup?: Date; etaDrop?: Date; message?: string };
    res.status(201).json({ quote: await quoteOnLoad(req.userId!, req.params.id, bid) });
  } catch (e) { handle(res, e); }
});

// ── POST /api/freight/quotes/:id/accept ─ award ──────────────────────────────
router.post('/quotes/:id/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json(await acceptQuote(req.userId!, req.params.id));
  } catch (e) { handle(res, e); }
});

// ── POST /api/freight/routes ─ carrier advertises a lane ─────────────────────
router.post('/routes', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    originLat: coord, originLng: coord, destLat: coord, destLng: coord,
    originLabel: z.string().max(120).optional(),
    destLabel:   z.string().max(120).optional(),
    corridorKm:  z.coerce.number().positive().max(500).default(50),
    departsAt:   z.coerce.date(),
    arrivesBy:   z.coerce.date().optional(),
    capacityKgFree: z.coerce.number().positive(),
    vehicleId:   z.string().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const carrierOrgId = await actingOrgId(req.userId!);
    const org = await prisma.organization.findUnique({ where: { id: carrierOrgId }, select: { canCarry: true } });
    if (!org?.canCarry) return res.status(403).json({ error: 'Your organization is not registered as a carrier' });

    const lane = parse.data as {
      originLat: number; originLng: number; destLat: number; destLng: number;
      originLabel?: string; destLabel?: string;
      corridorKm: number; departsAt: Date; arrivesBy?: Date;
      capacityKgFree: number; vehicleId?: string;
    };
    res.status(201).json({ route: await prisma.carrierRoute.create({ data: { carrierOrgId, ...lane } }) });
  } catch (e) { handle(res, e); }
});

// ── GET /api/freight/routes/:id/matches ─ backhaul ───────────────────────────
// The feature that makes the board pay for itself: loads that fit a trip the
// carrier is already making.
router.get('/routes/:id/matches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matches = await matchLoadsForRoute(req.params.id);
    res.json({
      matches: matches.map(m => ({
        load: m.load,
        detourKm:       Math.round(m.detourKm * 10) / 10,
        pickupOffsetKm: Math.round(m.pickupOffsetKm * 10) / 10,
        dropOffsetKm:   Math.round(m.dropOffsetKm * 10) / 10,
      })),
    });
  } catch (e) { handle(res, e); }
});

// ── GET /api/freight/loads/:id/carriers ─ the mirror ─────────────────────────
router.get('/loads/:id/carriers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matches = await matchRoutesForLoad(req.params.id);
    res.json({ carriers: matches.map(m => ({ route: m.route, detourKm: Math.round(m.detourKm * 10) / 10 })) });
  } catch (e) { handle(res, e); }
});

export { router as freightRouter };
