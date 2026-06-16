/**
 * Brand advertising surface (revenue model). LPG brands & local businesses pay
 * for sponsored slots on the household home, targeted by region. Public read +
 * impression/click tracking; all authoring is admin-only (see routes/admin.ts).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';

const router = Router();

const adPublic = (a: any) => ({
  id: a.id, brand: a.brand, title: a.title, subtitle: a.subtitle,
  imageUrl: a.imageUrl, ctaLabel: a.ctaLabel, linkUrl: a.linkUrl,
  bgColor: a.bgColor, animation: a.animation, type: a.type,
});

// ── GET /api/ads/active ─ live ads for this user's region, weighted ──────────────
// Returns a LIST (so the home can rotate through them) plus `ad` (the top weighted
// pick) for back-compat. Region match = nationwide (null) OR the selected region.
router.get('/active', requireAuth, async (req: AuthRequest, res) => {
  const region = (req.query.region as string | undefined)?.trim();
  const now = new Date();
  const ads = await prisma.brandAd.findMany({
    where: {
      isActive: true,
      ...(region ? { OR: [{ region: null }, { region }] } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // admin can run as many ads as they like; the home rotates through them
  });
  if (ads.length === 0) return res.json({ ad: null, ads: [] });

  // Weighted shuffle: higher weight → earlier in the rotation, more often.
  const ranked = [...ads].sort((a, b) => (Math.random() * Math.max(1, b.weight)) - (Math.random() * Math.max(1, a.weight)));

  res.json({ ad: adPublic(ranked[0]), ads: ranked.map(adPublic) });
});

// ── POST /api/ads/:id/impression ─ count a view (carousel reports each shown ad) ──
router.post('/:id/impression', requireAuth, async (req: AuthRequest, res) => {
  await prisma.brandAd.updateMany({ where: { id: req.params.id }, data: { impressions: { increment: 1 } } });
  res.json({ ok: true });
});

// ── POST /api/ads/:id/click ─ attribute a tap (for the brand's billing) ───────────
router.post('/:id/click', requireAuth, async (req: AuthRequest, res) => {
  await prisma.brandAd.updateMany({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } });
  res.json({ ok: true });
});

// ── POST /api/ads/:id/lead ─ "Shop now" enquiry; advertiser follows up later ──────
router.post('/:id/lead', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:  z.string().min(1).max(80),
    phone: z.string().min(7).max(20),
    note:  z.string().max(400).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const ad = await prisma.brandAd.findUnique({ where: { id: req.params.id }, select: { id: true, brand: true } });
  if (!ad) return res.status(404).json({ error: 'Ad not found' });

  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { region: true } });
  const lead = await prisma.adLead.create({
    data: { adId: ad.id, userId: req.userId ?? null, name: parse.data.name.trim(), phone: parse.data.phone.trim(), note: parse.data.note?.trim() || null, region: me?.region ?? null },
  });
  await prisma.brandAd.updateMany({ where: { id: ad.id }, data: { leads: { increment: 1 }, clicks: { increment: 1 } } });

  // Alert admins so the brand/distributor can be connected to follow up.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, {
    title: `🛒 New ${ad.brand} enquiry`,
    body:  `${parse.data.name} (${parse.data.phone})${me?.region ? ` · ${me.region}` : ''}${parse.data.note ? ` — “${parse.data.note}”` : ''}`,
    type:  'lead',
    data:  { adId: ad.id, leadId: lead.id },
  }).catch(() => {})));

  res.status(201).json({ ok: true });
});

export { router as adsRouter };
