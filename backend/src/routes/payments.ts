import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { initiatePayment, settlePayment, providerFromPhone } from '../services/payments';

const router = Router();

// ── POST /api/payments/:orderId/initiate ─ household triggers the STK push ────────
router.post('/:orderId/initiate', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    phone:    z.string().min(7).max(20).optional(),
    provider: z.enum(['MPESA', 'TIGOPESA', 'AIRTELMONEY', 'HALOPESA', 'CARD', 'CASH']).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const order = await prisma.order.findFirst({ where: { id: req.params.orderId, householdId: req.userId }, include: { payment: true } });
  if (!order || !order.payment) return res.status(404).json({ error: 'Order not found' });
  if (order.payment.status === 'PAID') return res.status(409).json({ error: 'Order already paid' });

  const phone    = parse.data.phone ?? req.userPhone!;
  const provider = parse.data.provider ?? providerFromPhone(phone);

  if (provider === 'CASH') {
    // Pay the rider in cash on delivery — nothing to collect now.
    return res.json({ ok: true, status: 'PENDING', method: 'CASH' });
  }

  const result = await initiatePayment({ orderId: order.id, amount: order.payment.amount, phone, provider });
  res.json({ ok: true, ...result, provider });
});

// ── POST /api/payments/callback ─ aggregator webhook (live mode) ──────────────────
// AzamPay posts { reference, transactionstatus: 'success'|'failure', ... }.
// In production, verify the X-API-Key / signature header before trusting this.
router.post('/callback', async (req, res) => {
  const b = req.body ?? {};
  const ref = b.reference ?? b.externalId ?? b.utilityref ?? b.ref;
  const statusStr = String(b.transactionstatus ?? b.status ?? '').toLowerCase();
  const success = b.success === true || statusStr === 'success' || statusStr === 'completed';
  if (!ref) return res.status(400).json({ error: 'Missing reference' });

  const apiKey = req.headers['x-api-key'];
  if (process.env.AZAMPAY_API_KEY && apiKey && apiKey !== process.env.AZAMPAY_API_KEY) {
    return res.status(401).json({ error: 'Bad signature' });
  }

  await settlePayment(String(ref), Boolean(success));
  res.json({ ok: true });
});

export { router as paymentsRouter };
