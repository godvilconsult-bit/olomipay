import { Router }      from 'express';
import { PrismaClient } from '@prisma/client';
import PDFDocument      from 'pdfkit';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  getFeeWalletPublic,
  getAccountInfo,
  setupFeeWallet,
  PLATFORM_FEE_PCT,
} from '../services/stellar';

const router = Router();
const prisma  = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── Middleware: admin-only ────────────────────────────────────────────────────
async function requireAdmin(req: AuthRequest, res: any, next: any) {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return res.status(403).json(fail('Admin access required'));
  next();
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const feeWallet = getFeeWalletPublic();

  const [userCount, txData, feeData, feeWalletInfo] = await Promise.all([
    prisma.user.count(),
    // Volume from SEND + DEPOSIT only (not FEE records)
    prisma.transaction.aggregate({
      _sum:   { amountUsdc: true, amountTzs: true },
      _count: true,
      where:  { status: 'CONFIRMED', type: { in: ['DEPOSIT', 'SEND', 'RECEIVE'] } },
    }),
    // Real fee records from FEE type transactions
    prisma.transaction.aggregate({
      _sum:   { amountUsdc: true },
      _count: true,
      where:  { status: 'CONFIRMED', type: 'FEE' },
    }),
    // Live on-chain balance of fee wallet
    getAccountInfo(feeWallet).catch(() => null),
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
router.get('/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const page  = parseInt(req.query.page  as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 500);
  const q     = (req.query.q as string ?? '').trim();
  const where: any = q
    ? { OR: [{ phone: { contains: q } }, { kycName: { contains: q, mode: 'insensitive' } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, phone: true, kycName: true, kycStatus: true,
        stellarPubKey: true, isAdmin: true, isFeeCollector: true,
        isOnline: true, lastSeenAt: true, createdAt: true, country: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.user.count({ where }),
  ]);
  return res.json(ok({ users, total, page, pages: Math.ceil(total / limit) }));
});

// ── GET /api/admin/transactions ───────────────────────────────────────────────
router.get('/transactions', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
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
      include: { user: { select: { phone: true, kycName: true } } },
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
    // Fee collected per day
    prisma.$queryRaw`
      SELECT DATE("createdAt") as day, SUM("amountUsdc") as daily_fee, COUNT(*) as count
      FROM "Transaction"
      WHERE status = 'CONFIRMED' AND type = 'FEE'
      ${from ? prisma.$raw`AND "createdAt" >= ${new Date(from)}` : prisma.$raw``}
      ${to   ? prisma.$raw`AND "createdAt" <= ${new Date(to + 'T23:59:59Z')}` : prisma.$raw``}
      GROUP BY DATE("createdAt")
      ORDER BY day DESC
      LIMIT 30
    `.catch(() => []),
    prisma.transaction.groupBy({
      by:    ['type'],
      where: volWhere,
      _sum:  { amountUsdc: true },
      _count: true,
    }),
    getAccountInfo(feeWallet).catch(() => null),
  ]);

  return res.json(ok({
    feeWallet,
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

// ── GET /api/admin/fee-wallet ──────────────────────────────────────────────────
// Returns fee wallet address, live balance, and setup status
router.get('/fee-wallet', requireAuth, requireAdmin, async (_req, res) => {
  const feeWallet    = getFeeWalletPublic();
  const platformPub  = process.env.STELLAR_PUBLIC_KEY ?? '';
  const isShared     = feeWallet === platformPub;
  const isTestnet    = (process.env.STELLAR_NETWORK ?? 'testnet') !== 'mainnet';

  const [walletInfo, totalFees] = await Promise.all([
    getAccountInfo(feeWallet).catch(() => null),
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
    include: { user: { select: { phone: true, kycName: true } } },
    orderBy: { createdAt: 'desc' },
    take:    50000,
  });

  const lines = [
    'Date,Time,User Phone,User Name,Type,Status,Amount USDC,Amount TZS,Fee USDC,Stellar TX,Memo',
    ...txs.map(t => {
      const d = new Date(t.createdAt);
      return [
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
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
      include: { user: { select: { phone: true, kycName: true } } },
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
      { label: 'Date',       w: 72 },
      { label: 'User Phone', w: 90 },
      { label: 'Name',       w: 90 },
      { label: 'Type',       w: 65 },
      { label: 'Status',     w: 60 },
      { label: 'USDC',       w: 55 },
      { label: 'TZS',        w: 70 },
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
        t.user?.phone    ?? '',
        (t.user?.kycName ?? '').slice(0, 14),
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
      include: { user: { select: { phone: true, kycName: true } } },
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
// Body: { toAddress, amount, asset ('XLM'|'USDC'), memo }
router.post('/send-stellar', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { toAddress, amount, asset = 'XLM', memo } = req.body;
  if (!toAddress || !amount) return res.status(400).json(fail('toAddress and amount required'));
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json(fail('Invalid amount'));

  try {
    const stellar = await import('../services/stellar');
    let txHash: string;

    if (asset === 'USDC') {
      txHash = await stellar.platformSendUsdc(toAddress, numAmount, memo);
    } else if (asset === 'XLM') {
      // Build XLM payment from platform wallet
      const StellarSdk = (await import('@stellar/stellar-sdk')) as any;
      const platformSecret = process.env.STELLAR_SECRET_KEY;
      if (!platformSecret) return res.status(500).json(fail('Platform Stellar key not configured'));

      const horizon    = new StellarSdk.Horizon.Server(process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org');
      const network    = process.env.STELLAR_NETWORK === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET;
      const keypair    = StellarSdk.Keypair.fromSecret(platformSecret);
      const account    = await horizon.loadAccount(keypair.publicKey());
      const tx         = new StellarSdk.TransactionBuilder(account, {
        fee:               StellarSdk.BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: toAddress,
          asset:       StellarSdk.Asset.native(),
          amount:      numAmount.toFixed(7),
        }))
        .setTimeout(30);
      if (memo) tx.addMemo(StellarSdk.Memo.text(String(memo).slice(0, 28)));
      const built = tx.build();
      built.sign(keypair);
      const result = await horizon.submitTransaction(built);
      txHash = result.hash;
    } else {
      return res.status(400).json(fail('asset must be XLM or USDC'));
    }

    // Record in DB
    await prisma.transaction.create({
      data: {
        userId:     req.userId!,
        type:       'SEND',
        status:     'CONFIRMED',
        amountUsdc: asset === 'USDC' ? numAmount : undefined,
        amountXlm:  asset === 'XLM'  ? numAmount : undefined,
        toAddress,
        memo:        memo ?? null,
        stellarTxId: txHash,
      },
    });

    return res.json(ok({ message: 'Sent successfully', txHash, asset, amount: numAmount, toAddress }));
  } catch (e: any) {
    return res.status(500).json(fail(e.message));
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
