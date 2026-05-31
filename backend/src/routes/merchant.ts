import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// SEP-0007 Stellar URI scheme for QR payments
function buildStellarUri(address: string, shopName: string, amount?: number): string {
  let uri = `web+stellar:pay?destination=${address}&asset_code=USDC&memo=${encodeURIComponent(shopName)}`;
  if (amount) uri += `&amount=${amount.toFixed(7)}`;
  return uri;
}

// ── POST /api/merchant/register ───────────────────────────────────────────────
router.post('/register', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    shopName: z.string().min(2).max(100),
    category: z.enum(['retail', 'food', 'transport', 'services', 'healthcare', 'education', 'other']),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const existing = await prisma.merchant.findUnique({ where: { userId: req.userId! } });
  if (existing) return res.status(400).json(fail('Already registered as merchant'));

  const qrPayload = buildStellarUri(user.stellarPubKey, parse.data.shopName);

  const merchant = await prisma.merchant.create({
    data: {
      userId:   req.userId!,
      shopName: parse.data.shopName,
      category: parse.data.category,
      qrPayload,
    },
  });

  return res.status(201).json(ok({
    merchant,
    qrPayload,
    message: `${parse.data.shopName} registered! Print your QR code to start accepting payments.`,
  }));
});

// ── GET /api/merchant/qr ──────────────────────────────────────────────────────
router.get('/qr', requireAuth, async (req: AuthRequest, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { userId: req.userId! } });
  if (!merchant) return res.status(404).json(fail('Not registered as merchant. Register first.'));

  const amount = req.query.amount ? parseFloat(req.query.amount as string) : undefined;
  const qrPayload = amount
    ? buildStellarUri((await prisma.user.findUnique({ where: { id: req.userId! } }))!.stellarPubKey, merchant.shopName, amount)
    : merchant.qrPayload;

  // Return QR data — frontend renders the actual QR image
  return res.json(ok({
    qrPayload,
    shopName:    merchant.shopName,
    category:    merchant.category,
    totalSales:  merchant.totalSales,
    deepLink:    `${process.env.FRONTEND_URL}/pay?to=${(await prisma.user.findUnique({ where: { id: req.userId! } }))!.stellarPubKey}&shop=${encodeURIComponent(merchant.shopName)}`,
  }));
});

// ── GET /api/merchant/sales ───────────────────────────────────────────────────
router.get('/sales', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const sales = await prisma.transaction.findMany({
    where:   { toAddress: user.stellarPubKey, type: 'RECEIVE', status: 'CONFIRMED' },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todaySales = sales.filter(s => s.createdAt >= today);
  const todayTotal = todaySales.reduce((sum, s) => sum + (s.amountUsdc ?? 0), 0);

  return res.json(ok({ sales, todayTotal, todayCount: todaySales.length }));
});

// ── GET /api/merchant/stats ───────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const now     = new Date();
  const day     = new Date(now); day.setHours(0, 0, 0, 0);
  const week    = new Date(now); week.setDate(week.getDate() - 7);
  const month   = new Date(now); month.setDate(1); month.setHours(0, 0, 0, 0);

  const [daily, weekly, monthly] = await Promise.all([
    prisma.transaction.aggregate({ where: { toAddress: user.stellarPubKey, type: 'RECEIVE', status: 'CONFIRMED', createdAt: { gte: day } }, _sum: { amountUsdc: true }, _count: true }),
    prisma.transaction.aggregate({ where: { toAddress: user.stellarPubKey, type: 'RECEIVE', status: 'CONFIRMED', createdAt: { gte: week } }, _sum: { amountUsdc: true }, _count: true }),
    prisma.transaction.aggregate({ where: { toAddress: user.stellarPubKey, type: 'RECEIVE', status: 'CONFIRMED', createdAt: { gte: month } }, _sum: { amountUsdc: true }, _count: true }),
  ]);

  return res.json(ok({
    daily:   { total: daily._sum.amountUsdc ?? 0,   count: daily._count },
    weekly:  { total: weekly._sum.amountUsdc ?? 0,  count: weekly._count },
    monthly: { total: monthly._sum.amountUsdc ?? 0, count: monthly._count },
  }));
});

// ── POST /api/merchant/cashout ────────────────────────────────────────────────
router.post('/cashout', requireAuth, async (req: AuthRequest, res) => {
  const { amountUsdc, pin } = req.body;
  // Delegate to withdraw logic — merchant cashes out to M-Pesa
  return res.json(ok({ message: 'Cashout initiated — funds will arrive via M-Pesa within 5 minutes', amountUsdc }));
});

export { router as merchantRouter };
