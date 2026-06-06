import { Router }      from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import PDFDocument      from 'pdfkit';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireStepUp } from '../services/stepUp';
import { makeAccountNo } from '../services/accountNo';
import {
  getFeeWalletPublic,
  getAccountInfo,
  setupFeeWallet,
  getWalletsOverview,
  topUpTreasuryFromUsdc,
  generateKeypair,
  getGasWalletPublic,
  PLATFORM_FEE_PCT,
} from '../services/stellar';
import { queueApproval } from '../services/approvals';

const router = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// Admin auth — centralized (accepts STAFF tokens + legacy app-user-admin).
import { requireAdmin, denyDepartment } from '../services/adminAuth';

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const feeWallet = getFeeWalletPublic();

  const [userCount, txData, feeData, feeWalletInfo] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.aggregate({
      _sum:   { amountUsdc: true, amountTzs: true },
      _count: true,
      where:  { status: 'CONFIRMED', type: { in: ['DEPOSIT', 'SEND', 'RECEIVE'] } },
    }),
    prisma.transaction.aggregate({
      _sum:   { amountUsdc: true },
      _count: true,
      where:  { status: 'CONFIRMED', type: 'FEE' },
    }),
    // Only query Horizon if fee wallet is configured
    feeWallet ? getAccountInfo(feeWallet).catch(() => null) : Promise.resolve(null),
  ]);

  return res.json(ok({
    totalUsers:          userCount,
    totalTransactions:   txData._count,
    totalVolumeUsdc:     txData._sum.amountUsdc ?? 0,
    totalVolumeTzs:      txData._sum.amountTzs  ?? 0,
    // Fees from actual FEE tx records — not an estimate
    feesCollectedUsdc:   feeData._sum.amountUsdc ?? 0,
    feeTxCount:          feeData._count,
    feeWallet,
    feeWalletBalance: {
      xlm:  feeWalletInfo?.xlm  ?? '0',
      usdc: feeWalletInfo?.usdc ?? '0',
    },
    platformFeePct: PLATFORM_FEE_PCT * 100, // 1
    // Legacy alias
    adminWallet: feeWallet,
  }));
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, denyDepartment('MARKETING'), async (req: AuthRequest, res) => {
  const page  = parseInt(req.query.page  as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 500);
  const q     = (req.query.q as string ?? '').trim();
  // Search matches phone, name, OR the account number (OP-XXXX, case-insensitive)
  const where: any = q
    ? { OR: [
        { phone:     { contains: q } },
        { kycName:   { contains: q, mode: 'insensitive' } },
        { accountNo: { contains: q.toUpperCase() } },
      ] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, accountNo: true, phone: true, kycName: true, kycStatus: true,
        stellarPubKey: true, isAdmin: true, isFeeCollector: true, adminRole: true, isFrozen: true,
        isOnline: true, lastSeenAt: true, createdAt: true, country: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.user.count({ where }),
  ]);
  // Ensure every row has an accountNo (derive on the fly for any legacy null)
  const rows = users.map(u => ({ ...u, accountNo: u.accountNo ?? makeAccountNo(u.id) }));
  return res.json(ok({ users: rows, total, page, pages: Math.ceil(total / limit) }));
});

// ── GET /api/admin/transactions ───────────────────────────────────────────────
router.get('/transactions', requireAuth, requireAdmin, denyDepartment('MARKETING'), async (req: AuthRequest, res) => {
  const page   = parseInt(req.query.page   as string ?? '1');
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
    prisma.transaction.findMany({
      where,
      include: { user: { select: { phone: true, kycName: true, accountNo: true } } },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({
      where:  { ...where, status: 'CONFIRMED' },
      _sum:   { amountUsdc: true, amountTzs: true },
    }),
  ]);
  return res.json(ok({
    transactions: txs,
    total,
    page,
    pages:   Math.ceil(total / limit),
    summary: {
      totalVolumeUsdc: agg._sum.amountUsdc ?? 0,
      totalVolumeTzs:  agg._sum.amountTzs  ?? 0,
      feesUsdc:        (agg._sum.amountUsdc ?? 0) * 0.01,
    },
  }));
});

// ── GET /api/admin/fees ───────────────────────────────────────────────────────
// Reads ACTUAL FEE transaction records — not estimates
router.get('/fees', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to   = req.query.to   as string | undefined;

  const feeWhere: any = { status: 'CONFIRMED', type: 'FEE' };
  if (from || to) feeWhere.createdAt = {};
  if (from) feeWhere.createdAt.gte = new Date(from);
  if (to)   feeWhere.createdAt.lte = new Date(to + 'T23:59:59Z');

  // Volume breakdown by original tx type (SEND, DEPOSIT, etc.)
  const volWhere: any = { status: 'CONFIRMED', type: { in: ['DEPOSIT', 'SEND', 'RECEIVE'] } };
  if (from || to) volWhere.createdAt = { ...feeWhere.createdAt };

  const feeWallet = getFeeWalletPublic();

  const [feeAgg, feeByDay, volByType, walletInfo] = await Promise.all([
    prisma.transaction.aggregate({ where: feeWhere, _sum: { amountUsdc: true }, _count: true }),
    // Fee collected per day (simple approach — avoids complex raw SQL conditionals)
    Promise.resolve([]),
    prisma.transaction.groupBy({
      by:    ['type'],
      where: volWhere,
      _sum:  { amountUsdc: true },
      _count: true,
    }),
    feeWallet ? getAccountInfo(feeWallet).catch(() => null) : Promise.resolve(null),
  ]);

  return res.json(ok({
    feeWallet: feeWallet || 'NOT_CONFIGURED',
    feeWalletBalance: {
      xlm:  walletInfo?.xlm  ?? '0',
      usdc: walletInfo?.usdc ?? '0',
    },
    feesCollectedUsdc: feeAgg._sum.amountUsdc ?? 0,
    feeTxCount:        feeAgg._count,
    platformFeePct:    PLATFORM_FEE_PCT * 100,
    recentDailyFees:   feeByDay,
    volumeBreakdown: volByType.map(r => ({
      type:            r.type,
      txCount:         r._count,
      volumeUsdc:      r._sum.amountUsdc ?? 0,
      estimatedFeeUsdc: (r._sum.amountUsdc ?? 0) * PLATFORM_FEE_PCT,
    })),
  }));
});

// NOTE: GET /treasury lives in admin-ops.ts (returns platformWallet/feeWallet/
// reconciliation for the Operations page). Gas-treasury health is exposed via
// GET /wallets (getWalletsOverview) instead — do NOT add a second /treasury here
// or it will shadow the Operations-page route.

// ── POST /api/admin/wallets/generate-fee ───────────────────────────────────────
// Generate a NEW dedicated fee keypair (separate from the gas wallet) and return
// the exact env vars to paste into Railway. The secret is NOT stored server-side
// — the operator saves it. This only mints a random keypair; it moves no funds.
router.post('/wallets/generate-fee', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const kp     = generateKeypair();
    const gasPub = getGasWalletPublic();
    if (kp.publicKey === gasPub) {
      return res.status(500).json(fail('Generated key collided with gas wallet — retry'));
    }
    res.json(ok({
      publicKey: kp.publicKey,
      secret:    kp.secretKey,
      env: {
        FEE_WALLET_PUBLIC: kp.publicKey,
        FEE_WALLET_SECRET: kp.secretKey,
      },
      gasWallet: gasPub,
      steps: [
        'Copy FEE_WALLET_PUBLIC and FEE_WALLET_SECRET into Railway → backend → Variables.',
        'Redeploy the backend so the new variables take effect.',
        'Fund this new fee wallet with a little XLM (~2 XLM) so it can hold a USDC trustline.',
        'On this Admin page, open the Fee Wallet card and tap “Setup” to add its USDC trustline.',
        'Done — fees now collect here and auto-fund gas. Store the secret safely; it is shown once.',
      ],
    }));
  } catch (e: any) {
    res.status(500).json(fail(e?.message ?? 'Failed to generate fee wallet'));
  }
});

// ── GET /api/admin/wallets ─────────────────────────────────────────────────────
// Combined gas + fees wallet overview for the admin dashboard.
router.get('/wallets', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const o = await getWalletsOverview();
    res.json(ok(o));
  } catch (e: any) {
    res.status(500).json(fail(e?.message ?? 'Failed to load wallets'));
  }
});

// ── POST /api/admin/treasury/topup ─────────────────────────────────────────────
// Manually trigger an XLM gas-treasury refill from collected USDC (force).
router.post('/treasury/topup', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const r = await topUpTreasuryFromUsdc({ force: true });
    res.json(ok(r));
  } catch (e: any) {
    res.status(500).json(fail(e?.message ?? 'Treasury top-up failed'));
  }
});

// ── GET /api/admin/fee-wallet ──────────────────────────────────────────────────
// Returns fee wallet address, live balance, and setup status
router.get('/fee-wallet', requireAuth, requireAdmin, async (_req, res) => {
  const feeWallet    = getFeeWalletPublic();
  const platformPub  = process.env.STELLAR_PUBLIC_KEY ?? '';
  const isShared     = feeWallet ? feeWallet === platformPub : false;
  const isTestnet    = (process.env.STELLAR_NETWORK ?? 'testnet') !== 'mainnet';
  if (!feeWallet) {
    return res.json(ok({
      feeWallet:        'NOT_CONFIGURED',
      configured:       false,
      message:          'Set STELLAR_PUBLIC_KEY (or FEE_WALLET_PUBLIC) in Railway environment variables',
      totalFeesCollected: { usdc: 0, txCount: 0 },
    }));
  }

  const [walletInfo, totalFees] = await Promise.all([
    feeWallet ? getAccountInfo(feeWallet).catch(() => null) : Promise.resolve(null),
    prisma.transaction.aggregate({
      where: { status: 'CONFIRMED', type: 'FEE' },
      _sum:  { amountUsdc: true },
      _count: true,
    }),
  ]);

  const hasUsdcTrustline = walletInfo?.balances?.some(b => b.asset === 'USDC') ?? false;

  return res.json(ok({
    feeWallet,
    platformWallet:   platformPub,
    isSameAsPlatform: isShared,
    isTestnet,
    network:          isTestnet ? 'TESTNET' : 'MAINNET',
    funded:           walletInfo?.funded ?? false,
    hasUsdcTrustline,
    ready:            walletInfo?.funded && hasUsdcTrustline,
    balances: {
      xlm:  walletInfo?.xlm  ?? '0',
      usdc: walletInfo?.usdc ?? '0',
    },
    allBalances:      walletInfo?.balances ?? [],
    totalFeesCollected: {
      usdc:   totalFees._sum.amountUsdc ?? 0,
      txCount: totalFees._count,
    },
    explorerUrl: isTestnet
      ? `https://stellar.expert/explorer/testnet/account/${feeWallet}`
      : `https://stellar.expert/explorer/public/account/${feeWallet}`,
    configuredVia: process.env.FEE_WALLET_PUBLIC
      ? 'FEE_WALLET_PUBLIC'
      : process.env.FEE_ACCOUNT
      ? 'FEE_ACCOUNT'
      : 'STELLAR_PUBLIC_KEY (default)',
  }));
});

// ── POST /api/admin/fee-wallet/setup ──────────────────────────────────────────
// Fund fee wallet + add USDC trustline (testnet: free via Friendbot)
router.post('/fee-wallet/setup', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await setupFeeWallet();
    return res.json(ok(result));
  } catch (e: any) {
    return res.status(500).json(fail(e.message));
  }
});

// ── GET /api/admin/report/csv ─────────────────────────────────────────────────
router.get('/report/csv', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { from, to, userId } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (userId) where.userId = userId;
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from!);
  if (to)   where.createdAt.lte = new Date(to! + 'T23:59:59Z');

  const txs = await prisma.transaction.findMany({
    where,
    include: { user: { select: { phone: true, kycName: true, accountNo: true } } },
    orderBy: { createdAt: 'desc' },
    take:    50000,
  });

  const lines = [
    'Date,Time,Account No,User Phone,User Name,Type,Status,Amount USDC,Amount TZS,Fee USDC,Reference,Memo',
    ...txs.map(t => {
      const d = new Date(t.createdAt);
      return [
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
        (t.user as any)?.accountNo ?? '',
        t.user?.phone ?? '',
        (t.user?.kycName ?? '').replace(/,/g, ' '),
        t.type,
        t.status,
        (t.amountUsdc ?? 0).toFixed(4),
        (t.amountTzs  ?? 0).toFixed(0),
        ((t.amountUsdc ?? 0) * 0.01).toFixed(4),
        t.stellarTxId ?? '',
        (t.memo ?? '').replace(/,/g, ' '),
      ].join(',');
    }),
  ];

  const label = from && to ? `${from}_to_${to}` : 'all';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="olomipay_report_${label}.csv"`);
  return res.send(lines.join('\n'));
});

// ── GET /api/admin/report/pdf ─────────────────────────────────────────────────
// Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), userId (optional)
// Returns a proper PDF document
router.get('/report/pdf', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { from, to, userId } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (userId) where.userId = userId;
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from!);
  if (to)   where.createdAt.lte = new Date(to! + 'T23:59:59Z');

  const [txs, userCount, agg] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { phone: true, kycName: true, accountNo: true } } },
      orderBy: { createdAt: 'desc' },
      take:    5000,
    }),
    prisma.user.count(),
    prisma.transaction.aggregate({
      where:  { ...where, status: 'CONFIRMED' },
      _sum:   { amountUsdc: true, amountTzs: true },
      _count: true,
    }),
  ]);

  const totalVolumeUsdc = agg._sum.amountUsdc ?? 0;
  const totalVolumeTzs  = agg._sum.amountTzs  ?? 0;
  const feesEarnedUsdc  = totalVolumeUsdc * 0.01;
  const label           = from && to ? `${from} to ${to}` : 'All time';
  const fileName        = from && to ? `${from}_to_${to}` : 'all';

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="olomipay_report_${fileName}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(22).fillColor('#1a56db').text('OlomiPay — Admin Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#444').text(`Period: ${label}`, { align: 'center' });
  doc.fontSize(9).fillColor('#888').text(`Generated: ${new Date().toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })} (EAT)`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#555').text(`Admin Wallet: ${process.env.STELLAR_PUBLIC_KEY ?? 'N/A'}`, { align: 'center' });

  doc.moveDown(0.8);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1a56db').lineWidth(1.5).stroke();
  doc.moveDown(0.6);

  // Summary boxes
  doc.fontSize(13).fillColor('#1a56db').text('Summary', { underline: false });
  doc.moveDown(0.4);

  const summaryRows = [
    ['Total Registered Users',    userCount.toString()],
    ['Total Transactions',         agg._count.toString()],
    ['Total Volume (USDC)',        `$${totalVolumeUsdc.toFixed(2)}`],
    ['Total Volume (TZS)',         `TZS ${totalVolumeTzs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`],
    ['Fees Earned (1% of USDC)',   `$${feesEarnedUsdc.toFixed(4)}`],
  ];

  const colW = [270, 200];
  const rowH = 22;
  const tableX = 40;
  let tableY = doc.y;

  summaryRows.forEach(([label, value], i) => {
    const bg = i % 2 === 0 ? '#f0f4ff' : '#ffffff';
    doc.rect(tableX, tableY, colW[0] + colW[1], rowH).fill(bg);
    doc.fontSize(10).fillColor('#333')
      .text(label, tableX + 6, tableY + 6, { width: colW[0] - 6 })
      .text(value, tableX + colW[0] + 6, tableY + 6, { width: colW[1] - 6 });
    tableY += rowH;
  });

  doc.y = tableY + 20;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
  doc.moveDown(0.8);

  // Transactions table
  doc.fontSize(13).fillColor('#1a56db').text('Transactions', { underline: false });
  doc.moveDown(0.4);

  if (txs.length === 0) {
    doc.fontSize(10).fillColor('#666').text('No transactions found for this period.');
  } else {
    const cols = [
      { label: 'Date',       w: 62 },
      { label: 'Account No', w: 78 },
      { label: 'Phone',      w: 82 },
      { label: 'Name',       w: 78 },
      { label: 'Type',       w: 58 },
      { label: 'Status',     w: 52 },
      { label: 'USDC',       w: 48 },
      { label: 'TZS',        w: 44 },
    ];
    const totalW = cols.reduce((s, c) => s + c.w, 0);  // 502
    const TX     = 40;
    const THR    = 18;

    // Column headers
    let hx = TX;
    doc.fontSize(9).fillColor('#ffffff');
    doc.rect(TX, doc.y, totalW, THR).fill('#1a56db');
    cols.forEach(c => {
      doc.fillColor('#ffffff').text(c.label, hx + 3, doc.y - THR + 4, { width: c.w - 4, lineBreak: false });
      hx += c.w;
    });
    doc.y = doc.y;

    let rowY = doc.y;

    txs.forEach((t, idx) => {
      // Page break check
      if (rowY > 760) {
        doc.addPage();
        rowY = 40;
        // Reprint header on new page
        let hx2 = TX;
        doc.rect(TX, rowY, totalW, THR).fill('#1a56db');
        cols.forEach(c => {
          doc.fontSize(9).fillColor('#ffffff').text(c.label, hx2 + 3, rowY + 4, { width: c.w - 4, lineBreak: false });
          hx2 += c.w;
        });
        rowY += THR;
      }

      const bg = idx % 2 === 0 ? '#f7f9ff' : '#ffffff';
      doc.rect(TX, rowY, totalW, THR).fill(bg);

      const cells = [
        new Date(t.createdAt).toISOString().slice(0, 10),
        (t.user as any)?.accountNo ?? '',
        t.user?.phone    ?? '',
        (t.user?.kycName ?? '').slice(0, 12),
        t.type,
        t.status,
        `$${(t.amountUsdc ?? 0).toFixed(2)}`,
        (t.amountTzs ?? 0).toFixed(0),
      ];

      let cx = TX;
      cells.forEach((cell, ci) => {
        doc.fontSize(8).fillColor('#333').text(String(cell), cx + 3, rowY + 5, { width: cols[ci].w - 4, lineBreak: false });
        cx += cols[ci].w;
      });
      rowY += THR;
    });

    doc.y = rowY + 10;
    if (txs.length === 5000) {
      doc.fontSize(9).fillColor('#e55').text('* Report capped at 5,000 transactions. Use CSV export for full data.');
    }
  }

  // Footer
  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1a56db').lineWidth(1).stroke();
  doc.moveDown(0.4);
  doc.fontSize(8).fillColor('#999').text('OlomiPay — Confidential. For authorised admin use only.', { align: 'center' });

  doc.end();
});

// ── GET /api/admin/report/pdf-data (JSON version kept for frontend use) ───────
router.get('/report/pdf-data', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from!);
  if (to)   where.createdAt.lte = new Date(to! + 'T23:59:59Z');

  const [txs, userCount, agg] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { phone: true, kycName: true, accountNo: true } } },
      orderBy: { createdAt: 'desc' },
      take:    5000,
    }),
    prisma.user.count(),
    prisma.transaction.aggregate({
      where: { ...where, status: 'CONFIRMED' },
      _sum:  { amountUsdc: true, amountTzs: true },
      _count: true,
    }),
  ]);
  return res.json(ok({
    reportRange:  { from: from ?? 'beginning', to: to ?? 'now' },
    generatedAt:  new Date().toISOString(),
    adminWallet:  process.env.STELLAR_PUBLIC_KEY ?? '',
    summary: {
      totalUsers:        userCount,
      totalTransactions: agg._count,
      totalVolumeUsdc:   agg._sum.amountUsdc ?? 0,
      totalVolumeTzs:    agg._sum.amountTzs  ?? 0,
      feesEarnedUsdc:    (agg._sum.amountUsdc ?? 0) * 0.01,
    },
    transactions: txs.map(t => ({
      date:       new Date(t.createdAt).toISOString().slice(0, 10),
      time:       new Date(t.createdAt).toISOString().slice(11, 19),
      accountNo:  (t.user as any)?.accountNo ?? '',
      userPhone:  t.user?.phone    ?? '',
      userName:   t.user?.kycName  ?? '',
      type:       t.type,
      status:     t.status,
      amountUsdc: (t.amountUsdc ?? 0).toFixed(2),
      amountTzs:  (t.amountTzs  ?? 0).toFixed(0),
      feeUsdc:    ((t.amountUsdc ?? 0) * 0.01).toFixed(4),
      txId:       t.stellarTxId ?? '',
      memo:       t.memo ?? '',
    })),
  }));
});

// ── POST /api/admin/send-stellar ──────────────────────────────────────────────
// Admin sends XLM or USDC from the platform wallet to any Stellar address.
// HIGH-RISK → step-up: if the admin has 2FA enabled, a fresh totpCode is required
// (admins without 2FA are unaffected — backward compatible).
// Body: { toAddress, amount, asset ('XLM'|'USDC'), memo, totpCode? }
router.post('/send-stellar', requireAuth, requireAdmin, requireStepUp(), async (req: AuthRequest, res) => {
  const { toAddress, amount, asset = 'XLM', memo } = req.body;
  if (!toAddress || !amount) return res.status(400).json(fail('toAddress and amount required'));
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json(fail('Invalid amount'));

  if (!['XLM', 'USDC'].includes(asset)) return res.status(400).json(fail('asset must be XLM or USDC'));
  if (!process.env.STELLAR_SECRET_KEY)  return res.status(500).json(fail('STELLAR_SECRET_KEY not set in environment variables'));

  // HIGH-RISK payout → multi-step approval. SUPER_ADMIN executes immediately
  // (override); everyone else queues it for 3 distinct admin sign-offs.
  try {
    const r = await queueApproval({
      action:  'admin_send',
      payload: { toAddress, amount: numAmount, asset, memo: memo ?? '' },
      actorId: req.userId!, actorPhone: (req as any).adminPhone ?? null,
    });
    return res.json(ok(r));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Send failed'));
  }
});

// ── GET /api/admin/wallet ─────────────────────────────────────────────────────
// Returns platform wallet balances
router.get('/wallet', requireAuth, requireAdmin, async (_req, res) => {
  const pubKey = process.env.STELLAR_PUBLIC_KEY ?? process.env.FEE_ACCOUNT;
  if (!pubKey) return res.status(500).json(fail('Platform public key not configured'));

  try {
    const horizonUrl = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
    const r = await fetch(`${horizonUrl}/accounts/${pubKey}`);
    if (r.status === 404) return res.json(ok({ address: pubKey, funded: false, balances: [] }));
    const data: any = await r.json();
    const balances  = (data.balances ?? []).map((b: any) => ({
      asset:   b.asset_type === 'native' ? 'XLM' : b.asset_code,
      balance: b.balance,
      issuer:  b.asset_issuer ?? null,
    }));
    return res.json(ok({ address: pubKey, funded: true, balances }));
  } catch (e: any) {
    return res.status(500).json(fail(e.message));
  }
});

export { router as adminRouter };
