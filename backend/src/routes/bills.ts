import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { BILLERS, validateBillAccount, payBill } from '../services/bills';
import { contractTransfer } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { tzsToUsdc } from '../services/mpesa';
import { notify } from '../services/notifications';

const router = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 5,
  message: { success: false, error: 'Too many requests' } });

const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── GET /api/bills/billers ────────────────────────────────────────────────────

router.get('/billers', requireAuth, (_req, res) => {
  return res.json(ok({ billers: BILLERS }));
});

// ── POST /api/bills/validate ──────────────────────────────────────────────────

router.post('/validate', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    billerId:      z.string(),
    accountNumber: z.string().min(3).max(30),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const biller = BILLERS.find(b => b.id === parse.data.billerId);
  if (!biller) return res.status(404).json(fail('Biller not found'));

  const result = await validateBillAccount(parse.data.billerId, parse.data.accountNumber);
  return res.json(ok({ ...result, biller }));
});

// ── POST /api/bills/pay ───────────────────────────────────────────────────────

router.post('/pay', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    billerId:      z.string(),
    accountNumber: z.string().min(3).max(30),
    amountTzs:     z.number().int().positive(),
    pin:           z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { billerId, accountNumber, amountTzs, pin } = parse.data;

  const biller = BILLERS.find(b => b.id === billerId);
  if (!biller) return res.status(404).json(fail('Biller not found / Mtoa huduma haukupatikana'));

  if (amountTzs < biller.minAmount || amountTzs > biller.maxAmount) {
    return res.status(400).json(fail(
      `Amount must be between TZS ${biller.minAmount.toLocaleString()} and ${biller.maxAmount.toLocaleString()}`
    ));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN / PIN si sahihi'));

  const amountUsdc = await tzsToUsdc(amountTzs);

  // Create pending DB record
  const billPmt = await prisma.billPayment.create({ data: {
    userId: req.userId!, billerName: biller.name, billerCode: billerId,
    accountNumber, amountTzs, amountUsdc, status: 'PENDING',
  }});

  try {
    // Deduct USDC from user wallet
    const feeAccount = process.env.FEE_ACCOUNT!;
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:             pin,
      fromPhone:           user.phone,
      fromPublicKey:       user.stellarPubKey,
      toPublicKey:         feeAccount,
      amountUsdc,
      memo:                `Bill: ${biller.name} ${accountNumber}`,
    });

    // Process bill payment via Selcom
    const result = await payBill({
      billerId,
      accountNumber,
      amountTzs,
      reference: billPmt.id,
    });

    await prisma.billPayment.update({
      where: { id: billPmt.id },
      data: {
        status:    result.success ? 'CONFIRMED' : 'FAILED',
        reference: result.reference,
        token:     result.token,
      },
    });

    await notify.billPaid(req.userId!, biller.name, `TZS ${amountTzs.toLocaleString()}`, result.token);

    return res.json(ok({
      message:   result.message,
      reference: result.reference,
      token:     result.token,
      amountTzs,
      amountUsdc: +amountUsdc.toFixed(4),
    }));
  } catch (e: any) {
    await prisma.billPayment.update({ where: { id: billPmt.id }, data: { status: 'FAILED' } });
    return res.status(502).json(fail(e.message ?? 'Bill payment failed / Malipo hayakufanikiwa'));
  }
});

// ── GET /api/bills/history ────────────────────────────────────────────────────

router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const payments = await prisma.billPayment.findMany({
    where:   { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take:    20,
  });
  return res.json(ok({ payments }));
});

export { router as billsRouter };
