import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { platformSendUsdc } from '../services/stellar';
import { sendSms } from '../services/sms';

const router = Router();
const prisma = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const TIERS = [
  { name: 'BRONZE',   min: 0,    color: '#cd7f32' },
  { name: 'SILVER',   min: 500,  color: '#c0c0c0' },
  { name: 'GOLD',     min: 2000, color: '#ffd700' },
  { name: 'PLATINUM', min: 5000, color: '#e5e4e2' },
];

function getTier(balance: number): string {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (balance >= TIERS[i].min) return TIERS[i].name;
  }
  return 'BRONZE';
}

// ── GET /api/rewards/balance ──────────────────────────────────────────────────
router.get('/balance', requireAuth, async (req: AuthRequest, res) => {
  let rewards = await prisma.rewardPoints.findUnique({ where: { userId: req.userId! } });
  if (!rewards) {
    rewards = await prisma.rewardPoints.create({ data: { userId: req.userId! } });
  }

  const tier    = getTier(rewards.balance);
  const nextTier = TIERS.find(t => t.min > rewards!.balance);
  const progress = nextTier
    ? Math.round((rewards.balance / nextTier.min) * 100)
    : 100;

  return res.json(ok({
    balance:      rewards.balance,
    totalEarned:  rewards.totalEarned,
    tier,
    streak:       rewards.streak,
    lastActivity: rewards.lastActivity,
    nextTier:     nextTier?.name ?? null,
    progress,
    catalog: [
      { id: 'fee_waiver',  label: 'Free transaction',     points: 100,  description: 'Skip the 1% fee on your next transfer' },
      { id: 'airtime_1k',  label: '1,000 TZS Airtime',    points: 500,  description: 'Credited to your M-Pesa instantly' },
      { id: 'usdc_1',      label: '$1 USDC',              points: 1000, description: 'Added to your Stellar wallet' },
      { id: 'usdc_5',      label: '$5 USDC',              points: 4500, description: 'Added to your Stellar wallet' },
    ],
  }));
});

// ── GET /api/rewards/history ──────────────────────────────────────────────────
router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  // Use notifications as reward history proxy
  const history = await prisma.notification.findMany({
    where:   { userId: req.userId!, type: 'reward' },
    orderBy: { createdAt: 'desc' },
    take:    20,
  });
  return res.json(ok({ history }));
});

// ── POST /api/rewards/redeem ──────────────────────────────────────────────────
router.post('/redeem', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    rewardType: z.enum(['fee_waiver', 'airtime_1k', 'usdc_1', 'usdc_5']),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const COSTS: Record<string, number> = {
    fee_waiver: 100, airtime_1k: 500, usdc_1: 1000, usdc_5: 4500,
  };

  const cost = COSTS[parse.data.rewardType];
  const rewards = await prisma.rewardPoints.findUnique({ where: { userId: req.userId! } });
  if (!rewards || rewards.balance < cost) {
    return res.status(400).json(fail(`Need ${cost} points. You have ${rewards?.balance ?? 0}.`));
  }

  await prisma.rewardPoints.update({
    where: { userId: req.userId! },
    data:  { balance: { decrement: cost } },
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });

  let message = 'Reward redeemed!';
  if (parse.data.rewardType === 'usdc_1') {
    await platformSendUsdc(user!.stellarPubKey, 1, 'Rewards redemption');
    message = '$1 USDC added to your wallet';
  } else if (parse.data.rewardType === 'usdc_5') {
    await platformSendUsdc(user!.stellarPubKey, 5, 'Rewards redemption');
    message = '$5 USDC added to your wallet';
  } else if (parse.data.rewardType === 'airtime_1k') {
    await sendSms(user!.phone, 'Your 1,000 TZS airtime from OlomiPay Rewards is being processed.');
    message = '1,000 TZS airtime sent to your phone';
  }

  return res.json(ok({ message, pointsUsed: cost, remainingBalance: rewards.balance - cost }));
});

// ── GET /api/rewards/referral ─────────────────────────────────────────────────
router.get('/referral', requireAuth, async (req: AuthRequest, res) => {
  const referralLink = `${process.env.FRONTEND_URL}/auth/register?ref=${req.userId}`;
  return res.json(ok({ referralLink, pointsPerReferral: 500 }));
});

// ── Helper: award points ──────────────────────────────────────────────────────
export async function awardPoints(userId: string, points: number, reason: string): Promise<void> {
  const rewards = await prisma.rewardPoints.upsert({
    where:  { userId },
    update: { balance: { increment: points }, totalEarned: { increment: points } },
    create: { userId, balance: points, totalEarned: points },
  });

  const newTier = getTier(rewards.balance + points);
  await prisma.rewardPoints.update({
    where: { userId },
    data:  { tier: newTier as any },
  });
}

export { router as rewardsRouter };
