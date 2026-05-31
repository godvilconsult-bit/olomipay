import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/stellar';

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get('/stats', requireAdmin, async (_req: AuthRequest, res) => {
  const [
    totalUsers,
    totalTransactions,
    volumeStats,
    recentTxs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.count({ where: { status: 'CONFIRMED' } }),
    prisma.transaction.aggregate({
      where: { status: 'CONFIRMED', type: { in: ['DEPOSIT', 'SEND', 'WITHDRAWAL'] } },
      _sum:  { amountUsdc: true, amountTzs: true },
    }),
    prisma.transaction.findMany({
      take:    10,
      orderBy: { createdAt: 'desc' },
      where:   { status: { not: 'PENDING' } },
      include: { user: { select: { phone: true } } },
    }),
  ]);

  // Platform fee account balance
  let platformBalance = { xlm: '0', usdc: '0' };
  try {
    const feeAccount = process.env.FEE_ACCOUNT;
    if (feeAccount) platformBalance = await getBalance(feeAccount);
  } catch {}

  return res.json({
    totalUsers,
    totalTransactions,
    totalVolumeUsdc: volumeStats._sum.amountUsdc ?? 0,
    totalVolumeTzs:  volumeStats._sum.amountTzs  ?? 0,
    // Estimated fees collected (1% of USDC volume)
    estimatedFeesUsdc: ((volumeStats._sum.amountUsdc ?? 0) * 0.01).toFixed(4),
    platformBalance,
    recentTransactions: recentTxs,
  });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────

router.get('/users', requireAdmin, async (req: AuthRequest, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      take:    limit,
      skip:    offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, phone: true, stellarPubKey: true,
        kycStatus: true, createdAt: true,
        _count: { select: { transactions: true } },
      },
    }),
    prisma.user.count(),
  ]);

  return res.json({ users, total, limit, offset });
});

export { router as adminRouter };
