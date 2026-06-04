import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// Shared credit tokens store (in production use Redis)
const shareTokens = new Map<string, { userId: string; expiresAt: number }>();

// ── GET /api/credit/score ─────────────────────────────────────────────────────
router.get('/score', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const [txCount, loansRepaid, defaults, savingsPos, stakePos] = await Promise.all([
    prisma.transaction.count({ where: { userId: req.userId!, status: 'CONFIRMED' } }),
    prisma.loanListing.count({ where: { borrowerId: req.userId!, status: 'REPAID' } }),
    prisma.loanListing.count({ where: { borrowerId: req.userId!, status: 'DEFAULTED' } }),
    prisma.savingsPosition.findUnique({ where: { userId: req.userId! } }),
    prisma.stakePosition.findUnique({ where: { userId: req.userId! } }),
  ]);

  const monthsActive = Math.floor((Date.now() - user.createdAt.getTime()) / 2_592_000_000);
  const txBonus      = Math.min(Math.floor(txCount / 10), 10);
  const timeBonus    = Math.min(monthsActive, 20);
  const repaidBonus  = Math.min(loansRepaid * 5, 25);
  const defaultPenalty = defaults * 20;
  const savingsBonus = savingsPos && savingsPos.principal > 0 ? 5 : 0;
  const stakeBonus   = stakePos && stakePos.status === 'ACTIVE' ? 5 : 0;

  const score = Math.max(0, Math.min(100,
    40 + txBonus + timeBonus + repaidBonus - defaultPenalty + savingsBonus + stakeBonus
  ));

  await prisma.creditScore.upsert({
    where:  { userId: req.userId! },
    update: { score, loansRepaid, defaults, monthsActive },
    create: { userId: req.userId!, score, loansRepaid, defaults, monthsActive },
  });

  return res.json(ok({
    score,
    tier:   score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
    breakdown: { base: 40, txBonus, timeBonus, repaidBonus, defaultPenalty, savingsBonus, stakeBonus },
    maxScore: 100,
  }));
});

// ── POST /api/credit/share ────────────────────────────────────────────────────
router.post('/share', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ validDays: z.number().int().min(1).max(30).default(7) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const token     = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + parse.data.validDays * 86_400_000;
  shareTokens.set(token, { userId: req.userId!, expiresAt });

  const shareUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/credit/verify/${token}`;
  return res.json(ok({ shareUrl, expiresAt: new Date(expiresAt), validDays: parse.data.validDays }));
});

// ── GET /api/credit/verify/:token ─────────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
  const entry = shareTokens.get(req.params.token);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(410).json(fail('Credit report link expired or invalid'));
  }

  const score = await prisma.creditScore.findUnique({ where: { userId: entry.userId } });
  const user  = await prisma.user.findUnique({
    where:  { id: entry.userId },
    select: { kycName: true, createdAt: true },
  });

  return res.json(ok({
    name:        user?.kycName ?? 'OlomiPay User',
    score:       score?.score ?? 40,
    memberSince: user?.createdAt,
    verifiedAt:  new Date(),
    platform:    'OlomiPay',
  }));
});

export { router as creditRouter };
