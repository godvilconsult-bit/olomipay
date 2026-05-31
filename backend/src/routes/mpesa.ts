import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  initiateSTKPush,
  parseStkCallback,
  initiateB2C,
  tzsToUsdc,
  usdcToTzs,
} from '../services/mpesa';
import { platformSendUsdc, userSendUsdcToPlatform } from '../services/stellar';
import { verifyPin } from '../services/crypto';

const router = Router();
const prisma = new PrismaClient();

// Tanzania transaction limits (regulatory compliance)
const MAX_TZS_PER_TX  = 5_000_000;
const MAX_TZS_PER_DAY = 10_000_000;

const depositLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many deposit attempts. Please wait.' },
});

// ── POST /api/mpesa/deposit ────────────────────────────────────────────────────
// Triggers STK Push on user's M-Pesa phone.

router.post('/deposit', requireAuth, depositLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountTzs: z.number().int().min(500).max(MAX_TZS_PER_TX),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Daily volume check
  await checkDailyLimit(user, parse.data.amountTzs);

  // Create a pending transaction record first
  const tx = await prisma.transaction.create({
    data: {
      userId:    user.id,
      type:      'DEPOSIT',
      status:    'PENDING',
      amountTzs: parse.data.amountTzs,
    },
  });

  try {
    const stkResult = await initiateSTKPush({
      phone:       user.phone,
      amountTzs:   parse.data.amountTzs,
      reference:   tx.id,
      description: 'OlomiPay Deposit',
    });

    // Store checkout request ID so we can match the callback
    await prisma.transaction.update({
      where: { id: tx.id },
      data:  { mpesaTxId: stkResult.checkoutRequestId },
    });

    return res.json({
      message:         'STK Push sent. Check your phone to complete payment.',
      transactionId:   tx.id,
      checkoutRequestId: stkResult.checkoutRequestId,
    });
  } catch (err: any) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data:  { status: 'FAILED', errorMsg: err.message },
    });
    console.error('[mpesa/deposit] STK Push failed:', err?.response?.data ?? err.message);
    return res.status(502).json({ error: 'Failed to initiate M-Pesa payment' });
  }
});

// ── POST /api/mpesa/callback ───────────────────────────────────────────────────
// M-Pesa webhook — called by Safaricom servers on payment completion.

router.post('/callback', async (req, res) => {
  // Acknowledge receipt immediately (M-Pesa will retry if we take > 5 s)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const payload = parseStkCallback(req.body);

    if (payload.resultCode !== 0) {
      // Payment failed or cancelled by user
      await prisma.transaction.updateMany({
        where: { mpesaTxId: payload.checkoutRequestId },
        data:  { status: 'FAILED', errorMsg: payload.resultDesc },
      });
      return;
    }

    const dbTx = await prisma.transaction.findFirst({
      where:   { mpesaTxId: payload.checkoutRequestId },
      include: { user: true },
    });

    if (!dbTx) {
      console.error('[mpesa/callback] no transaction for checkoutRequestId', payload.checkoutRequestId);
      return;
    }

    // Convert TZS to USDC and credit user's Stellar account
    const amountUsdc = await tzsToUsdc(payload.amount!);

    const stellarTxHash = await platformSendUsdc(
      dbTx.user.stellarPubKey,
      amountUsdc,
      `OlomiPay deposit ${payload.mpesaReceiptNumber}`,
    );

    await prisma.transaction.update({
      where: { id: dbTx.id },
      data: {
        status:      'CONFIRMED',
        amountUsdc,
        stellarTxId: stellarTxHash,
        mpesaTxId:   payload.mpesaReceiptNumber ?? dbTx.mpesaTxId,
        memo:        `M-Pesa receipt: ${payload.mpesaReceiptNumber}`,
      },
    });

    // Update user's daily volume
    await updateDailyVolume(dbTx.user.id, dbTx.amountTzs ?? 0);

    console.log(`[mpesa/callback] deposit confirmed: ${amountUsdc} USDC → ${dbTx.user.stellarPubKey}`);
  } catch (err: any) {
    console.error('[mpesa/callback] processing error:', err.message);
  }
});

// ── POST /api/mpesa/withdraw ───────────────────────────────────────────────────
// User withdraws USDC → TZS via M-Pesa B2C.

router.post('/withdraw', requireAuth, depositLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive().max(2000), // ~5.2M TZS at 2600
    pin:        z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Verify PIN before touching funds
  const validPin = await verifyPin(parse.data.pin, user.pinHash);
  if (!validPin) return res.status(403).json({ error: 'Incorrect PIN' });

  const amountTzs = await usdcToTzs(parse.data.amountUsdc);

  if (amountTzs > MAX_TZS_PER_TX) {
    return res.status(400).json({ error: `Exceeds single-transaction limit of ${MAX_TZS_PER_TX.toLocaleString()} TZS` });
  }

  const tx = await prisma.transaction.create({
    data: {
      userId:    user.id,
      type:      'WITHDRAWAL',
      status:    'PENDING',
      amountTzs,
      amountUsdc: parse.data.amountUsdc,
    },
  });

  try {
    // Debit USDC from user's Stellar account → platform
    const stellarHash = await userSendUsdcToPlatform({
      encryptedSecret: user.stellarSecret,
      pin:             parse.data.pin,
      phone:           user.phone,
      publicKey:       user.stellarPubKey,
      amountUsdc:      parse.data.amountUsdc,
      memo:            `OlomiPay withdrawal ${tx.id}`,
    });

    // Send TZS via M-Pesa B2C
    const b2cResult = await initiateB2C({
      phone:     user.phone,
      amountTzs,
      reference: tx.id,
      remarks:   'OlomiPay withdrawal',
    });

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status:      'CONFIRMED',
        stellarTxId: stellarHash,
        mpesaTxId:   b2cResult.conversationId,
        memo:        `B2C ${b2cResult.conversationId}`,
      },
    });

    return res.json({
      message:       'Withdrawal initiated. Funds will arrive on M-Pesa shortly.',
      transactionId: tx.id,
      amountTzs,
    });
  } catch (err: any) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data:  { status: 'FAILED', errorMsg: err.message },
    });
    console.error('[mpesa/withdraw]', err.message);
    return res.status(502).json({ error: 'Withdrawal failed. Please try again.' });
  }
});

// ── POST /api/mpesa/b2c/result ─────────────────────────────────────────────────

router.post('/b2c/result', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  // Could update transaction status here if needed
  console.log('[mpesa/b2c/result]', JSON.stringify(req.body));
});

router.post('/b2c/queue', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  console.log('[mpesa/b2c/queue timeout]', JSON.stringify(req.body));
});

// ── GET /api/mpesa/rate ────────────────────────────────────────────────────────

router.get('/rate', async (_req, res) => {
  const { getUsdToTzsRate } = await import('../services/mpesa');
  const rate = await getUsdToTzsRate();
  return res.json({ usdToTzs: rate, usdcToTzs: rate });
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function checkDailyLimit(user: any, amountTzs: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = user.dailyVolumeDate && new Date(user.dailyVolumeDate) >= today;
  const current = isToday ? user.dailyVolumeTzs : 0;

  if (current + amountTzs > MAX_TZS_PER_DAY) {
    throw Object.assign(new Error('Daily limit exceeded'), { status: 400 });
  }
}

async function updateDailyVolume(userId: string, amountTzs: number) {
  const user  = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = user.dailyVolumeDate && new Date(user.dailyVolumeDate) >= today;

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyVolumeTzs:  (isToday ? user.dailyVolumeTzs : 0) + amountTzs,
      dailyVolumeDate: new Date(),
    },
  });
}

export { router as mpesaRouter };
