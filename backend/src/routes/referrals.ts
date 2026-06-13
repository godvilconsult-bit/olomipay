/**
 * Referrals + loyalty (Tier 3). My invite code + stats, and redeeming loyalty
 * points for wallet credit. Earning happens in services/rewards.ts on order
 * completion.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ensureReferralCode } from '../services/rewards';
import { postTxn } from '../services/wallet';

const router = Router();
const REDEEM_RATE = Number(process.env.JIKO_LOYALTY_REDEEM_RATE ?? 10);  // TZS per point
const MIN_REDEEM  = Number(process.env.JIKO_LOYALTY_MIN_REDEEM ?? 100);  // points

// ── GET /api/referrals/me ─ invite code + stats + loyalty balance ────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const code = await ensureReferralCode(req.userId!);
  const [invited, rewarded, user] = await Promise.all([
    prisma.referral.count({ where: { referrerId: req.userId } }),
    prisma.referral.count({ where: { referrerId: req.userId, status: 'PAID' } }),
    prisma.user.findUnique({ where: { id: req.userId }, select: { loyaltyPoints: true } }),
  ]);
  res.json({ code, invited, rewarded, loyaltyPoints: user?.loyaltyPoints ?? 0, redeemRate: REDEEM_RATE, minRedeem: MIN_REDEEM });
});

// ── POST /api/referrals/redeem ─ convert loyalty points → wallet credit ──────────
router.post('/redeem', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ points: z.number().int().positive() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'points required' });
  const { points } = parse.data;
  if (points < MIN_REDEEM) return res.status(400).json({ error: `Redeem at least ${MIN_REDEEM} points` });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { loyaltyPoints: true } });
  if (!user || user.loyaltyPoints < points) return res.status(400).json({ error: 'Not enough points' });
  const credit = points * REDEEM_RATE;
  await prisma.user.update({ where: { id: req.userId }, data: { loyaltyPoints: { decrement: points } } });
  const balance = await postTxn(req.userId!, 'LOYALTY', credit, { note: `Redeemed ${points} points` });
  res.json({ ok: true, credited: credit, balance });
});

export { router as referralsRouter };
