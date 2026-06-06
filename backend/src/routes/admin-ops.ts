import { Router } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance, getFeeWalletPublic } from '../services/stellar';
import { requireAdmin } from '../services/adminAuth';

const router  = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });
async function audit(req: AuthRequest, action: string, targetId?: string, targetType?: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminAuditLog" ("adminId","adminPhone","action","targetId","targetType","detail","ip")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      req.userId!, (req as any).adminPhone ?? null, action, targetId ?? null, targetType ?? null,
      detail ? JSON.stringify(detail).slice(0, 2000) : null,
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? null,
    );
  } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — KYC review queue
// ════════════════════════════════════════════════════════════════════════════
router.get('/kyc/pending', requireAuth, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    where:  { kycStatus: { in: ['SUBMITTED', 'PENDING'] } },
    select: { id: true, phone: true, kycName: true, kycStatus: true, kycIdType: true, kycIdNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' }, take: 200,
  });
  return res.json(ok({ users, total: users.length }));
});

router.post('/kyc/:id/decision', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const decision = req.body?.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus: decision } });
  await audit(req, 'kyc_' + decision.toLowerCase(), req.params.id, 'user', { reason: req.body?.reason });
  return res.json(ok({ message: `KYC ${decision}` }));
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Treasury & reconciliation (fiat ↔ chain)
// ════════════════════════════════════════════════════════════════════════════
router.get('/treasury', requireAuth, requireAdmin, async (_req, res) => {
  const platformPub = process.env.STELLAR_PUBLIC_KEY ?? '';
  const feeWallet   = getFeeWalletPublic();

  const [platformBal, feeBal, agg] = await Promise.all([
    platformPub ? getBalance(platformPub).catch(() => ({ xlm: '0', usdc: '0' })) : Promise.resolve({ xlm: '0', usdc: '0' }),
    feeWallet   ? getBalance(feeWallet).catch(()   => ({ xlm: '0', usdc: '0' })) : Promise.resolve({ xlm: '0', usdc: '0' }),
    prisma.transaction.groupBy({ by: ['type'], where: { status: 'CONFIRMED' }, _sum: { amountUsdc: true } }),
  ]);

  const sum = (t: string) => agg.find(a => a.type === t)?._sum.amountUsdc ?? 0;
  // User liabilities ≈ what we owe users = inflows − outflows recorded in the ledger
  const inflow   = sum('DEPOSIT') + sum('RECEIVE');
  const outflow  = sum('WITHDRAWAL') + sum('SEND') + sum('FEE');
  const liabilities = Math.max(0, inflow - outflow);
  const platformUsdc = parseFloat(platformBal.usdc);

  return res.json(ok({
    platformWallet: { address: platformPub, ...platformBal },
    feeWallet:      { address: feeWallet,   ...feeBal },
    ledger: {
      inflowUsdc: inflow, outflowUsdc: outflow, userLiabilitiesUsdc: liabilities,
    },
    reconciliation: {
      platformUsdc,
      expectedFloatUsdc: liabilities,
      deltaUsdc: parseFloat((platformUsdc - liabilities).toFixed(4)), // >0 = surplus, <0 = shortfall
      healthy: platformUsdc + 0.0001 >= liabilities,
    },
  }));
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Risk & fraud alerts (simple rules engine)
// ════════════════════════════════════════════════════════════════════════════
router.get('/risk/alerts', requireAuth, requireAdmin, async (_req, res) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const txs = await prisma.transaction.findMany({
    where:   { createdAt: { gt: since } },
    include: { user: { select: { phone: true, kycName: true } } },
    orderBy: { createdAt: 'desc' }, take: 1000,
  });

  const LARGE = Number(process.env.RISK_LARGE_USDC ?? 500);
  const alerts: any[] = [];
  const perUser: Record<string, number> = {};

  for (const t of txs) {
    perUser[t.userId] = (perUser[t.userId] ?? 0) + 1;
    if ((t.amountUsdc ?? 0) >= LARGE) {
      alerts.push({ type: 'LARGE_AMOUNT', severity: 'high', txId: t.id, user: t.user?.phone, amountUsdc: t.amountUsdc, at: t.createdAt });
    }
    if (t.status === 'FAILED') {
      alerts.push({ type: 'FAILED_TX', severity: 'low', txId: t.id, user: t.user?.phone, at: t.createdAt });
    }
  }
  // Velocity: > 15 tx/user/24h
  for (const [userId, count] of Object.entries(perUser)) {
    if (count > 15) {
      const u = txs.find(t => t.userId === userId)?.user;
      alerts.push({ type: 'HIGH_VELOCITY', severity: 'medium', user: u?.phone, count, window: '24h' });
    }
  }
  return res.json(ok({ alerts, total: alerts.length, window: '24h', largeThresholdUsdc: LARGE }));
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Analytics
// ════════════════════════════════════════════════════════════════════════════
router.get('/analytics', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS tx_count,
           COALESCE(SUM("amountUsdc"),0)::float AS volume_usdc
    FROM "Transaction"
    WHERE "status" = 'CONFIRMED' AND "createdAt" > NOW() - INTERVAL '30 days'
    GROUP BY day ORDER BY day ASC
  `).catch(() => []);
  const users = await prisma.$queryRawUnsafe<any[]>(`
    SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS new_users
    FROM "User" WHERE "createdAt" > NOW() - INTERVAL '30 days'
    GROUP BY day ORDER BY day ASC
  `).catch(() => []);
  return res.json(ok({ dailyVolume: rows, dailyNewUsers: users }));
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Admin 2FA (TOTP, RFC 6238)
// ════════════════════════════════════════════════════════════════════════════
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function toBase32(buf: Buffer): string {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function fromBase32(s: string): Buffer {
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secretB32: string, step = 30, t = Date.now()): string {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', fromBase32(secretB32)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
function verifyTotp(secretB32: string, token: string): boolean {
  const now = Date.now();
  for (const drift of [-1, 0, 1]) { // ±30s window
    if (totp(secretB32, 30, now + drift * 30_000) === token) return true;
  }
  return false;
}

router.post('/2fa/setup', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const secret = toBase32(crypto.randomBytes(20));
  await prisma.user.update({ where: { id: req.userId! }, data: { adminTotpSecret: secret, adminTotpEnabled: false } as any });
  const phone = (req as any).adminPhone ?? 'admin';
  const otpauth = `otpauth://totp/OlomiPay%20Admin:${encodeURIComponent(phone)}?secret=${secret}&issuer=OlomiPay`;
  return res.json(ok({ secret, otpauth, message: 'Scan in an authenticator app, then verify a code to enable.' }));
});

router.post('/2fa/enable', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const token = String(req.body?.token ?? '');
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { adminTotpSecret: true } as any });
  const secret = (u as any)?.adminTotpSecret;
  if (!secret) return res.status(400).json(fail('Run /2fa/setup first'));
  if (!verifyTotp(secret, token)) return res.status(400).json(fail('Invalid code'));
  await prisma.user.update({ where: { id: req.userId! }, data: { adminTotpEnabled: true } as any });
  await audit(req, 'enable_2fa', req.userId!, 'user');
  return res.json(ok({ message: '2FA enabled' }));
});

// Verify a code at admin login (called by the admin panel after password step)
router.post('/2fa/verify', requireAuth, async (req: AuthRequest, res) => {
  const token = String(req.body?.token ?? '');
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { adminTotpSecret: true, adminTotpEnabled: true } as any });
  if (!(u as any)?.adminTotpEnabled) return res.json(ok({ ok: true, required: false }));
  return res.json(ok({ ok: verifyTotp((u as any).adminTotpSecret, token), required: true }));
});

export { router as adminOpsRouter };
