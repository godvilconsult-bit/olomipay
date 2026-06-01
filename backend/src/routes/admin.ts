import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma  = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

async function requireAdmin(req: AuthRequest, res: any, next: any) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return res.status(403).json(fail('Admin access required'));
  next();
}

router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const [userCount, txData] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.aggregate({ _sum: { amountUsdc: true, amountTzs: true }, _count: true, where: { status: 'CONFIRMED' } }),
  ]);
  return res.json(ok({
    totalUsers: userCount,
    totalTransactions: txData._count,
    totalVolumeUsdc: txData._sum.amountUsdc ?? 0,
    totalVolumeTzs: txData._sum.amountTzs ?? 0,
    feesCollectedUsdc: (txData._sum.amountUsdc ?? 0) * 0.01,
    adminWallet: process.env.STELLAR_PUBLIC_KEY ?? 'Not configured',
  }));
});

router.get('/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const page  = parseInt(req.query.page as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 500);
  const q     = (req.query.q as string ?? '').trim();
  const where: any = q ? { OR: [{ phone: { contains: q } }, { kycName: { contains: q, mode: 'insensitive' } }] } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, phone: true, kycName: true, kycStatus: true, stellarPubKey: true, isAdmin: true, isFeeCollector: true, isOnline: true, lastSeenAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return res.json(ok({ users, total, page, pages: Math.ceil(total/limit) }));
});

router.get('/transactions', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const page   = parseInt(req.query.page as string ?? '1');
  const limit  = Math.min(parseInt(req.query.limit as string ?? '100'), 1000);
  const from   = req.query.from   as string | undefined;
  const to     = req.query.to     as string | undefined;
  const userId = req.query.userId as string | undefined;
  const where: any = {};
  if (userId) where.userId = userId;
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from);
  if (to)   where.createdAt.lte = new Date(to + 'T23:59:59Z');
  const [txs, total, agg] = await Promise.all([
    prisma.transaction.findMany({ where, include: { user: { select: { phone: true, kycName: true } } }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { ...where, status: 'CONFIRMED' }, _sum: { amountUsdc: true, amountTzs: true } }),
  ]);
  return res.json(ok({ transactions: txs, total, page, pages: Math.ceil(total/limit), summary: { totalVolumeUsdc: agg._sum.amountUsdc ?? 0, totalVolumeTzs: agg._sum.amountTzs ?? 0, feesUsdc: (agg._sum.amountUsdc ?? 0) * 0.01 } }));
});

router.get('/fees', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to   = req.query.to   as string | undefined;
  const where: any = { status: 'CONFIRMED' };
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from);
  if (to)   where.createdAt.lte = new Date(to + 'T23:59:59Z');
  const byType = await prisma.transaction.groupBy({ by: ['type'], where, _sum: { amountUsdc: true }, _count: true });
  const totalUsdc = byType.reduce((s, r) => s + (r._sum.amountUsdc ?? 0), 0);
  return res.json(ok({ feesEarnedUsdc: totalUsdc * 0.01, totalVolumeUsdc: totalUsdc, adminWallet: process.env.STELLAR_PUBLIC_KEY ?? '', breakdown: byType.map(r => ({ type: r.type, count: r._count, volumeUsdc: r._sum.amountUsdc ?? 0, feeUsdc: (r._sum.amountUsdc ?? 0) * 0.01 })) }));
});

router.get('/report/csv', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to   = req.query.to   as string | undefined;
  const where: any = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from);
  if (to)   where.createdAt.lte = new Date(to + 'T23:59:59Z');
  const txs = await prisma.transaction.findMany({ where, include: { user: { select: { phone: true, kycName: true } } }, orderBy: { createdAt: 'desc' }, take: 50000 });
  const lines = [
    'Date,Time,User Phone,User Name,Type,Status,Amount USD,Amount TZS,Fee USD,Wallet TX,Memo',
    ...txs.map(t => {
      const d = new Date(t.createdAt);
      return [d.toISOString().slice(0,10), d.toISOString().slice(11,19), t.user?.phone??'', (t.user?.kycName??'').replace(/,/g,' '), t.type, t.status, (t.amountUsdc??0).toFixed(4), (t.amountTzs??0).toFixed(0), ((t.amountUsdc??0)*0.01).toFixed(4), t.stellarTxId??'', (t.memo??'').replace(/,/g,' ')].join(',');
    }),
  ];
  const label = from && to ? `${from}_to_${to}` : 'all';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="olomipay_report_${label}.csv"`);
  return res.send(lines.join('\n'));
});

router.get('/report/pdf-data', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to   = req.query.to   as string | undefined;
  const where: any = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from);
  if (to)   where.createdAt.lte = new Date(to + 'T23:59:59Z');
  const [txs, userCount, agg] = await Promise.all([
    prisma.transaction.findMany({ where, include: { user: { select: { phone: true, kycName: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    prisma.user.count(),
    prisma.transaction.aggregate({ where: { ...where, status: 'CONFIRMED' }, _sum: { amountUsdc: true, amountTzs: true }, _count: true }),
  ]);
  return res.json(ok({
    reportRange: { from: from ?? 'beginning', to: to ?? 'now' },
    generatedAt: new Date().toISOString(),
    adminWallet: process.env.STELLAR_PUBLIC_KEY ?? '',
    summary: { totalUsers: userCount, totalTransactions: agg._count, totalVolumeUsdc: agg._sum.amountUsdc ?? 0, totalVolumeTzs: agg._sum.amountTzs ?? 0, feesEarnedUsdc: (agg._sum.amountUsdc ?? 0) * 0.01 },
    transactions: txs.map(t => ({ date: new Date(t.createdAt).toISOString().slice(0,10), time: new Date(t.createdAt).toISOString().slice(11,19), userPhone: t.user?.phone??'', userName: t.user?.kycName??'', type: t.type, status: t.status, amountUsdc: (t.amountUsdc??0).toFixed(2), amountTzs: (t.amountTzs??0).toFixed(0), feeUsdc: ((t.amountUsdc??0)*0.01).toFixed(4), txId: t.stellarTxId??'', memo: t.memo??'' })),
  }));
});

export { router as adminRouter };
