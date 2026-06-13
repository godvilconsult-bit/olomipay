/**
 * Wallet endpoints for riders & suppliers: balance + ledger, cash-out requests,
 * and rider "settle float" (pay back cash owed to the platform).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { walletSummary, postTxn, ensureWallet } from '../services/wallet';
import { notify } from '../services/notify';

const router = Router();

// ── GET /api/wallet ─ balance + recent ledger + any pending cash-outs ────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const summary = await walletSummary(req.userId!);
  const pendingCashouts = await prisma.cashoutRequest.findMany({
    where: { userId: req.userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
  });
  res.json({ ...summary, pendingCashouts });
});

// ── POST /api/wallet/cashout ─ request a disbursement of available balance ───────
router.post('/cashout', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    amount:   z.number().positive(),
    phone:    z.string().max(20).optional(),
    provider: z.string().max(40).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const { amount, phone, provider } = parse.data;
  const w = await ensureWallet(req.userId!);
  const MIN = Number(process.env.JIKO_MIN_CASHOUT ?? 1000);
  if (amount > w.balance) return res.status(400).json({ error: 'Amount exceeds your available balance' });
  if (amount < MIN)       return res.status(400).json({ error: `Minimum cash-out is TZS ${MIN.toLocaleString()}` });

  // Reserve the funds now (debit) so the balance can't be double-spent; the
  // admin/disbursement marks it PAID without a further balance change.
  await postTxn(req.userId!, 'PAYOUT', -amount, { note: 'Cash-out requested' });
  const cr = await prisma.cashoutRequest.create({ data: { userId: req.userId!, amount, phone: phone ?? null, provider: provider ?? null } });

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, { title: 'Cash-out request 💸', body: `TZS ${amount.toLocaleString()} requested.`, type: 'payout', data: { cashoutId: cr.id } })));
  res.json({ ok: true, request: cr });
});

// ── POST /api/wallet/settle ─ rider pays back the cash float they owe ────────────
router.post('/settle', requireAuth, async (req: AuthRequest, res) => {
  const w = await ensureWallet(req.userId!);
  if (w.balance >= 0) return res.json({ ok: true, balance: w.balance, settled: 0 });
  const owed = Math.round(-w.balance);
  // Mock collection. With live AzamPay this initiates a mobile-money pull from
  // the rider; on webhook success we post the SETTLEMENT credit instead.
  const balance = await postTxn(req.userId!, 'SETTLEMENT', owed, { note: 'Float settled' });
  res.json({ ok: true, balance, settled: owed });
});

export { router as walletRouter };
