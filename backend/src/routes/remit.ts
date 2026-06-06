/**
 * Cross-border send — let a user send their USD balance to a loved one in
 * another country, who receives it straight into their mobile-money wallet in
 * local currency. The "send money home" rail for Africa/Asia.
 *
 * Mechanics: debit the sender's USDC to the platform, then Yellow Card pays
 * out local currency to the recipient's phone. No crypto shown to either side.
 *
 * NOTE: real payouts require Yellow Card PRODUCTION credentials. In sandbox the
 * order completes instantly as a simulation (isSandbox:true in responses).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { userSendUsdcToPlatform, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';
import { getChannelsForUI, calculateWithdrawFees, createWithdrawOrder } from '../services/yellowcard';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true, data });
const fail = (msg: string) => ({ success: false, error: msg });

// Friendly country metadata for the destination picker.
const COUNTRY_META: Record<string, { name: string; flag: string; dial: string }> = {
  TZ: { name: 'Tanzania',  flag: '🇹🇿', dial: '255' },
  KE: { name: 'Kenya',     flag: '🇰🇪', dial: '254' },
  UG: { name: 'Uganda',    flag: '🇺🇬', dial: '256' },
  GH: { name: 'Ghana',     flag: '🇬🇭', dial: '233' },
  ZM: { name: 'Zambia',    flag: '🇿🇲', dial: '260' },
  NG: { name: 'Nigeria',   flag: '🇳🇬', dial: '234' },
  RW: { name: 'Rwanda',    flag: '🇷🇼', dial: '250' },
  SN: { name: 'Senegal',   flag: '🇸🇳', dial: '221' },
};

// ── GET /api/remit/countries ──────────────────────────────────────────────────
// Destination picker: groups Yellow Card channels by country.
router.get('/countries', requireAuth, async (_req, res) => {
  const { channels, isSandbox } = await getChannelsForUI();
  const byCountry: Record<string, any> = {};
  for (const c of channels) {
    if (!c.active) continue;
    const meta = COUNTRY_META[c.country];
    if (!meta) continue;
    byCountry[c.country] ??= {
      country: c.country, currency: c.currency,
      name: meta.name, flag: meta.flag, dial: meta.dial, channels: [],
    };
    byCountry[c.country].channels.push({
      id: c.id, name: c.name, type: c.type, minAmount: c.minAmount, maxAmount: c.maxAmount,
    });
  }
  return res.json(ok({ countries: Object.values(byCountry), isSandbox }));
});

// ── POST /api/remit/quote ─────────────────────────────────────────────────────
// How much local currency the recipient gets for a given USD amount.
router.post('/quote', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc: z.number().positive().max(50_000),
    currency:   z.string().min(2).max(5),
    network:    z.string().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  try {
    const fees = await calculateWithdrawFees(parse.data.amountUsdc, parse.data.currency.toUpperCase(), 2, parse.data.network);
    return res.json(ok({
      amountUsdc:   parse.data.amountUsdc,
      currency:     parse.data.currency.toUpperCase(),
      localPayout:  fees.localPayout,
      rate:         fees.ycBuyRate,
      feeUsdc:      fees.platformFeeUsdc,
      totalDebit:   parse.data.amountUsdc,
      estimatedMins: fees.estimatedMins,
      isSandbox:    fees.isTestnet,
    }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Could not get quote'));
  }
});

// ── POST /api/remit/send ──────────────────────────────────────────────────────
router.post('/send', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    amountUsdc:     z.number().positive().max(50_000),
    currency:       z.string().min(2).max(5),
    channelId:      z.string().min(1),
    recipientPhone: z.string().min(6).max(20),
    recipientName:  z.string().max(60).optional(),
    network:        z.string().optional(),
    pin:            z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { amountUsdc, currency, channelId, recipientPhone, recipientName, network, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN / PIN si sahihi'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < amountUsdc) return res.status(400).json(fail('Insufficient balance'));

  const dbTx = await prisma.transaction.create({ data: {
    userId: req.userId!, type: 'REMITTANCE', status: 'PENDING',
    amountUsdc, memo: `To ${recipientName ?? recipientPhone} (${currency.toUpperCase()})`,
  }});

  try {
    // 1) Debit sender's USDC to the platform.
    const stellarHash = await userSendUsdcToPlatform({
      encryptedSecret: user.stellarSecret,
      pin,
      phone:     user.phone,
      publicKey: user.stellarPubKey,
      amountUsdc,
      memo:      `Remittance ${dbTx.id}`,
    });

    // 2) Yellow Card pays out local currency to the recipient's mobile money.
    const order = await createWithdrawOrder({
      amountUsdc,
      localCurrency:  currency.toUpperCase(),
      channelId,
      networkId:      network,
      recipientPhone: recipientPhone.replace(/^\+/, ''),
      referenceId:    dbTx.id,
    });

    const settled = order.status === 'completed';
    await prisma.transaction.update({
      where: { id: dbTx.id },
      data: { status: settled ? 'CONFIRMED' : 'PENDING', stellarTxId: stellarHash,
        memo: `${recipientName ?? recipientPhone}: ${order.localPayout} ${currency.toUpperCase()} [${order.id}]` },
    });

    await notify.moneySent(req.userId!, `$${amountUsdc.toFixed(2)}`, recipientName ?? recipientPhone);

    return res.json(ok({
      message:       settled ? 'Money sent!' : 'Sending — your recipient will get the money shortly.',
      transactionId: dbTx.id,
      localPayout:   order.localPayout,
      currency:      currency.toUpperCase(),
      recipient:     recipientName ?? recipientPhone,
      status:        order.status,
      isSandbox:     (order.fees as any)?.isTestnet ?? false,
    }));
  } catch (e: any) {
    await prisma.transaction.update({ where: { id: dbTx.id }, data: { status: 'FAILED', errorMsg: e.message } }).catch(() => {});
    return res.status(502).json(fail(e.message ?? 'Send failed'));
  }
});

export { router as remitRouter };
