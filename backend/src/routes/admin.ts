import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router  = Router();
const prisma  = new PrismaClient();
const ok      = (data: any) => ({ success: true, data });
const fail    = (msg: string) => ({ success: false, error: msg });

// Simple admin guard — in production use a proper role check
async function requireAdmin(req: AuthRequest, res: Response, next: any) {
  const adminPhones = (process.env.ADMIN_PHONES ?? '').split(',');
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { phone: true } });
  if (!user || !adminPhones.includes(user.phone)) {
    return res.status(403).json(fail('Admin access required'));
  }
  return next();
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const [
    userCount, txCount, txVolume, stakePositions,
    activeStaked, chamaCount, loanCount, defaultedLoans,
    businessCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.count({ where: { status: 'CONFIRMED' } }),
    prisma.transaction.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountUsdc: true } }),
    prisma.stakePosition.count({ where: { status: 'ACTIVE' } }),
    prisma.stakePosition.aggregate({ where: { status: 'ACTIVE' }, _sum: { amountUsdc: true } }),
    prisma.chama.count({ where: { status: 'ACTIVE' } }),
    prisma.loanListing.count({ where: { status: 'FUNDED' } }),
    prisma.loanListing.count({ where: { status: 'DEFAULTED' } }),
    prisma.business.count(),
  ]);

  const totalVolume = txVolume._sum.amountUsdc ?? 0;
  const totalFees   = totalVolume * 0.01;
  const totalStaked = activeStaked._sum.amountUsdc ?? 0;
  const defaultRate = loanCount > 0 ? Math.round((defaultedLoans / (loanCount + defaultedLoans)) * 100) : 0;

  return res.json(ok({
    users:        { total: userCount },
    transactions: { total: txCount, volumeUsdc: +totalVolume.toFixed(2) },
    revenue:      { feesUsdc: +totalFees.toFixed(2) },
    staking:      { activePositions: stakePositions, totalStaked: +totalStaked.toFixed(2) },
    chamas:       { active: chamaCount },
    lending:      { active: loanCount, defaultRate: `${defaultRate}%` },
    business:     { clients: businessCount },
    updatedAt:    new Date(),
  }));
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const page  = parseInt(req.query.page as string ?? '1');
  const limit = parseInt(req.query.limit as string ?? '20');

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
      select:  { id: true, phone: true, kycStatus: true, kycName: true, createdAt: true, country: true },
    }),
    prisma.user.count(),
  ]);

  return res.json(ok({ users, total, page, pages: Math.ceil(total / limit) }));
});

// ── GET /api/admin/transactions/flagged ───────────────────────────────────────
router.get('/transactions/flagged', requireAuth, requireAdmin, async (_req, res) => {
  const flagged = await prisma.transaction.findMany({
    where:   { amountUsdc: { gt: 500 } },
    orderBy: { createdAt: 'desc' },
    take:    50,
    include: { user: { select: { phone: true, kycName: true } } },
  });
  return res.json(ok({ flagged }));
});

// ── SSE /api/admin/live — real-time stats stream ──────────────────────────────
router.get('/live', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStats = async () => {
    try {
      const [users, txVolume, stakes] = await Promise.all([
        prisma.user.count(),
        prisma.transaction.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountUsdc: true } }),
        prisma.stakePosition.aggregate({ where: { status: 'ACTIVE' }, _sum: { amountUsdc: true } }),
      ]);
      const data = JSON.stringify({
        users,
        volumeUsdc: txVolume._sum.amountUsdc ?? 0,
        stakedUsdc: stakes._sum.amountUsdc ?? 0,
        ts: Date.now(),
      });
      res.write(`data: ${data}\n\n`);
    } catch {}
  };

  await sendStats();
  const interval = setInterval(sendStats, 10_000);
  req.on('close', () => clearInterval(interval));
});

// ── POST /api/admin/audit ─────────────────────────────────────────────────────
router.post('/audit', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const log = await prisma.auditLog.create({
    data: {
      adminId:    req.userId!,
      action:     req.body.action ?? 'manual',
      resource:   req.body.resource ?? 'admin',
      resourceId: req.body.resourceId,
      metadata:   req.body.metadata,
      ipAddress:  (req.ip ?? '').replace('::ffff:', ''),
    },
  });
  return res.status(201).json(ok({ log }));
});

export { router as adminRouter };
