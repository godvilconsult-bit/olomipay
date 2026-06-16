/**
 * Brand self-serve portal. Marketers/gas companies (Oryx, Taifa…) run their own
 * sponsored ads — still subject to admin approval — and see their performance,
 * the "Shop now" leads their ads generated, and demand for their brand by region.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const ANIMATIONS = ['none', 'pulse', 'shine', 'slide', 'float', 'zoom'] as const;
const brandFor = (userId?: string) => prisma.brandProfile.findUnique({ where: { userId: userId! } });

const adBody = z.object({
  title:     z.string().min(1).max(120),
  subtitle:  z.string().max(200).optional(),
  imageUrl:  z.string().max(3_000_000).optional(),
  ctaLabel:  z.string().max(40).optional(),
  linkUrl:   z.string().max(2000).optional(),
  bgColor:   z.string().max(20).optional(),
  animation: z.enum(ANIMATIONS).default('none'),
  region:    z.string().max(60).optional(),
  type:      z.enum(['REFILL', 'CYLINDER', 'ACCESSORY']).optional(),
  weight:    z.number().int().min(1).max(100).default(1),
});

// ── GET /api/brand/me ─ profile + lifetime ad totals ─────────────────────────────
router.get('/me', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const bp = await brandFor(req.userId);
  if (!bp) return res.status(404).json({ error: 'No brand profile' });
  const ads = await prisma.brandAd.findMany({ where: { ownerId: req.userId }, select: { impressions: true, clicks: true, leads: true } });
  const totals = ads.reduce<{ ads: number; impressions: number; clicks: number; leads: number }>(
    (a, x) => ({ ads: a.ads + 1, impressions: a.impressions + x.impressions, clicks: a.clicks + x.clicks, leads: a.leads + x.leads }),
    { ads: 0, impressions: 0, clicks: 0, leads: 0 },
  );
  res.json({ profile: bp, totals });
});

// ── GET /api/brand/ads ─ my campaigns ────────────────────────────────────────────
router.get('/ads', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const ads = await prisma.brandAd.findMany({ where: { ownerId: req.userId }, orderBy: { createdAt: 'desc' } });
  res.json({ ads });
});

// ── POST /api/brand/ads ─ create (brand locked, awaits admin approval) ───────────
router.post('/ads', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const bp = await brandFor(req.userId);
  if (!bp) return res.status(404).json({ error: 'No brand profile' });
  const parse = adBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data;
  const ad = await prisma.brandAd.create({
    data: {
      brand: bp.brandName, ownerId: req.userId, status: 'PENDING', isActive: true,
      title: d.title, subtitle: d.subtitle || null, imageUrl: d.imageUrl || null,
      ctaLabel: d.ctaLabel || null, linkUrl: d.linkUrl || null, bgColor: d.bgColor || null,
      animation: d.animation, region: d.region || null, type: d.type, weight: d.weight,
    },
  });
  res.status(201).json({ ad });
});

// ── PATCH /api/brand/ads/:id ─ edit my ad → back to PENDING for re-review ─────────
router.patch('/ads/:id', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const own = await prisma.brandAd.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
  if (!own) return res.status(404).json({ error: 'Ad not found' });
  const parse = adBody.partial().safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const d = parse.data;
  const data: any = { status: 'PENDING' }; // any edit re-enters the approval queue
  for (const k of ['title', 'animation', 'weight', 'type'] as const) if (d[k] !== undefined) data[k] = d[k];
  for (const k of ['subtitle', 'imageUrl', 'ctaLabel', 'linkUrl', 'bgColor', 'region'] as const) if (d[k] !== undefined) data[k] = (d[k] as string) || null;
  const ad = await prisma.brandAd.update({ where: { id: own.id }, data });
  res.json({ ad });
});

router.delete('/ads/:id', requireRole('BRAND'), async (req: AuthRequest, res) => {
  await prisma.brandAd.deleteMany({ where: { id: req.params.id, ownerId: req.userId } });
  res.json({ ok: true });
});

// ── GET /api/brand/leads ─ "Shop now" enquiries from my ads ──────────────────────
router.get('/leads', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const leads = await prisma.adLead.findMany({
    where:   { ad: { ownerId: req.userId } },
    include: { ad: { select: { brand: true, title: true } } },
    orderBy: { createdAt: 'desc' },
    take:    200,
  });
  res.json({ leads });
});

// ── GET /api/brand/demand ─ demand for my brand by region (last 90 days) ─────────
router.get('/demand', requireRole('BRAND'), async (req: AuthRequest, res) => {
  const bp = await brandFor(req.userId);
  if (!bp) return res.status(404).json({ error: 'No brand profile' });
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const items = await prisma.orderItem.findMany({
    where:  { brand: bp.brandName, order: { status: { notIn: ['CANCELLED'] }, placedAt: { gte: since } } },
    select: { qty: true, order: { select: { supplier: { select: { region: true } } } } },
    take:   5000,
  });
  let totalUnits = 0;
  const byRegion: Record<string, number> = {};
  for (const it of items) {
    totalUnits += it.qty;
    const r = it.order?.supplier?.region ?? 'Unknown';
    byRegion[r] = (byRegion[r] ?? 0) + it.qty;
  }
  const regions = Object.entries(byRegion).map(([region, units]) => ({ region, units })).sort((a, b) => b.units - a.units);
  res.json({ brand: bp.brandName, periodDays: 90, orders: items.length, totalUnits, regions });
});

export { router as brandRouter };
