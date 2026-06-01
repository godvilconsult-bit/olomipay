import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance, getTransactionHistory } from '../services/stellar';

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/wallet/balance ────────────────────────────────────────────────────

router.get('/balance', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const balance = await getBalance(user.stellarPubKey);
    return res.json({ balance, publicKey: user.stellarPubKey });
  } catch (err: any) {
    console.error('[wallet/balance]', err?.message);
    return res.status(502).json({ error: 'Failed to fetch balance from Stellar' });
  }
});

// ── GET /api/wallet/address ────────────────────────────────────────────────────

router.get('/address', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { stellarPubKey: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ address: user.stellarPubKey });
});

// ── GET /api/wallet/history ────────────────────────────────────────────────────

router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 20), 50);
  const offset = Number(req.query.offset ?? 0);

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // DB transactions (Mobile Money + Stellar via our records)
  const [dbTxs, count] = await prisma.$transaction([
    prisma.transaction.findMany({
      where:   { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    offset,
    }),
    prisma.transaction.count({ where: { userId: req.userId! } }),
  ]);

  // Also pull recent on-chain payments from Horizon for completeness
  let stellarTxs: any[] = [];
  try {
    stellarTxs = await getTransactionHistory(user.stellarPubKey, 10);
  } catch {
    // Non-fatal — DB records are the source of truth for Mobile Money side
  }

  return res.json({
    transactions: dbTxs,
    stellarPayments: stellarTxs,
    total:  count,
    limit,
    offset,
  });
});

export { router as walletRouter };
