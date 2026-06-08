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
import { prisma } from '../lib/prisma';
import { verifyFonbnkWebhook } from '../services/fonbnk';
import { notify } from '../services/notifications';

const router = Router();

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
