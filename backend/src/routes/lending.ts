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

async function getCreditScore(userId: string): Promise<number> {
  const score = await prisma.creditScore.findUnique({ where: { userId } });
  if (score) return score.score;
  // Calculate from scratch
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 40;
  const txCount   = await prisma.transaction.count({ where: { userId } });
  const monthsOld = Math.floor((Date.now() - user.createdAt.getTime()) / 2_592_000_000);
  const base = 40 + Math.min(monthsOld, 20) + Math.floor(txCount / 10);
  await prisma.creditScore.create({ data: { userId, score: Math.min(base, 100) } });
  return base;
}

// ── GET /api/lending/marketplace ──────────────────────────────────────────────
router.get('/marketplace', requireAuth, async (_req, res) => {
  const loans = await prisma.loanListing.findMany({
    where:   { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take:    20,
    include: { lender: { select: { phone: true } } },
  });
  return res.json(ok({ loans }));
});

// ── GET /api/lending/my-loans ─────────────────────────────────────────────────
router.get('/my-loans', requireAuth, async (req: AuthRequest, res) => {
  const [given, taken] = await Promise.all([
    prisma.loanListing.findMany({ where: { lenderId: req.userId! }, orderBy: { createdAt: 'desc' } }),
    prisma.loanListing.findMany({ where: { borrowerId: req.userId! }, orderBy: { createdAt: 'desc' } }),
  ]);
  return res.json(ok({ given, taken }));
});

// ── GET /api/lending/credit-score ─────────────────────────────────────────────
router.get('/credit-score', requireAuth, async (req: AuthRequest, res) => {
  const score = await getCreditScore(req.userId!);
  const breakdown = {
    base:          40,
    txBonus:       Math.min(10, 0),
    timeBonus:     0,
    repaidBonus:   0,
    defaultPenalty: 0,
  };
  return res.json(ok({ score, breakdown, tier: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor' }));
});

// ── POST /api/lending/list ────────────────────────────────────────────────────
router.post('/list', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc:   z.number().positive().max(10_000),
    interestBps:  z.number().int().min(100).max(2000),
    durationDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
    pin:          z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient USDC balance'));
  }

  // Lock lender's funds in platform wallet
  await contractTransfer({
    fromEncryptedSecret: user.stellarSecret,
    fromPin:   parse.data.pin,
    fromPhone: user.phone,
    fromPublicKey: user.stellarPubKey,
    toPublicKey:   process.env.FEE_ACCOUNT!,
    amountUsdc:    parse.data.amountUsdc,
    memo:          `Loan listing`,
  });

  const loan = await prisma.loanListing.create({
    data: {
      lenderId:     req.userId!,
      amountUsdc:   parse.data.amountUsdc,
      interestBps:  parse.data.interestBps,
      durationDays: parse.data.durationDays,
    },
  });

  return res.status(201).json(ok({ loan, message: 'Loan listed on marketplace' }));
});

// ── POST /api/lending/request ─────────────────────────────────────────────────
router.post('/request', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    loanId: z.string(),
    pin:    z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const score = await getCreditScore(req.userId!);
  if (score < 40) return res.status(403).json(fail('Credit score too low to borrow'));

  const loan = await prisma.loanListing.findUnique({ where: { id: parse.data.loanId } });
  if (!loan || loan.status !== 'OPEN') return res.status(404).json(fail('Loan not available'));
  if (loan.lenderId === req.userId) return res.status(400).json(fail('Cannot borrow your own loan'));

  // Borrower must post 10% collateral
  const collateral = loan.amountUsdc * 0.10;
  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < collateral) {
    return res.status(400).json(fail(`Need ${collateral.toFixed(2)} USDC collateral`));
  }

  // Lock collateral
  await contractTransfer({
    fromEncryptedSecret: user.stellarSecret,
    fromPin:   parse.data.pin,
    fromPhone: user.phone,
    fromPublicKey: user.stellarPubKey,
    toPublicKey:   process.env.FEE_ACCOUNT!,
    amountUsdc:    collateral,
    memo:          `Loan collateral ${loan.id}`,
  });

  // Send loan to borrower
  await platformSendUsdc(user.stellarPubKey, loan.amountUsdc, `Loan from ${loan.lenderId.slice(0,8)}`);

  const dueAt = new Date(Date.now() + loan.durationDays * 86_400_000);
  const updated = await prisma.loanListing.update({
    where: { id: loan.id },
    data:  { status: 'FUNDED', borrowerId: req.userId!, dueAt },
  });

  await notify.moneyReceived(req.userId!, `$${loan.amountUsdc} USDC`, 'Peer loan');
  return res.json(ok({ loan: updated, dueAt, message: 'Loan funded!' }));
});

// ── POST /api/lending/repay ───────────────────────────────────────────────────
router.post('/repay', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    loanId: z.string(),
    pin:    z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const loan = await prisma.loanListing.findUnique({ where: { id: parse.data.loanId } });
  if (!loan || loan.status !== 'FUNDED' || loan.borrowerId !== req.userId) {
    return res.status(404).json(fail('Active loan not found'));
  }

  const interest  = loan.amountUsdc * loan.interestBps / 10000;
  const repayment = loan.amountUsdc + interest;
  const collateral = loan.amountUsdc * 0.10;

  // Repay to lender
  await contractTransfer({
    fromEncryptedSecret: user.stellarSecret,
    fromPin:   parse.data.pin,
    fromPhone: user.phone,
    fromPublicKey: user.stellarPubKey,
    toPublicKey:   (await prisma.user.findUnique({ where: { id: loan.lenderId } }))!.stellarPubKey,
    amountUsdc:    repayment,
    memo:          `Loan repayment ${loan.id}`,
  });

  // Return collateral to borrower
  await platformSendUsdc(user.stellarPubKey, collateral, 'Collateral returned');

  await prisma.loanListing.update({ where: { id: loan.id }, data: { status: 'REPAID' } });

  // Boost credit score
  await prisma.creditScore.upsert({
    where:  { userId: req.userId! },
    update: { score: { increment: 5 }, loansRepaid: { increment: 1 } },
    create: { userId: req.userId!, score: 45, loansRepaid: 1 },
  });

  return res.json(ok({ message: 'Loan repaid! Collateral returned.', repayment, collateralReturned: collateral }));
});

export { router as lendingRouter };
