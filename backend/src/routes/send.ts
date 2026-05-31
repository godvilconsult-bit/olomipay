import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer } from '../services/stellar';
import { verifyPin } from '../services/crypto';

const router = Router();
const prisma = new PrismaClient();

const sendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many send attempts. Please wait.' },
});

const stellarAddressSchema = z.string().length(56).startsWith('G');
const phoneSchema = z.string().regex(/^\+255\d{9}$/);

// ── POST /api/send/stellar ─────────────────────────────────────────────────────

router.post('/stellar', requireAuth, sendLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    toAddress: stellarAddressSchema,
    amount:    z.number().positive().max(100_000),
    asset:     z.enum(['USDC', 'XLM']).default('USDC'),
    memo:      z.string().max(28).optional().default(''),
    pin:       z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const { toAddress, amount, asset, memo, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.stellarPubKey === toAddress) {
    return res.status(400).json({ error: 'Cannot send to yourself' });
  }

  const validPin = await verifyPin(pin, user.pinHash);
  if (!validPin) return res.status(403).json({ error: 'Incorrect PIN' });

  const dbTx = await prisma.transaction.create({
    data: {
      userId:    user.id,
      type:      'SEND',
      status:    'PENDING',
      amountUsdc: asset === 'USDC' ? amount : undefined,
      toAddress,
      memo:      memo || undefined,
    },
  });

  try {
    const memoText = memo || `OlomiPay send to ${toAddress.slice(0, 8)}...`;
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:             pin,
      fromPhone:           user.phone,
      fromPublicKey:       user.stellarPubKey,
      toPublicKey:         toAddress,
      amountUsdc:          amount,
      memo:                memoText,
    });

    await prisma.transaction.update({
      where: { id: dbTx.id },
      data:  { status: 'CONFIRMED', stellarTxId: hash },
    });

    // Record receive for the recipient if they're also an OlomiPay user
    const recipient = await prisma.user.findUnique({ where: { stellarPubKey: toAddress } });
    if (recipient) {
      await prisma.transaction.create({
        data: {
          userId:     recipient.id,
          type:       'RECEIVE',
          status:     'CONFIRMED',
          amountUsdc: asset === 'USDC' ? amount : undefined,
          stellarTxId: hash,
          memo:        memoText,
        },
      });
    }

    return res.json({ message: 'Transfer complete', transactionId: dbTx.id, hash });
  } catch (err: any) {
    await prisma.transaction.update({
      where: { id: dbTx.id },
      data:  { status: 'FAILED', errorMsg: err.message },
    });
    console.error('[send/stellar]', err.message);
    return res.status(502).json({ error: 'Transfer failed. Please try again.' });
  }
});

// ── POST /api/send/phone ───────────────────────────────────────────────────────
// Send by phone number — resolves to Stellar address then calls the same logic.

router.post('/phone', requireAuth, sendLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    toPhone: phoneSchema,
    amount:  z.number().positive().max(100_000),
    asset:   z.enum(['USDC', 'XLM']).default('USDC'),
    pin:     z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const recipient = await prisma.user.findUnique({
    where:  { phone: parse.data.toPhone },
    select: { stellarPubKey: true },
  });

  if (!recipient) {
    return res.status(404).json({
      error: 'No OlomiPay account found for that phone number. Ask them to sign up first.',
    });
  }

  // Delegate to the stellar endpoint
  req.body.toAddress = recipient.stellarPubKey;
  req.body.memo      = `To +${parse.data.toPhone.slice(1)}`;
  return (router as any).handle(
    { ...req, url: '/stellar', path: '/stellar' } as any,
    res,
    () => {},
  );
});

// ── GET /api/send/fee-preview ──────────────────────────────────────────────────

router.get('/fee-preview', requireAuth, async (req, res) => {
  const amount = Number(req.query.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount query param required' });
  }

  const feePct   = 0.01; // 1 % — mirrors on-chain fee_bps = 100
  const fee      = amount * feePct;
  const netAmount = amount - fee;

  return res.json({
    grossAmount: amount,
    fee:         +fee.toFixed(7),
    netAmount:   +netAmount.toFixed(7),
    feePct:      1,
  });
});

export { router as sendRouter };
