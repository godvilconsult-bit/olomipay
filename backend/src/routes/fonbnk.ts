/**
 * Fonbnk webhook receiver. Fonbnk POSTs order-status updates here; we verify the
 * signature, then reconcile the matching OlomiPay transaction.
 *
 * Set this URL in the Fonbnk dashboard → Webhooks:
 *   https://<your-backend>/api/fonbnk/webhook
 *
 * Order mapping: when an order is created (in the deposit/withdraw flow), store
 * the Fonbnk orderId on the Transaction as stellarTxId = `fonbnk:<orderId>` so
 * this handler can find it.
 */
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { verifyFonbnkWebhook, isFonbnkConfigured, fonbnkConfig } from '../services/fonbnk';
import { getSecret } from '../services/secrets';
import { notify } from '../services/notifications';

const router = Router();

// ── GET /api/fonbnk/widget-url ────────────────────────────────────────────────
// Returns a signed Fonbnk Pay widget URL. Deposits (on-ramp) open the widget
// pre-loaded with the user's Stellar wallet address — Fonbnk runs the whole
// flow (KYC + M-Pesa collection) and delivers USDC on-chain to that address.
//   ?mode=onramp|offramp  &amount=<local TZS amount, optional>
router.get('/widget-url', requireAuth, async (req: AuthRequest, res) => {
  const source       = getSecret('FONBNK_SOURCE') ?? '';
  const sigSecretB64 = getSecret('FONBNK_URL_SIGNATURE_SECRET') ?? getSecret('FONBNK_CLIENT_SECRET') ?? '';
  if (!source || !sigSecretB64 || !isFonbnkConfigured()) {
    return res.status(503).json({ success: false, error: 'Fonbnk is not configured yet' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! }, select: { stellarPubKey: true, phone: true },
  });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Widget signature is a one-time-use JWT (HS256) keyed by the base64-decoded
  // URL-signature secret, with a unique uid so each link maps to one order.
  const signature = jwt.sign({ uid: crypto.randomUUID() }, Buffer.from(sigSecretB64, 'base64'), { algorithm: 'HS256' });

  const mode  = req.query.mode === 'offramp' ? 'offramp' : 'onramp';
  const live  = fonbnkConfig.env === 'production';
  const base  = live ? 'https://pay.fonbnk.com' : 'https://sandbox-pay.fonbnk.com';
  const url   = new URL(mode === 'offramp' ? `${base}/offramp` : base);

  url.searchParams.set('source',        source);
  url.searchParams.set('signature',     signature);
  url.searchParams.set('network',       fonbnkConfig.network);   // STELLAR
  url.searchParams.set('asset',         fonbnkConfig.asset);     // USDC
  url.searchParams.set('countryIsoCode', fonbnkConfig.country);  // TZ
  url.searchParams.set('paymentChannel', 'mobile_money');
  if (mode === 'onramp') {
    url.searchParams.set('address',      user.stellarPubKey);    // deliver USDC here
    url.searchParams.set('freezeWallet', 'true');                // user can't change it
  }
  const amount = req.query.amount ? String(req.query.amount) : '';
  if (amount && /^\d+(\.\d+)?$/.test(amount)) {
    url.searchParams.set('amount',   amount);
    url.searchParams.set('currency', 'local');
    url.searchParams.set('freezeAmount', 'true');
  }

  return res.json({ success: true, data: { url: url.toString(), mode } });
});

router.post('/webhook', async (req, res) => {
  // V1 sends { data, hash }; V2 moves the hash to the x-signature header.
  const data = req.body?.data ?? req.body ?? {};
  const hash = req.body?.hash ?? (req.headers['x-signature'] as string) ?? '';

  if (!verifyFonbnkWebhook(data, hash)) {
    return res.status(401).json({ success: false, error: 'invalid signature' });
  }
  res.sendStatus(200); // acknowledge immediately; process below

  try {
    const status  = String(data?.status ?? '').toLowerCase();
    const orderId = data?.orderId;
    if (!orderId) return;

    const tx = await prisma.transaction
      .findFirst({ where: { stellarTxId: `fonbnk:${orderId}` } })
      .catch(() => null);

    // On-ramp: USDC is delivered on-chain straight to the user's Stellar wallet,
    // so "complete" just confirms our pending record + notifies.
    if (status === 'complete' || status === 'offramp_success' || status === 'transaction_confirmed') {
      if (tx && tx.status !== 'CONFIRMED') {
        await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'CONFIRMED' } });
        await notify.depositConfirmed(tx.userId, String(data?.amount ?? ''), String(data?.amountCrypto ?? '')).catch(() => {});
      }
    } else if (status === 'failed' || status === 'offramp_failed' || status === 'expired') {
      if (tx && tx.status !== 'CONFIRMED') {
        await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED' } });
      }
    }
    // other statuses (pending, validating_transaction, …) are informational
  } catch (e: any) {
    console.error('[fonbnk/webhook]', e?.message);
  }
});

export { router as fonbnkRouter };
