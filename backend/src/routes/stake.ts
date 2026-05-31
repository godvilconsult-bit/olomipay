import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, platformSendUsdc, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const POOLS = [
  { days: 30,  apyBps: 450,  label: '30 Days',  apy: '4.5%', badge: 'Flexible' },
  { days: 90,  apyBps: 700,  label: '90 Days',  apy: '7.0%', badge: 'Popular'  },
  { days: 180, apyBps: 1000, label: '180 Days', apy: '10%',  badge: 'Max Yield' },
];

// ── GET /api/stake/pools ──────────────────────────────────────────────────────
router.get('/pools', requireAuth, (_req, res) => res.json(ok({ pools: POOLS })));

// ── GET /api/stake/position ───────────────────────────────────────────────────
router.get('/position', requireAuth, async (req: AuthRequest, res) => {
  const pos = await prisma.stakePosition.findUnique({ where: { userId: req.userId! } });
  if (!pos) return res.json(ok({ hasPosition: false }));

  const now = new Date();
  const secondsElapsed = (now.getTime() - pos.stakedAt.getTime()) / 1000;
  const yieldAccrued   = pos.amountUsdc * (pos.apyBps / 10000) * secondsElapsed / (365 * 24 * 3600);
  const isUnlocked     = now >= pos.unlockAt;
  const daysRemaining  = Math.max(0, Math.ceil((pos.unlockAt.getTime() - now.getTime()) / 86_400_000));

  return res.json(ok({
    hasPosition: true,
    amountUsdc:   pos.amountUsdc,
    lockDays:     pos.lockDays,
    apyBps:       pos.apyBps,
    apy:          `${(pos.apyBps / 100).toFixed(1)}%`,
    stakedAt:     pos.stakedAt,
    unlockAt:     pos.unlockAt,
    yieldAccrued: +yieldAccrued.toFixed(7),
    yieldClaimed: pos.yieldClaimed,
    isUnlocked,
    daysRemaining,
    status:       pos.status,
  }));
});

// ── POST /api/stake/create ────────────────────────────────────────────────────
router.post('/create', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc:    z.number().positive().max(100_000),
    lockPeriodDays: z.union([z.literal(30), z.literal(90), z.literal(180)]),
    pin:           z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const validPin = await verifyPin(parse.data.pin, user.pinHash);
  if (!validPin) return res.status(403).json(fail('Incorrect PIN'));

  const existing = await prisma.stakePosition.findUnique({ where: { userId: req.userId! } });
  if (existing && existing.status === 'ACTIVE') {
    return res.status(400).json(fail('You already have an active stake. Unstake first.'));
  }

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient USDC balance'));
  }

  const pool = POOLS.find(p => p.days === parse.data.lockPeriodDays)!;

  try {
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:   parse.data.pin,
      fromPhone: user.phone,
      fromPublicKey: user.stellarPubKey,
      toPublicKey:   process.env.FEE_ACCOUNT!,
      amountUsdc:    parse.data.amountUsdc,
      memo:          `Stake ${parse.data.lockPeriodDays}d`,
    });

    const now      = new Date();
    const unlockAt = new Date(now.getTime() + parse.data.lockPeriodDays * 86_400_000);

    await prisma.stakePosition.upsert({
      where:  { userId: req.userId! },
      update: { amountUsdc: parse.data.amountUsdc, lockDays: parse.data.lockPeriodDays, apyBps: pool.apyBps, stakedAt: now, unlockAt, yieldClaimed: 0, status: 'ACTIVE', contractKey: hash },
      create: { userId: req.userId!, amountUsdc: parse.data.amountUsdc, lockDays: parse.data.lockPeriodDays, apyBps: pool.apyBps, stakedAt: now, unlockAt, contractKey: hash },
    });

    await notify.moneySent(req.userId!, `$${parse.data.amountUsdc} USDC`, `${parse.data.lockPeriodDays}-day stake`);
    return res.json(ok({ message: 'Staked successfully', hash, unlockAt, apy: pool.apy }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }
});

// ── POST /api/stake/unstake ───────────────────────────────────────────────────
router.post('/unstake', requireAuth, limiter, async (req: AuthRequest, res) => {
  const { pin } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const pos = await prisma.stakePosition.findUnique({ where: { userId: req.userId! } });
  if (!pos || pos.status !== 'ACTIVE') return res.status(400).json(fail('No active stake'));

  const now            = new Date();
  const secondsElapsed = (now.getTime() - pos.stakedAt.getTime()) / 1000;
  const yieldAccrued   = pos.amountUsdc * (pos.apyBps / 10000) * secondsElapsed / (365 * 24 * 3600);
  const isEarly        = now < pos.unlockAt;
  const penalty        = isEarly ? pos.amountUsdc * 0.01 : 0;
  const payout         = pos.amountUsdc - penalty + yieldAccrued;

  try {
    const hash = await platformSendUsdc(user.stellarPubKey, payout, 'Stake withdrawal');
    await prisma.stakePosition.update({
      where: { userId: req.userId! },
      data:  { status: 'WITHDRAWN' },
    });
    await notify.moneyReceived(req.userId!, `$${payout.toFixed(2)} USDC`, 'Stake withdrawal');
    return res.json(ok({ payout, penalty, yieldAccrued: +yieldAccrued.toFixed(7), earlyExit: isEarly, hash }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }
});

// ── GET /api/stake/leaderboard ────────────────────────────────────────────────
router.get('/leaderboard', requireAuth, async (_req, res) => {
  const positions = await prisma.stakePosition.findMany({
    where:   { status: 'ACTIVE' },
    orderBy: { amountUsdc: 'desc' },
    take:    10,
    select:  { amountUsdc: true, lockDays: true, apyBps: true, stakedAt: true },
  });
  return res.json(ok({ leaderboard: positions }));
});

export { router as stakeRouter };
