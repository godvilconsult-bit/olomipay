import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Rate limited' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── GET /api/bonds/available ──────────────────────────────────────────────────
router.get('/available', requireAuth, async (_req, res) => {
  const bonds = await prisma.bond.findMany({
    where:   { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { holdings: true } } },
  });

  const enriched = bonds.map(bond => ({
    ...bond,
    availableUsdc: bond.totalSupply - bond.invested,
    daysToMaturity: Math.ceil((bond.maturityDate.getTime() - Date.now()) / 86_400_000),
    apyLabel:       `${(bond.couponRateBps / 100).toFixed(1)}%`,
    investorCount:  bond._count.holdings,
  }));

  return res.json(ok({ bonds: enriched }));
});

// ── GET /api/bonds/:id ────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const bond = await prisma.bond.findUnique({
    where:   { id: req.params.id },
    include: { _count: { select: { holdings: true } } },
  });
  if (!bond) return res.status(404).json(fail('Bond not found'));

  const userHolding = await prisma.bondHolding.findUnique({
    where: { bondId_userId: { bondId: req.params.id, userId: req.userId! } },
  });

  let accrued = 0;
  if (userHolding) {
    const secondsHeld = (Date.now() - userHolding.investedAt.getTime()) / 1000;
    accrued = userHolding.amountInvested * (bond.couponRateBps / 10000) * secondsHeld / (365 * 24 * 3600);
  }

  return res.json(ok({ bond, userHolding, accruedInterest: +accrued.toFixed(7) }));
});

// ── GET /api/bonds/portfolio ──────────────────────────────────────────────────
router.get('/portfolio', requireAuth, async (req: AuthRequest, res) => {
  const holdings = await prisma.bondHolding.findMany({
    where:   { userId: req.userId! },
    include: { bond: true },
    orderBy: { investedAt: 'desc' },
  });

  const enriched = holdings.map(h => {
    const secondsHeld = (Date.now() - h.investedAt.getTime()) / 1000;
    const accrued = h.amountInvested * (h.bond.couponRateBps / 10000) * secondsHeld / (365 * 24 * 3600);
    return {
      ...h,
      accruedInterest: +accrued.toFixed(7),
      daysToMaturity:  Math.ceil((h.bond.maturityDate.getTime() - Date.now()) / 86_400_000),
      isMatured:       Date.now() >= h.bond.maturityDate.getTime(),
    };
  });

  const totalInvested = enriched.reduce((sum, h) => sum + h.amountInvested, 0);
  const totalAccrued  = enriched.reduce((sum, h) => sum + h.accruedInterest, 0);

  return res.json(ok({ holdings: enriched, totalInvested, totalAccrued }));
});

// ── POST /api/bonds/invest ────────────────────────────────────────────────────
router.post('/invest', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    bondId:    z.string(),
    amountUsdc: z.number().positive().max(1_000_000),
    pin:       z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const bond = await prisma.bond.findUnique({ where: { id: parse.data.bondId } });
  if (!bond || bond.status !== 'OPEN') return res.status(404).json(fail('Bond not available'));
  if (parse.data.amountUsdc < bond.minInvestment) {
    return res.status(400).json(fail(`Minimum investment is ${bond.minInvestment} USDC`));
  }
  if (bond.invested + parse.data.amountUsdc > bond.totalSupply) {
    return res.status(400).json(fail('Exceeds available bond supply'));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient USDC balance'));
  }

  try {
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:   parse.data.pin,
      fromPhone: user.phone,
      fromPublicKey: user.stellarPubKey,
      toPublicKey:   process.env.FEE_ACCOUNT!,
      amountUsdc:    parse.data.amountUsdc,
      memo:          `Bond: ${bond.name.slice(0, 20)}`,
    });

    const holding = await prisma.bondHolding.upsert({
      where:  { bondId_userId: { bondId: bond.id, userId: req.userId! } },
      update: { amountInvested: { increment: parse.data.amountUsdc } },
      create: { bondId: bond.id, userId: req.userId!, amountInvested: parse.data.amountUsdc },
    });

    await prisma.bond.update({
      where: { id: bond.id },
      data:  { invested: { increment: parse.data.amountUsdc } },
    });

    await notify.moneySent(req.userId!, `$${parse.data.amountUsdc}`, `${bond.name} bond`);

    return res.json(ok({
      holding,
      hash,
      projectedReturn: +(parse.data.amountUsdc * (bond.couponRateBps / 10000)).toFixed(4),
      message:         `Invested $${parse.data.amountUsdc} in ${bond.name}`,
    }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }
});

// ── POST /api/bonds/redeem ────────────────────────────────────────────────────
router.post('/redeem', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    bondId: z.string(),
    pin:    z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const bond = await prisma.bond.findUnique({ where: { id: parse.data.bondId } });
  if (!bond) return res.status(404).json(fail('Bond not found'));
  if (Date.now() < bond.maturityDate.getTime()) {
    return res.status(400).json(fail(`Bond matures on ${bond.maturityDate.toLocaleDateString()}`));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const holding = await prisma.bondHolding.findUnique({
    where: { bondId_userId: { bondId: bond.id, userId: req.userId! } },
  });
  if (!holding || holding.amountInvested <= 0) return res.status(404).json(fail('No holding found'));

  const secondsHeld = (Date.now() - holding.investedAt.getTime()) / 1000;
  const coupon  = holding.amountInvested * (bond.couponRateBps / 10000) * secondsHeld / (365 * 24 * 3600);
  const payout  = holding.amountInvested + coupon;

  const { platformSendUsdc } = await import('../services/stellar');
  await platformSendUsdc(user.stellarPubKey, payout, `Bond redemption: ${bond.name}`);

  await prisma.bondHolding.update({
    where: { bondId_userId: { bondId: bond.id, userId: req.userId! } },
    data:  { amountInvested: 0, couponClaimed: { increment: coupon } },
  });

  await notify.moneyReceived(req.userId!, `$${payout.toFixed(2)}`, 'Bond maturity');

  return res.json(ok({ payout, coupon: +coupon.toFixed(7), principal: holding.amountInvested }));
});

// ── Admin: seed bonds ─────────────────────────────────────────────────────────
router.post('/admin/seed', async (_req, res) => {
  const bonds = await prisma.bond.createMany({
    data: [
      {
        name:           'TZ Treasury Bill Q3 2026',
        faceValueUsdc:  100,
        couponRateBps:  1200,
        maturityDate:   new Date('2026-09-30'),
        totalSupply:    1_000_000,
        minInvestment:  10,
        description:    'Issued by Bank of Tanzania. 12% annual yield. Minimum $10 USDC.',
      },
      {
        name:           'TZ Infrastructure Bond 2027',
        faceValueUsdc:  500,
        couponRateBps:  1500,
        maturityDate:   new Date('2027-06-30'),
        totalSupply:    5_000_000,
        minInvestment:  50,
        description:    'Financing Tanzania road infrastructure. 15% annual yield.',
      },
    ],
    skipDuplicates: true,
  });
  return res.json({ ok: true, created: bonds.count });
});

export { router as bondsRouter };
