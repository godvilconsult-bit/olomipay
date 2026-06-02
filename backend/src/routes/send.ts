import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, userSendXlm, userSendUsdcWithFee, getFeeWalletPublic, PLATFORM_FEE_PCT } from '../services/stellar';
import { notify } from '../services/notifications';
import { emitToUser } from '../socket';
import { verifyPin } from '../services/crypto';

const router = Router();
const prisma = new PrismaClient();

const fail = (msg: string) => ({ success: false, error: msg });

const sendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many send attempts. Please wait.' },
});

const stellarAddressSchema = z.string().length(56).startsWith('G');
const phoneSchema = z.string().regex(/^\+255\d{9}$/);

// ── GET /api/send/resolve — who am I about to pay? ──────────────────────────────
// Lets the app show "You're sending to <Name>" + confirm BEFORE the irreversible
// on-chain send. Kills most "I sent to the wrong person" tickets.
router.get('/resolve', requireAuth, async (req: AuthRequest, res) => {
  const phone   = (req.query.phone   as string | undefined)?.trim();
  const address = (req.query.address as string | undefined)?.trim();

  let recipient: { phone: string; kycName: string | null; stellarPubKey: string } | null = null;
  if (phone) {
    recipient = await prisma.user.findUnique({ where: { phone }, select: { phone: true, kycName: true, stellarPubKey: true } });
  } else if (address && /^G[A-Z0-9]{55}$/.test(address)) {
    recipient = await prisma.user.findUnique({ where: { stellarPubKey: address }, select: { phone: true, kycName: true, stellarPubKey: true } });
  } else {
    return res.status(400).json(fail('Provide a phone or a valid Stellar address'));
  }

  // Don't let a user "confirm" sending to themselves.
  const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { stellarPubKey: true } });
  const isSelf = !!recipient && me?.stellarPubKey === recipient.stellarPubKey;

  if (!recipient) {
    // External Stellar address (not one of our users) — still valid, but warn.
    if (address) return res.json({ success: true, data: { found: false, external: true, name: null, address, isSelf: false } });
    return res.json({ success: true, data: { found: false, external: false, name: null, isSelf: false } });
  }

  // Mask the phone for privacy: +255 7XX XXX 012
  const p = recipient.phone;
  const masked = p.length >= 6 ? `${p.slice(0, 5)}${'•'.repeat(Math.max(0, p.length - 8))}${p.slice(-3)}` : p;

  return res.json({ success: true, data: {
    found:   true,
    external: false,
    name:    recipient.kycName ?? 'OlomiPay user',
    phoneMasked: masked,
    address: recipient.stellarPubKey,
    isSelf,
  }});
});

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
    const memoText   = memo || `OlomiPay ${toAddress.slice(0, 8)}`;
    const feeUsdc    = parseFloat((amount * PLATFORM_FEE_PCT).toFixed(7));
    const netUsdc    = parseFloat((amount - feeUsdc).toFixed(7));

    // Use direct Horizon payment with fee split (faster than Soroban for simple transfers)
    const { hash, feeWallet } = await userSendUsdcWithFee({
      encryptedSecret: user.stellarSecret,
      pin, phone: user.phone,
      publicKey: user.stellarPubKey,
      toAddress,
      grossUsdc: amount,
      memo:      memoText,
    });

    await prisma.transaction.update({
      where: { id: dbTx.id },
      data:  { status: 'CONFIRMED', stellarTxId: hash, amountUsdc: amount },
    });

    // Fee record
    await prisma.transaction.create({
      data: {
        userId:      user.id,
        type:        'FEE',
        status:      'CONFIRMED',
        amountUsdc:  feeUsdc,
        stellarTxId: hash,
        toAddress:   feeWallet,
        memo:        `1% fee on send ${dbTx.id}`,
      },
    });

    // Record receive for the recipient if they're an OlomiPay user
    const recipient = await prisma.user.findUnique({ where: { stellarPubKey: toAddress } });
    if (recipient) {
      await prisma.transaction.create({
        data: {
          userId:      recipient.id,
          type:        'RECEIVE',
          status:      'CONFIRMED',
          amountUsdc:  netUsdc,
          stellarTxId: hash,
          memo:        memoText,
        },
      });
    }

    // ── Notifications + real-time events ───────────────────────────────────
    const amtStr  = `$${netUsdc.toFixed(2)} USDC`;
    const toShort = recipient?.kycName ?? toAddress.slice(0, 8) + '…';

    // Sender: confirm sent
    notify.moneySent(user.id, amtStr, toShort).catch(() => {});
    emitToUser(user.id, 'money_sent', { hash, amount: netUsdc, feeUsdc, toAddress, asset: 'USDC' });

    // Receiver: notify if OlomiPay user
    if (recipient) {
      notify.moneyReceived(recipient.id, amtStr, user.kycName ?? user.phone.slice(-4)).catch(() => {});
      emitToUser(recipient.id, 'money_received', { hash, amount: netUsdc, from: user.kycName ?? user.phone, asset: 'USDC' });
    }

    return res.json({
      success: true,
      transactionId: dbTx.id,
      hash,
      grossUsdc:   amount,
      netUsdc,
      feeUsdc,
      feeWallet,
      message: 'Transfer complete',
    });
  } catch (err: any) {
    await prisma.transaction.update({
      where: { id: dbTx.id },
      data:  { status: 'FAILED', errorMsg: err.message },
    });
    console.error('[send/stellar]', err.message);
    return res.status(502).json({ error: 'Transfer failed: ' + err.message });
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

  // Resolve phone → address then send directly
  return res.status(200).json(
    await (async () => {
      const user = await prisma.user.findUnique({ where: { id: req.userId! } });
      if (!user) return fail('User not found');
      const validPin = await verifyPin(parse.data.pin, user.pinHash);
      if (!validPin) return fail('Incorrect PIN');
      const memo = `To ${parse.data.toPhone}`;
      const hash = await contractTransfer({
        fromEncryptedSecret: user.stellarSecret,
        fromPin:             parse.data.pin,
        fromPhone:           user.phone,
        fromPublicKey:       user.stellarPubKey,
        toPublicKey:         recipient.stellarPubKey,
        amountUsdc:          parse.data.amount,
        memo,
      });
      await prisma.transaction.create({ data: {
        userId: req.userId!, type: 'SEND', status: 'CONFIRMED',
        amountUsdc: parse.data.amount, stellarTxId: hash,
        toAddress: recipient.stellarPubKey, memo,
      }});
      return { success: true, data: { hash, message: 'Sent successfully' } };
    })()
  );
});

// ── POST /api/send/xlm ────────────────────────────────────────────────────────
// Direct XLM send for testnet testing — 1% fee auto-collected to platform wallet

router.post('/xlm', requireAuth, sendLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    toAddress: stellarAddressSchema,
    amount:    z.number().positive().max(100_000),
    memo:      z.string().max(28).optional().default(''),
    pin:       z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);

  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { toAddress, amount, memo, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.stellarPubKey === toAddress) return res.status(400).json({ error: 'Cannot send to yourself' });

  const validPin = await verifyPin(pin, user.pinHash);
  if (!validPin) return res.status(403).json({ error: 'Incorrect PIN' });

  const dbTx = await prisma.transaction.create({
    data: { userId: user.id, type: 'SEND', status: 'PENDING', amountXlm: amount, toAddress, memo: memo || undefined },
  });

  try {
    const hash = await userSendXlm({
      encryptedSecret: user.stellarSecret,
      pin, phone: user.phone,
      publicKey: user.stellarPubKey,
      toAddress, amountXlm: amount, memo,
    });

    await prisma.transaction.update({ where: { id: dbTx.id }, data: { status: 'CONFIRMED', stellarTxId: hash } });

    // Record receive for recipient if they're an OlomiPay user
    const recipient = await prisma.user.findUnique({ where: { stellarPubKey: toAddress } });
    if (recipient) {
      await prisma.transaction.create({ data: {
        userId: recipient.id, type: 'RECEIVE', status: 'CONFIRMED',
        amountXlm: amount * 0.99, stellarTxId: hash, memo: memo || undefined,
      }});
    }

    const xlmNet = amount * 0.99;
    const amtStr = `${xlmNet.toFixed(4)} XLM`;
    notify.moneySent(user.id, amtStr, toAddress.slice(0, 8) + '…').catch(() => {});
    emitToUser(user.id, 'money_sent', { hash, amount: xlmNet, fee: amount * 0.01, toAddress, asset: 'XLM' });
    if (recipient) {
      notify.moneyReceived(recipient.id, amtStr, user.kycName ?? user.phone.slice(-4)).catch(() => {});
      emitToUser(recipient.id, 'money_received', { hash, amount: xlmNet, from: user.kycName ?? user.phone, asset: 'XLM' });
    }
    return res.json({ success: true, hash, netAmount: xlmNet, fee: amount * 0.01 });
  } catch (err: any) {
    await prisma.transaction.update({ where: { id: dbTx.id }, data: { status: 'FAILED', errorMsg: err.message } });
    return res.status(502).json({ error: err.message });
  }
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
