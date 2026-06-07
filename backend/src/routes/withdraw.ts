import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import axios from 'axios';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { userSendUsdcToPlatform, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';
import { checkTierLimit } from '../services/kycTiers';

const router = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 3,
  message: { success: false, error: 'Too many requests' } });

const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── Circle API helper ─────────────────────────────────────────────────────────

async function circleWireTransfer(params: {
  amountUsdc:     number;
  bankName:       string;
  accountNumber:  string;
  swiftCode:      string;
  accountName:    string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  if (!process.env.CIRCLE_API_KEY) {
    // Mock mode
    return { id: `MOCK-${params.idempotencyKey}`, status: 'pending' };
  }

  const res = await axios.post(
    'https://api.circle.com/v1/businessAccount/payouts',
    {
      idempotencyKey: params.idempotencyKey,
      amount:         { amount: params.amountUsdc.toFixed(2), currency: 'USD' },
      destination: {
        type:          'wire',
        beneficiaryBank: {
          name:          params.bankName,
          swiftCode:     params.swiftCode,
          accountNumber: params.accountNumber,
        },
        beneficiary: { name: params.accountName },
      },
    },
    {
      headers: {
        Authorization:  `Bearer ${process.env.CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );
  return { id: res.data.data.id, status: res.data.data.status };
}

// ── GET /api/withdraw/bank-accounts ──────────────────────────────────────────

router.get('/bank-accounts', requireAuth, async (req: AuthRequest, res) => {
  const accounts = await prisma.bankAccount.findMany({ where: { userId: req.userId! } });
  return res.json(ok({ accounts }));
});

// ── POST /api/withdraw/bank-accounts ─────────────────────────────────────────

router.post('/bank-accounts', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    bankName:      z.string().min(2).max(100),
    accountNumber: z.string().min(5).max(30),
    swiftCode:     z.string().min(8).max(11),
    accountName:   z.string().min(2).max(100),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { bankName, accountNumber, swiftCode, accountName } = parse.data as any;
  const account = await prisma.bankAccount.create({
    data: { userId: req.userId!, bankName, accountNumber, swiftCode, accountName },
  });
  return res.status(201).json(ok({ account }));
});

// ── POST /api/withdraw/bank ───────────────────────────────────────────────────

router.post('/bank', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc:    z.number().positive().max(50_000),
    bankAccountId: z.string().optional(),
    bankName:      z.string().optional(),
    accountNumber: z.string().optional(),
    swiftCode:     z.string().optional(),
    accountName:   z.string().optional(),
    pin:           z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { amountUsdc, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (user.kycStatus !== 'APPROVED') {
    return res.status(403).json(fail('KYC required for bank withdrawals / KYC inahitajika'));
  }

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN'));

  const lim = await checkTierLimit(req.userId!, amountUsdc, 'bank');
  if (!lim.ok) return res.status(403).json(fail(lim.error!));

  // Get bank account details
  let bankDetails: { bankName: string; accountNumber: string; swiftCode: string; accountName: string };

  if (parse.data.bankAccountId) {
    const saved = await prisma.bankAccount.findFirst({
      where: { id: parse.data.bankAccountId, userId: req.userId! },
    });
    if (!saved) return res.status(404).json(fail('Bank account not found'));
    bankDetails = saved;
  } else {
    if (!parse.data.bankName || !parse.data.accountNumber || !parse.data.swiftCode || !parse.data.accountName) {
      return res.status(400).json(fail('Bank details required'));
    }
    bankDetails = {
      bankName:      parse.data.bankName,
      accountNumber: parse.data.accountNumber,
      swiftCode:     parse.data.swiftCode,
      accountName:   parse.data.accountName,
    };
  }

  // Check balance
  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < amountUsdc) {
    return res.status(400).json(fail('Insufficient balance'));
  }

  const dbTx = await prisma.transaction.create({ data: {
    userId: req.userId!, type: 'BANK_WITHDRAWAL', status: 'PENDING',
    amountUsdc, memo: `Bank: ${bankDetails.bankName} ${bankDetails.accountNumber}`,
  }});

  try {
    // Deduct USDC from user
    const stellarHash = await userSendUsdcToPlatform({
      encryptedSecret: user.stellarSecret,
      pin,
      phone:           user.phone,
      publicKey:       user.stellarPubKey,
      amountUsdc,
      memo:            `Bank withdrawal ${dbTx.id}`,
    });

    // Initiate Circle wire transfer
    const circle = await circleWireTransfer({
      amountUsdc,
      idempotencyKey: dbTx.id,
      ...bankDetails,
    });

    await prisma.transaction.update({
      where: { id: dbTx.id },
      data: { stellarTxId: stellarHash, memo: circle.id },
    });

    return res.json(ok({
      message:          'Bank withdrawal initiated. Funds arrive in 1-3 business days.',
      transactionId:    dbTx.id,
      circlePayoutId:   circle.id,
      estimatedArrival: '1-3 business days / siku 1-3 za kazi',
      amountUsdc,
    }));
  } catch (e: any) {
    await prisma.transaction.update({ where: { id: dbTx.id }, data: { status: 'FAILED', errorMsg: e.message } });
    return res.status(502).json(fail(e.message ?? 'Bank withdrawal failed'));
  }
});

// ── POST /api/withdraw/bank/webhook ──────────────────────────────────────────
// Circle calls this when wire settles.

router.post('/bank/webhook', async (req, res) => {
  res.sendStatus(200);
  const { id, status } = req.body?.data ?? {};
  if (!id) return;

  await prisma.transaction.updateMany({
    where: { memo: id, type: 'BANK_WITHDRAWAL' },
    data:  { status: status === 'complete' ? 'CONFIRMED' : 'PENDING' },
  });
  console.log(`[circle/webhook] Payout ${id} → ${status}`);
});

export { router as withdrawRouter };
