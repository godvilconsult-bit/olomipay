import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, getBalance, platformSendUsdc } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';

const router = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 5,
  message: { success: false, error: 'Too many requests' } });

const ok  = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const APY = 4.5; // %

// ── GET /api/savings/balance ──────────────────────────────────────────────────

router.get('/balance', requireAuth, async (req: AuthRequest, res) => {
  const pos = await prisma.savingsPosition.findUnique({ where: { userId: req.userId! } });

  if (!pos || pos.principal === 0) {
    return res.json(ok({
      principal: 0, yieldEarned: 0, apy: APY,
      projectedMonthly: 0, hasPosition: false,
    }));
  }

  // Recalculate accrued yield since lastYieldAt
  const now        = new Date();
  const lastYield  = pos.lastYieldAt ?? pos.depositedAt ?? now;
  const secondsElapsed = (now.getTime() - lastYield.getTime()) / 1000;
  const newYield   = pos.principal * (APY / 100) * secondsElapsed / (365 * 24 * 3600);
  const totalYield = pos.yieldEarned + newYield;

  const projectedMonthly = pos.principal * (APY / 100) / 12;

  return res.json(ok({
    principal:        pos.principal,
    yieldEarned:      +totalYield.toFixed(7),
    apy:              APY,
    projectedMonthly: +projectedMonthly.toFixed(4),
    hasPosition:      true,
    depositedAt:      pos.depositedAt,
  }));
});

// ── POST /api/savings/deposit ─────────────────────────────────────────────────

router.post('/deposit', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive().max(100_000),
    pin:        z.string().regex(/^\d{6}/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const valid = await verifyPin(parse.data.pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN / PIN si sahihi'));

  // Check balance
  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient balance'));
  }

  try {
    // Transfer USDC from user → platform savings address
    const savingsAddress = process.env.SAVINGS_VAULT_ADDRESS ?? process.env.FEE_ACCOUNT!;
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:             parse.data.pin,
      fromPhone:           user.phone,
      fromPublicKey:       user.stellarPubKey,
      toPublicKey:         savingsAddress,
      amountUsdc:          parse.data.amountUsdc,
      memo:                'OlomiPay savings deposit',
    });

    // Upsert savings position
    const now = new Date();
    await prisma.savingsPosition.upsert({
      where:  { userId: req.userId! },
      update: {
        principal:   { increment: parse.data.amountUsdc },
        lastYieldAt: now,
      },
      create: {
        userId:      req.userId!,
        principal:   parse.data.amountUsdc,
        depositedAt: now,
        lastYieldAt: now,
      },
    });

    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'SAVINGS_DEPOSIT', status: 'CONFIRMED',
      amountUsdc: parse.data.amountUsdc, stellarTxId: hash,
      memo: 'Savings deposit',
    }});

    await notify.moneySent(req.userId!, `$${parse.data.amountUsdc.toFixed(2)} USDC`, 'Savings Vault');

    return res.json(ok({ message: 'Deposit successful', hash, amountUsdc: parse.data.amountUsdc }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Deposit failed'));
  }
});

// ── POST /api/savings/withdraw ────────────────────────────────────────────────

router.post('/withdraw', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive(),
    pin:        z.string().regex(/^\d{6}/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const valid = await verifyPin(parse.data.pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN'));

  const pos = await prisma.savingsPosition.findUnique({ where: { userId: req.userId! } });
  if (!pos || pos.principal <= 0) return res.status(400).json(fail('No savings position / Huna akiba'));

  // Early withdrawal warning: < 30 days
  const daysSinceDeposit = pos.depositedAt
    ? (Date.now() - pos.depositedAt.getTime()) / 86_400_000
    : 0;
  const earlyWithdrawal = daysSinceDeposit < 30;

  const now        = new Date();
  const secondsElapsed = ((pos.lastYieldAt ? now.getTime() - pos.lastYieldAt.getTime() : 0)) / 1000;
  const newYield   = pos.principal * (APY / 100) * secondsElapsed / (365 * 24 * 3600);
  const totalYield = pos.yieldEarned + newYield;
  const available  = pos.principal + totalYield;

  if (parse.data.amountUsdc > available) {
    return res.status(400).json(fail(`Insufficient savings. Available: $${available.toFixed(2)}`));
  }

  try {
    // Platform sends USDC back to user
    const hash = await platformSendUsdc(user.stellarPubKey, parse.data.amountUsdc, 'Savings withdrawal');

    const remaining = available - parse.data.amountUsdc;
    await prisma.savingsPosition.update({
      where: { userId: req.userId! },
      data: {
        principal:   Math.max(0, remaining),
        yieldEarned: 0,
        lastYieldAt: now,
      },
    });

    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'SAVINGS_WITHDRAW', status: 'CONFIRMED',
      amountUsdc: parse.data.amountUsdc, stellarTxId: hash,
      memo: earlyWithdrawal ? 'Early savings withdrawal' : 'Savings withdrawal',
    }});

    await notify.moneyReceived(req.userId!, `$${parse.data.amountUsdc.toFixed(2)} USDC`, 'Savings Vault');

    return res.json(ok({
      message: 'Withdrawal successful',
      hash,
      amountUsdc:      parse.data.amountUsdc,
      yieldIncluded:   +Math.min(totalYield, parse.data.amountUsdc).toFixed(7),
      earlyWithdrawal,
    }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Withdrawal failed'));
  }
});

// ── GET /api/savings/history ──────────────────────────────────────────────────

router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const txs = await prisma.transaction.findMany({
    where:   { userId: req.userId!, type: { in: ['SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAW'] } },
    orderBy: { createdAt: 'desc' },
    take:    20,
  });
  return res.json(ok({ transactions: txs }));
});

// ══════════════════════════════════════════════════════════════════════════════
// Goal-based savings — named pots ("School fees", "Rent") with progress + auto-save.
// Money still lives in the savings vault and earns the same APY; goals are the
// human-friendly layer on top so people save with purpose.
// ══════════════════════════════════════════════════════════════════════════════

const FREQ_DAYS: Record<string, number> = { weekly: 7, monthly: 30 };

function nextAutoSave(freq: string): Date | null {
  const days = FREQ_DAYS[freq];
  if (!days) return null;
  return new Date(Date.now() + days * 86_400_000);
}

// ── GET /api/savings/goals ────────────────────────────────────────────────────
router.get('/goals', requireAuth, async (req: AuthRequest, res) => {
  const goals = await prisma.savingsGoal.findMany({
    where:   { userId: req.userId!, status: { not: 'archived' } },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(ok({ goals }));
});

// ── POST /api/savings/goals ───────────────────────────────────────────────────
router.post('/goals', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:           z.string().trim().min(1).max(40),
    emoji:          z.string().max(8).optional(),
    targetAmount:   z.number().positive().max(1_000_000),
    targetDate:     z.string().datetime().optional(),
    autoSaveAmount: z.number().min(0).max(100_000).optional(),
    autoSaveFreq:   z.enum(['none', 'weekly', 'monthly']).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { name, emoji, targetAmount, targetDate, autoSaveAmount, autoSaveFreq } = parse.data;
  const freq = autoSaveFreq ?? 'none';

  const count = await prisma.savingsGoal.count({ where: { userId: req.userId!, status: 'active' } });
  if (count >= 20) return res.status(400).json(fail('You can have up to 20 active goals'));

  const goal = await prisma.savingsGoal.create({ data: {
    userId:         req.userId!,
    name,
    emoji:          emoji || '🎯',
    targetAmount,
    targetDate:     targetDate ? new Date(targetDate) : null,
    autoSaveAmount: autoSaveAmount ?? 0,
    autoSaveFreq:   freq,
    nextAutoSaveAt: (autoSaveAmount ?? 0) > 0 ? nextAutoSave(freq) : null,
  }});
  return res.json(ok({ goal }));
});

// ── PATCH /api/savings/goals/:id ──────────────────────────────────────────────
router.patch('/goals/:id', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:           z.string().trim().min(1).max(40).optional(),
    emoji:          z.string().max(8).optional(),
    targetAmount:   z.number().positive().max(1_000_000).optional(),
    targetDate:     z.string().datetime().nullable().optional(),
    autoSaveAmount: z.number().min(0).max(100_000).optional(),
    autoSaveFreq:   z.enum(['none', 'weekly', 'monthly']).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json(fail('Goal not found'));

  const d = parse.data;
  const freq = d.autoSaveFreq ?? goal.autoSaveFreq;
  const amt  = d.autoSaveAmount ?? goal.autoSaveAmount;
  const updated = await prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      name:           d.name ?? undefined,
      emoji:          d.emoji ?? undefined,
      targetAmount:   d.targetAmount ?? undefined,
      targetDate:     d.targetDate === undefined ? undefined : (d.targetDate ? new Date(d.targetDate) : null),
      autoSaveAmount: d.autoSaveAmount ?? undefined,
      autoSaveFreq:   d.autoSaveFreq ?? undefined,
      nextAutoSaveAt: amt > 0 && freq !== 'none' ? (goal.nextAutoSaveAt ?? nextAutoSave(freq)) : null,
    },
  });
  return res.json(ok({ goal: updated }));
});

// ── DELETE /api/savings/goals/:id (archive; funds stay in vault) ──────────────
router.delete('/goals/:id', requireAuth, async (req: AuthRequest, res) => {
  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json(fail('Goal not found'));
  await prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'archived' } });
  return res.json(ok({ message: 'Goal removed. Your saved money stays safely in Savings.' }));
});

// ── POST /api/savings/goals/:id/contribute ────────────────────────────────────
// Moves USDC from the user's wallet into the savings vault and credits the goal.
router.post('/goals/:id/contribute', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive().max(100_000),
    pin:        z.string().regex(/^\d{6}/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json(fail('Goal not found'));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const valid = await verifyPin(parse.data.pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN / PIN si sahihi'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient balance'));
  }

  try {
    const savingsAddress = process.env.SAVINGS_VAULT_ADDRESS ?? process.env.FEE_ACCOUNT!;
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:             parse.data.pin,
      fromPhone:           user.phone,
      fromPublicKey:       user.stellarPubKey,
      toPublicKey:         savingsAddress,
      amountUsdc:          parse.data.amountUsdc,
      memo:                'Goal savings',
    });

    const now = new Date();
    await prisma.savingsPosition.upsert({
      where:  { userId: req.userId! },
      update: { principal: { increment: parse.data.amountUsdc }, lastYieldAt: now },
      create: { userId: req.userId!, principal: parse.data.amountUsdc, depositedAt: now, lastYieldAt: now },
    });

    const newSaved = goal.savedAmount + parse.data.amountUsdc;
    const completed = newSaved >= goal.targetAmount;
    const updated = await prisma.savingsGoal.update({
      where: { id: goal.id },
      data:  { savedAmount: newSaved, status: completed ? 'completed' : 'active' },
    });

    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'SAVINGS_DEPOSIT', status: 'CONFIRMED',
      amountUsdc: parse.data.amountUsdc, stellarTxId: hash,
      memo: `Goal: ${goal.name}`,
    }});

    if (completed) await notify.goalReached(req.userId!, goal.name, `$${newSaved.toFixed(2)}`);

    return res.json(ok({ goal: updated, completed, hash }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Contribution failed'));
  }
});

// ── POST /api/savings/goals/:id/withdraw ──────────────────────────────────────
// Pulls money out of a goal back to the user's wallet (platform-signed).
router.post('/goals/:id/withdraw', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive(),
    pin:        z.string().regex(/^\d{6}/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json(fail('Goal not found'));
  if (parse.data.amountUsdc > goal.savedAmount) {
    return res.status(400).json(fail(`This goal holds $${goal.savedAmount.toFixed(2)}`));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  const valid = await verifyPin(parse.data.pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN'));

  const pos = await prisma.savingsPosition.findUnique({ where: { userId: req.userId! } });
  if (!pos || pos.principal < parse.data.amountUsdc) {
    return res.status(400).json(fail('Insufficient savings balance'));
  }

  try {
    const hash = await platformSendUsdc(user.stellarPubKey, parse.data.amountUsdc, 'Goal withdrawal');
    const now = new Date();
    await prisma.savingsPosition.update({
      where: { userId: req.userId! },
      data:  { principal: Math.max(0, pos.principal - parse.data.amountUsdc), lastYieldAt: now },
    });
    const updated = await prisma.savingsGoal.update({
      where: { id: goal.id },
      data:  { savedAmount: Math.max(0, goal.savedAmount - parse.data.amountUsdc), status: 'active' },
    });
    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'SAVINGS_WITHDRAW', status: 'CONFIRMED',
      amountUsdc: parse.data.amountUsdc, stellarTxId: hash, memo: `Goal: ${goal.name}`,
    }});
    return res.json(ok({ goal: updated, hash }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Withdrawal failed'));
  }
});

export { router as savingsRouter };
