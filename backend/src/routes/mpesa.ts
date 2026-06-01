/**
 * Mobile Money routes — M-Pesa, Airtel, Tigo, MTN etc.
 *
 * DEPOSIT FLOW (transparent — same on testnet as mainnet):
 *   User pays local currency via STK Push
 *   -> Daraja callback fires
 *   -> Yellow Card API: local currency -> USDC (simulated on sandbox)
 *   -> Platform sends net USDC to user's Stellar wallet
 *   -> 1% platform fee stays in FEE_ACCOUNT wallet
 *   -> Stellar network fee (~0.00001 XLM) paid by platform
 *
 * WITHDRAWAL FLOW:
 *   User withdraws USDC -> local currency
 *   -> USDC pulled from user wallet -> platform wallet
 *   -> Yellow Card: USDC -> local currency
 *   -> B2C payout to user's phone
 *   -> 1% fee deducted before conversion
 */

import { Router }       from 'express';
import rateLimit        from 'express-rate-limit';
import { z }            from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  calculateDepositFees,
  calculateWithdrawFees,
  createDepositOrder,
  createWithdrawOrder,
  getRate,
  getXlmPrice,
  getChannelsForUI,
  findChannel,
  detectNetwork,
  phoneToChannel,
  isYCSandbox,
  verifyYCWebhook,
} from '../services/yellowcard';
import {
  platformSendUsdcWithFee,
  platformSendUsdc,
  userSendUsdcToPlatform,
  getAccountInfo,
  getFeeWalletPublic,
} from '../services/stellar';
import { verifyPin }   from '../services/crypto';
import { notify }      from '../services/notifications';
import { emitToUser }  from '../socket';

const router = Router();
const prisma  = new PrismaClient();
const MAX_TZS_PER_TX  = 5_000_000;
const MAX_TZS_PER_DAY = 10_000_000;
const depositLimiter  = rateLimit({ windowMs: 60_000, max: 5, message: { error: 'Too many attempts.' } });

// Lazy-load the MNO service (has separate TS issues that don't affect runtime)
async function getMno() {
  return await import('../services/mpesa');
}

// ── GET /api/mpesa/channels ────────────────────────────────────────────────────
// Returns all active Yellow Card channels — used by frontend to show
// exactly which mobile money providers are supported and their limits.
// Filters out inactive channels as Yellow Card recommends.

router.get('/channels', async (req, res) => {
  try {
    const result = await getChannelsForUI();
    return res.json({ success: true, ...result });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// ── GET /api/mpesa/rate ────────────────────────────────────────────────────────

router.get('/rate', async (req, res) => {
  const currency = ((req.query.currency as string) ?? 'TZS').toUpperCase();
  try {
    const [rate, xlmPrice] = await Promise.all([getRate(currency), getXlmPrice()]);
    const example = await calculateDepositFees(10_000, currency, 1);
    return res.json({
      currency,
      usdBuyRate:    rate.usdBuyRate,
      usdSellRate:   rate.usdSellRate,
      usdcToTzs:     rate.usdBuyRate,
      usdToTzs:      rate.usdBuyRate,
      midRate:       (rate.usdBuyRate + rate.usdSellRate) / 2,
      ycSpreadPct:   rate.ycSpreadPct,
      rateSource:    rate.source,
      xlmPriceUsd:   xlmPrice,
      stellarFeeXlm: 0.00001,
      platformFeePct: 1,
      isSandbox:     isYCSandbox,
      exampleFees:   example,
    });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// ── GET /api/mpesa/fee-preview ─────────────────────────────────────────────────

router.get('/fee-preview', requireAuth, async (req, res) => {
  const amount   = Number(req.query.amount ?? 0);
  const currency = ((req.query.currency as string) ?? 'TZS').toUpperCase();
  const type     = (req.query.type as string ?? 'deposit') as 'deposit' | 'withdraw';
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' });
  try {
    const fees = type === 'withdraw'
      ? await calculateWithdrawFees(amount, currency)
      : await calculateDepositFees(amount, currency);
    return res.json({ success: true, fees, isSandbox: isYCSandbox });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// ── POST /api/mpesa/deposit ────────────────────────────────────────────────────

router.post('/deposit', requireAuth, depositLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountTzs: z.number().int().min(500).max(MAX_TZS_PER_TX),
    currency:  z.string().length(3).default('TZS').transform(v => v.toUpperCase()),
  }).safeParse(req.body);

  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { amountTzs, currency } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await checkDailyLimit(user, amountTzs);

  // Detect network from phone prefix and find the right YC channel
  const networkHint = detectNetwork(user.phone);
  const channel     = await findChannel(currency, 'momo', networkHint);
  const fees        = await calculateDepositFees(amountTzs, currency, 1, networkHint);

  // Validate amount against channel limits
  if (channel) {
    if (amountTzs < channel.minAmount)
      return res.status(400).json({ error: `Minimum deposit is ${channel.minAmount.toLocaleString()} ${currency} for ${channel.name}` });
    if (amountTzs > channel.maxAmount)
      return res.status(400).json({ error: `Maximum deposit is ${channel.maxAmount.toLocaleString()} ${currency} for ${channel.name}` });
  }

  const tx = await prisma.transaction.create({
    data: {
      userId:    user.id,
      type:      'DEPOSIT',
      status:    'PENDING',
      amountTzs,
      amountUsdc: fees.netUsdc,
      memo: JSON.stringify({
        fees,
        channelId:   fees.channelId,
        channelName: fees.channelName,
        networkHint,
        provider:    isYCSandbox ? 'yellowcard_sandbox' : 'yellowcard',
      }),
    },
  });

  try {
    const mno = await getMno();
    const stk = await (mno as any).initiatemobile_moneyPush({
      phone: user.phone, amountTzs, reference: tx.id,
      description: `OlomiPay receive ${fees.netUsdc.toFixed(2)} USDC`,
    });

    await prisma.transaction.update({ where: { id: tx.id }, data: { mpesaTxId: stk.checkoutRequestId } });

    return res.json({
      success: true,
      message: 'Mobile Money prompt sent. Approve on your phone.',
      transactionId: tx.id,
      fees,
      isSandbox: isYCSandbox,
    });
  } catch (err: any) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED', errorMsg: err.message } });
    console.error('[mpesa/deposit]', err.message);
    return res.status(502).json({ error: 'Mobile money initiation failed: ' + err.message });
  }
});

// ── POST /api/mpesa/callback ───────────────────────────────────────────────────

router.post('/callback', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const mno     = await getMno();
    const payload = (mno as any).parseStkCallback(req.body);
    console.log(`[callback] code=${payload.resultCode} ref=${payload.checkoutRequestId}`);

    if (payload.resultCode !== 0) {
      await prisma.transaction.updateMany({
        where: { mpesaTxId: payload.checkoutRequestId },
        data:  { status: 'FAILED', errorMsg: payload.resultDesc },
      });
      return;
    }

    const dbTx = await prisma.transaction.findFirst({
      where: { mpesaTxId: payload.checkoutRequestId }, include: { user: true },
    });
    if (!dbTx) { console.error('[callback] no tx for', payload.checkoutRequestId); return; }

    let storedMemo: any = {};
    try { storedMemo = JSON.parse(dbTx.memo ?? '{}'); } catch {}

    const actualAmount = payload.amount ?? dbTx.amountTzs ?? 0;
    const currency     = storedMemo.fees?.localCurrency ?? 'TZS';
    // Use the real channelId resolved at deposit time, or re-resolve now
    const channelId    = storedMemo.channelId
      || (await findChannel(currency, 'momo', storedMemo.networkHint ?? detectNetwork(dbTx.user.phone)))?.id
      || phoneToChannel(dbTx.user.phone, currency);

    // Step 1: Yellow Card converts local -> USDC
    const ycOrder = await createDepositOrder({
      localAmount: actualAmount, localCurrency: currency,
      channelId, senderPhone: dbTx.user.phone,
      stellarAddress: dbTx.user.stellarPubKey, referenceId: dbTx.id,
    });
    const grossUsdc   = ycOrder.fees.grossUsdc;   // full USDC before platform fee
    const feeWallet   = getFeeWalletPublic();
    console.log(`[callback] YC order: ${ycOrder.id} -> ${grossUsdc} USDC gross | fee wallet: ${feeWallet.slice(0,8)}...`);

    // Step 2: Safety check — platform wallet has enough gross USDC
    if (!isYCSandbox) {
      const platformPub = process.env.STELLAR_PUBLIC_KEY ?? feeWallet;
      const platformAcc = await getAccountInfo(platformPub).catch(() => null);
      const platformBal = parseFloat(platformAcc?.usdc ?? '0');
      if (platformAcc && platformBal < grossUsdc) {
        console.error(`[callback] FLOAT LOW: ${platformBal} USDC, need ${grossUsdc}`);
        await prisma.transaction.update({
          where: { id: dbTx.id },
          data:  { status: 'FAILED', errorMsg: `Float too low: ${platformBal.toFixed(4)} USDC available, ${grossUsdc.toFixed(4)} needed` },
        });
        return;
      }
    }

    // Step 3: ATOMIC — send net USDC (99%) to user + fee (1%) to fee wallet in ONE tx
    const memo = `OlomiPay ${(payload.mpesaReceiptNumber ?? ycOrder.id).slice(0, 20)}`;
    const { hash: stellarHash, netUsdc, feeUsdc } = await platformSendUsdcWithFee(
      dbTx.user.stellarPubKey,
      grossUsdc,
      memo,
    );
    console.log(`[callback] ✓ Stellar: ${stellarHash} | user=${netUsdc} USDC fee=${feeUsdc} USDC -> ${feeWallet.slice(0,8)}...`);

    // Step 4: Record fee transaction
    await prisma.transaction.create({
      data: {
        userId:      dbTx.userId,
        type:        'FEE',
        status:      'CONFIRMED',
        amountUsdc:  feeUsdc,
        stellarTxId: stellarHash,
        toAddress:   feeWallet,
        memo:        `1% fee on deposit ${dbTx.id}`,
      },
    });

    // Step 5: Update original transaction
    await prisma.transaction.update({
      where: { id: dbTx.id },
      data: {
        status:      'CONFIRMED',
        amountUsdc:  netUsdc,
        amountTzs:   actualAmount,
        stellarTxId: stellarHash,
        mpesaTxId:   payload.mpesaReceiptNumber ?? dbTx.mpesaTxId,
        memo: JSON.stringify({
          ycOrderId:    ycOrder.id,
          mpesaReceipt: payload.mpesaReceiptNumber,
          grossUsdc,
          netUsdc,
          feeUsdc,
          feeWallet,
          fees:     ycOrder.fees,
          stellarHash,
          provider: isYCSandbox ? 'yellowcard_sandbox' : 'yellowcard',
        }),
      },
    });

    await updateDailyVolume(dbTx.userId, actualAmount);
    console.log(`[callback] DONE: ${actualAmount} ${currency} -> ${netUsdc} USDC (fee ${feeUsdc}) -> ${dbTx.user.phone}`);

    // ── Push notification + real-time socket event ─────────────────────────
    notify.depositConfirmed(dbTx.userId, actualAmount.toLocaleString(), `$${netUsdc.toFixed(2)} USDC`).catch(() => {});
    emitToUser(dbTx.userId, 'deposit_confirmed', {
      amountLocal: actualAmount,
      currency,
      amountUsdc:  netUsdc,
      feeUsdc,
      stellarTxId: stellarHash,
      mpesaReceipt: payload.mpesaReceiptNumber,
    });

  } catch (err: any) {
    console.error('[callback] ERROR:', err.message);
  }
});

// ── POST /api/mpesa/withdraw ───────────────────────────────────────────────────

router.post('/withdraw', requireAuth, depositLimiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive().max(2000),
    currency:   z.string().length(3).default('TZS').transform(v => v.toUpperCase()),
    pin:        z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);

  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { amountUsdc, currency, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const validPin = await verifyPin(pin, user.pinHash);
  if (!validPin) return res.status(403).json({ error: 'Incorrect PIN' });

  const fees = await calculateWithdrawFees(amountUsdc, currency, 2) as any;
  if (fees.localPayout > MAX_TZS_PER_TX)
    return res.status(400).json({ error: `Exceeds limit of ${MAX_TZS_PER_TX.toLocaleString()} ${currency}` });

  const tx = await prisma.transaction.create({
    data: {
      userId: user.id, type: 'WITHDRAWAL', status: 'PENDING',
      amountUsdc, amountTzs: fees.localPayout,
      memo: JSON.stringify({ fees }),
    },
  });

  try {
    const stellarHash = await userSendUsdcToPlatform({
      encryptedSecret: user.stellarSecret, pin, phone: user.phone,
      publicKey: user.stellarPubKey, amountUsdc,
      memo: `OlomiPay withdraw ${tx.id}`.slice(0, 28),
    });

    const ycOrder  = await createWithdrawOrder({
      amountUsdc, localCurrency: currency,
      channelId: phoneToChannel(user.phone, currency),
      recipientPhone: user.phone, referenceId: tx.id,
    });

    const mno      = await getMno();
    const b2cResult = await (mno as any).initiateB2C({
      phone: user.phone, amountTzs: fees.localPayout,
      reference: tx.id, remarks: 'OlomiPay withdrawal',
    });

    await prisma.transaction.create({
      data: {
        userId: user.id, type: 'FEE', status: 'CONFIRMED',
        amountUsdc: fees.platformFeeUsdc, stellarTxId: stellarHash,
        memo: `1% fee withdrawal ${tx.id}`,
      },
    });

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: 'CONFIRMED', stellarTxId: stellarHash,
        mpesaTxId: b2cResult.conversationId,
        memo: JSON.stringify({ ycOrderId: ycOrder.id, b2cId: b2cResult.conversationId, fees, stellarHash }),
      },
    });

    return res.json({
      success: true,
      message: 'Withdrawal initiated. Funds arriving on mobile money shortly.',
      transactionId: tx.id, localPayout: fees.localPayout, currency, fees, isSandbox: isYCSandbox,
    });
  } catch (err: any) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED', errorMsg: err.message } });
    console.error('[withdraw]', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// ── Yellow Card webhook ────────────────────────────────────────────────────────

router.post('/yc/webhook', async (req, res) => {
  const sig = req.headers['x-yc-signature'] as string ?? '';
  if (!verifyYCWebhook(JSON.stringify(req.body), sig)) return res.status(401).json({ error: 'Bad sig' });
  res.json({ received: true });
  const { id: orderId, status, sequenceId } = req.body;
  console.log(`[yc/webhook] order=${orderId} status=${status}`);
  if (sequenceId) {
    const mapped = status === 'completed' ? 'CONFIRMED' : status === 'failed' ? 'FAILED' : 'PENDING';
    await prisma.transaction.updateMany({ where: { id: sequenceId }, data: { status: mapped } }).catch(() => {});
  }
});

router.post('/b2c/result', async (req, res) => { res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); });
router.post('/b2c/queue',  async (req, res) => { res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function checkDailyLimit(user: any, amountTzs: number) {
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const isToday = user.dailyVolumeDate && new Date(user.dailyVolumeDate) >= today;
  const current = isToday ? user.dailyVolumeTzs : 0;
  if (current + amountTzs > MAX_TZS_PER_DAY)
    throw Object.assign(new Error(`Daily limit: max ${MAX_TZS_PER_DAY.toLocaleString()} TZS per day`), { status: 400 });
}

async function updateDailyVolume(userId: string, amount: number) {
  const user  = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const isToday = user.dailyVolumeDate && new Date(user.dailyVolumeDate) >= today;
  await prisma.user.update({
    where: { id: userId },
    data:  { dailyVolumeTzs: (isToday ? user.dailyVolumeTzs : 0) + amount, dailyVolumeDate: new Date() },
  });
}

export { router as mpesaRouter };
