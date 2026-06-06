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

export { router as savingsRouter };
