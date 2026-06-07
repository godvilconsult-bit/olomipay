import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { TIERS, tierFor, checkTierLimit } from '../services/kycTiers';
import { requireRole } from '../services/adminAuth';

const router = Router();

// ── POST /api/kyc/admin/:userId/level ─────────────────────────────────────────
// Compliance/super-admin sets a user's KYC level (approve to Verified=2, grant
// Enhanced=3, or downgrade). Setting level >=2 also marks kycStatus APPROVED.
router.post('/admin/:userId/level', requireRole('SUPPORT_HEAD', 'FINANCE_HEAD', 'SUPER_ADMIN'), async (req, res) => {
  const parse = z.object({ level: z.number().int().min(0).max(3) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'level must be 0-3' });

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data:  {
      kycLevel:  parse.data.level,
      kycStatus: parse.data.level >= 2 ? 'APPROVED' : undefined,
    },
  }).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ message: `KYC level set to ${parse.data.level}`, level: parse.data.level });
});

// ── GET /api/kyc/tier ─────────────────────────────────────────────────────────
// Current level, its limits, today's/this-month's usage, and all tiers (for an
// in-app "Limits & verification" screen).
router.get('/tier', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! }, select: { kycLevel: true, kycStatus: true, kycName: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Use the limit checker purely to read back current usage (amount 0, never blocks).
  const usage = await checkTierLimit(req.userId!, 0, 'send');
  const tier  = tierFor(user.kycLevel ?? 0);

  return res.json({
    level:      user.kycLevel ?? 0,
    label:      tier.label,
    kycStatus:  user.kycStatus,
    limits:     { perTxUsdc: tier.perTxUsdc, dailyUsdc: tier.dailyUsdc, monthlyUsdc: tier.monthlyUsdc },
    features:   tier.features,
    usedToday:  usage.usedToday,
    usedMonth:  usage.usedMonth,
    upgradeHint: tier.upgradeHint,
    allTiers:   Object.values(TIERS).map(t => ({
      level: t.level, label: t.label,
      perTxUsdc: t.perTxUsdc, dailyUsdc: t.dailyUsdc, monthlyUsdc: t.monthlyUsdc,
      features: t.features,
    })),
  });
});

// ── POST /api/kyc/basic ───────────────────────────────────────────────────────
// Lightweight level-1 upgrade: user provides their full name (no document yet).
router.post('/basic', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ name: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.user.update({
    where: { id: req.userId! },
    data:  { kycName: parse.data.name, kycLevel: Math.max(user.kycLevel ?? 0, 1) },
  });
  return res.json({ message: 'Basic details saved', level: Math.max(user.kycLevel ?? 0, 1) });
});

// ── POST /api/kyc/submit ──────────────────────────────────────────────────────

router.post('/submit', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    idType:   z.enum(['NIDA', 'PASSPORT', 'VOTERS_ID', 'DRIVING_LICENSE']),
    idNumber: z.string().min(5).max(30),
    name:     z.string().min(2).max(100),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.kycStatus === 'APPROVED') {
    return res.status(400).json({ error: 'KYC already approved' });
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      kycStatus:  'PENDING',
      kycIdType:  parse.data.idType,
      kycIdNumber: parse.data.idNumber,
      kycName:    parse.data.name,
    },
  });

  // In production: trigger ID verification via a KYC provider (e.g. Smile Identity)
  // For MVP: auto-approve after submission (remove this in production)
  if (process.env.NODE_ENV !== 'production') {
    await prisma.user.update({
      where: { id: req.userId! },
      data:  { kycStatus: 'APPROVED', kycLevel: 2 },
    });
  }

  return res.json({
    message:   'KYC submitted successfully',
    kycStatus: process.env.NODE_ENV !== 'production' ? 'APPROVED' : 'PENDING',
  });
});

// ── GET /api/kyc/status ───────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { kycStatus: true, kycName: true, kycIdType: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    kycStatus: user.kycStatus,
    kycName:   user.kycName,
    kycIdType: user.kycIdType,
  });
});

export { router as kycRouter };
