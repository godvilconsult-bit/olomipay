import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { verifyPin } from '../services/crypto';
import { getUserKeypair } from '../services/stellar';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 10, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const IS_TESTNET = process.env.STELLAR_NETWORK !== 'mainnet';
const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = IS_TESTNET ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC;
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const USDC_ISSUER = process.env.USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const SUPPORTED_ASSETS: Record<string, StellarSdk.Asset> = {
  XLM:  StellarSdk.Asset.native(),
  USDC: new StellarSdk.Asset('USDC', USDC_ISSUER),
};

// Rates cache
let ratesCache: { rates: any; updatedAt: number } | null = null;

// ── GET /api/swap/rates ───────────────────────────────────────────────────────
router.get('/rates', requireAuth, async (_req, res) => {
  if (ratesCache && Date.now() - ratesCache.updatedAt < 60_000) {
    return res.json(ok(ratesCache.rates));
  }
  // Build simple rate matrix from Horizon orderbook
  const pairs = [
    { from: 'XLM',  to: 'USDC' },
    { from: 'USDC', to: 'XLM'  },
  ];

  const rates: Record<string, number> = {};
  for (const { from, to } of pairs) {
    try {
      const ob = await server.orderbook(SUPPORTED_ASSETS[from], SUPPORTED_ASSETS[to]).call();
      const bestBid = parseFloat(ob.bids[0]?.price ?? '0');
      const bestAsk = parseFloat(ob.asks[0]?.price ?? '0');
      rates[`${from}_${to}`] = bestAsk > 0 ? bestAsk : bestBid;
    } catch {
      rates[`${from}_${to}`] = 0;
    }
  }

  ratesCache = { rates, updatedAt: Date.now() };
  return res.json(ok({ rates, updatedAt: new Date().toISOString() }));
});

// ── GET /api/swap/quote ───────────────────────────────────────────────────────
router.get('/quote', requireAuth, async (req, res) => {
  const parse = z.object({
    fromAsset: z.string(),
    toAsset:   z.string(),
    amount:    z.coerce.number().positive(),
  }).safeParse(req.query);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { fromAsset, toAsset, amount } = parse.data;
  if (!SUPPORTED_ASSETS[fromAsset] || !SUPPORTED_ASSETS[toAsset]) {
    return res.status(400).json(fail('Unsupported asset pair'));
  }

  try {
    const paths = await server.strictSendPaths(
      SUPPORTED_ASSETS[fromAsset],
      amount.toFixed(7),
      [SUPPORTED_ASSETS[toAsset]],
    ).call();

    if (!paths.records.length) {
      return res.status(400).json(fail('No swap path available for this pair'));
    }

    const best       = paths.records[0];
    const youGet     = parseFloat(best.destination_amount);
    const platformFee = youGet * 0.003; // 0.3% spread
    const netYouGet  = youGet - platformFee;

    return res.json(ok({
      fromAsset,
      toAsset,
      amount,
      youGet:      +netYouGet.toFixed(7),
      rate:        +(youGet / amount).toFixed(7),
      platformFee: +platformFee.toFixed(7),
      slippage:    0.5,
      path:        best.path,
    }));
  } catch (e: any) {
    return res.status(502).json(fail('Failed to fetch quote: ' + e.message));
  }
});

// ── POST /api/swap/execute ────────────────────────────────────────────────────
router.post('/execute', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    fromAsset:  z.string(),
    toAsset:    z.string(),
    amount:     z.number().positive(),
    minReceive: z.number().positive(),
    pin:        z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { fromAsset, toAsset, amount, minReceive, pin } = parse.data;

  if (!SUPPORTED_ASSETS[fromAsset] || !SUPPORTED_ASSETS[toAsset]) {
    return res.status(400).json(fail('Unsupported asset pair'));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const validPin = await verifyPin(pin, user.pinHash);
  if (!validPin) return res.status(403).json(fail('Incorrect PIN'));

  try {
    const keypair = getUserKeypair(user.stellarSecret, pin, user.phone);
    const account = await server.loadAccount(user.stellarPubKey);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee:               StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset:    SUPPORTED_ASSETS[fromAsset],
        sendAmount:   amount.toFixed(7),
        destination:  user.stellarPubKey,
        destAsset:    SUPPORTED_ASSETS[toAsset],
        destMin:      minReceive.toFixed(7),
        path:         [],
      }))
      .addMemo(StellarSdk.Memo.text('OlomiPay swap'))
      .setTimeout(30)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);

    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'SEND', status: 'CONFIRMED',
      stellarTxId: result.hash,
      memo: `Swap ${amount} ${fromAsset} → ${toAsset}`,
    }});

    return res.json(ok({ hash: result.hash, message: `Swapped ${amount} ${fromAsset} → ${toAsset}` }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Swap failed'));
  }
});

// ── GET /api/swap/wallet — user's Stellar wallet info ─────────────────────────
router.get('/wallet', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { stellarPubKey: true, phone: true, kycName: true },
  });
  if (!user) return res.status(404).json(fail('User not found'));

  let balance = { usdc: '0.0000000', xlm: '0.0000000' };
  let funded  = false;
  try {
    const { getBalance } = await import('../services/stellar');
    const b  = await getBalance(user.stellarPubKey);
    balance  = b;
    funded   = true;
  } catch {}

  return res.json(ok({
    address:  user.stellarPubKey,
    phone:    user.phone,
    name:     user.kycName,
    funded,
    balance,
    network:  process.env.STELLAR_NETWORK ?? 'testnet',
    explorerUrl: `https://stellar.expert/explorer/${process.env.STELLAR_NETWORK ?? 'testnet'}/account/${user.stellarPubKey}`,
  }));
});

export { router as swapRouter };
