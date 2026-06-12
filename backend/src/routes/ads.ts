/**
 * Brand advertising surface (Phase 3 monetization). LPG brands pay for a
 * "Sponsored" slot on the household home. Public read + click tracking; all
 * authoring is admin-only (see routes/admin.ts).
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// ── GET /api/ads/active ─ a weighted pick of live ads for this user's region ──────
router.get('/active', requireAuth, async (req: AuthRequest, res) => {
  const region = (req.query.region as string | undefined)?.trim();
  const now = new Date();
  const ads = await prisma.brandAd.findMany({
    where: {
      isActive: true,
      // nationwide ads (region null) OR ads targeting this region
      ...(region ? { OR: [{ region: null }, { region }] } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  if (ads.length === 0) return res.json({ ad: null, ads: [] });

  // Weighted random pick so higher-paying brands surface more often. No Math
  // bias issues: build a cumulative table over the integer weights.
  const total = ads.reduce((s, a) => s + Math.max(1, a.weight), 0);
  let r = Math.floor(Math.random() * total);
  let chosen = ads[0];
  for (const a of ads) { r -= Math.max(1, a.weight); if (r < 0) { chosen = a; break; } }

  // Count the impression (fire-and-forget).
  prisma.brandAd.update({ where: { id: chosen.id }, data: { impressions: { increment: 1 } } }).catch(() => {});

  res.json({
    ad: { id: chosen.id, brand: chosen.brand, title: chosen.title, subtitle: chosen.subtitle, imageUrl: chosen.imageUrl, ctaLabel: chosen.ctaLabel, type: chosen.type },
    ads: ads.map(a => ({ id: a.id, brand: a.brand, title: a.title })),
  });
});

// ── POST /api/ads/:id/click ─ attribute a tap (for the brand's billing) ───────────
router.post('/:id/click', requireAuth, async (req: AuthRequest, res) => {
  await prisma.brandAd.updateMany({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } });
  res.json({ ok: true });
});

export { router as adsRouter };
