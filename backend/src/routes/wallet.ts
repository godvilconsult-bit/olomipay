import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance, getTransactionHistory, getAccountInfo, buildStellarPayUri, friendbotFund, activateUserWallet } from '../services/stellar';
import { verifyPin } from '../services/crypto';

const router = Router();
const prisma = new PrismaClient();

// ── POST /api/wallet/activate ──────────────────────────────────────────────────
// Fund the account with min XLM + add the USDC trustline (signed with user's PIN).
// For users registered before auto-activation, or whose activation didn't finish.
router.post('/activate', requireAuth, async (req: AuthRequest, res) => {
  const { pin } = req.body ?? {};
  if (!/^\d{6}$/.test(pin ?? '')) return res.status(400).json({ success: false, error: 'Enter your 6-digit PIN' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  if (!await verifyPin(pin, user.pinHash)) return res.status(403).json({ success: false, error: 'Incorrect PIN' });

  try {
    const r = await activateUserWallet({
      publicKey:       user.stellarPubKey,
      encryptedSecret: user.stellarSecret,
      pin,
      phone:           user.phone,
    });
    const balance = await getBalance(user.stellarPubKey).catch(() => ({ xlm: '0', usdc: '0' }));
    return res.json({
      success: true,
      data: {
        funded:    r.funded,
        trustline: r.trustline,
        balance,
        message:   r.funded
          ? (r.trustline ? 'Wallet activated — ready to receive deposits.' : 'Wallet funded, but USDC trustline pending. Try again.')
          : 'Could not activate wallet. Please try again shortly.',
      },
    });
  } catch (e: any) {
    console.error('[wallet/activate]', e?.message);
    return res.status(502).json({ success: false, error: e?.message ?? 'Activation failed' });
  }
});

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

// ── GET /api/wallet/receive ────────────────────────────────────────────────────
// Returns Stellar address + SEP-0007 QR URI for receiving XLM/USDC

router.get('/receive', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { stellarPubKey: true, kycName: true, phone: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isTestnet = (process.env.STELLAR_NETWORK ?? 'testnet') !== 'mainnet';
  const network   = isTestnet ? 'testnet' : 'mainnet';

  // QR URI for receiving any XLM (no amount pre-filled — sender decides)
  const xlmUri  = buildStellarPayUri({ destination: user.stellarPubKey, network, memo: user.kycName ?? user.phone });
  // QR URI for receiving USDC
  const usdcUri = buildStellarPayUri({
    destination:  user.stellarPubKey,
    assetCode:    'USDC',
    assetIssuer:  process.env.USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    network,
    memo:         user.kycName ?? user.phone,
  });

  // Horizon explorer link
  const explorerBase = isTestnet
    ? 'https://stellar.expert/explorer/testnet/account'
    : 'https://stellar.expert/explorer/public/account';

  return res.json({
    address:     user.stellarPubKey,
    network,
    xlmQrUri:    xlmUri,
    usdcQrUri:   usdcUri,
    explorerUrl: `${explorerBase}/${user.stellarPubKey}`,
  });
});

// ── GET /api/wallet/account-info ───────────────────────────────────────────────
// Full on-chain account status

router.get('/account-info', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    const info = await getAccountInfo(user.stellarPubKey);
    return res.json({ ...info, publicKey: user.stellarPubKey });
  } catch (err: any) {
    return res.status(502).json({ error: err.message });
  }
});

// ── POST /api/wallet/friendbot ─────────────────────────────────────────────────
// Trigger testnet friendbot funding for user's wallet

router.post('/friendbot', requireAuth, async (req: AuthRequest, res) => {
  const isTestnet = (process.env.STELLAR_NETWORK ?? 'testnet') !== 'mainnet';
  if (!isTestnet) return res.status(400).json({ error: 'Friendbot only available on testnet' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await friendbotFund(user.stellarPubKey);
  return res.json({ success: ok, address: user.stellarPubKey, message: ok ? 'Funded with testnet XLM!' : 'Already funded or unavailable' });
});

export { router as walletRouter };
