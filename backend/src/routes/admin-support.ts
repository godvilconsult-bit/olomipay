import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deriveKeypairFromPhone, activateUserWallet, getBalance } from '../services/stellar';
import { encryptSecret, hashPin } from '../services/crypto';

const router  = Router();
const prisma  = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── Admin guard (DB-backed) ─────────────────────────────────────────────────────
async function requireAdmin(req: AuthRequest, res: any, next: any) {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true, phone: true } });
  if (!u?.isAdmin) return res.status(403).json(fail('Admin access required'));
  (req as any).adminPhone = u.phone;
  next();
}

// ── Immutable audit — record every back-office action ───────────────────────────
async function audit(req: AuthRequest, action: string, targetId?: string, targetType?: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminAuditLog" ("adminId","adminPhone","action","targetId","targetType","detail","ip")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      req.userId!, (req as any).adminPhone ?? null, action, targetId ?? null, targetType ?? null,
      detail ? JSON.stringify(detail).slice(0, 2000) : null,
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? null,
    );
  } catch (e: any) { console.error('[audit]', e.message); }
}

// ── GET /api/admin/users/:id — Customer 360 ─────────────────────────────────────
router.get('/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.params.id },
    select: {
      id: true, phone: true, kycName: true, kycStatus: true, stellarPubKey: true,
      isAdmin: true, isFeeCollector: true, isOnline: true, lastSeenAt: true,
      activationFeePaid: true, createdAt: true,
    },
  });
  if (!user) return res.status(404).json(fail('User not found'));

  const [txs, balance, derived] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 25 }),
    getBalance(user.stellarPubKey).catch(() => ({ xlm: '0', usdc: '0' })),
    Promise.resolve(deriveKeypairFromPhone(user.phone)),
  ]);

  return res.json(ok({
    user,
    balance,
    recentTransactions: txs,
    walletDeterministic: derived.publicKey === user.stellarPubKey, // recoverable?
  }));
});

// ── POST /api/admin/users/:id/reset-pin — re-key deterministically ──────────────
// Deterministic wallets let us reset a PIN WITHOUT losing funds: re-derive the
// secret from the phone, re-encrypt under the new PIN, update the hash. Same wallet.
router.post('/users/:id/reset-pin', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const newPin = String(req.body?.newPin ?? '');
  if (!/^\d{6}$/.test(newPin)) return res.status(400).json(fail('newPin must be 6 digits'));

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json(fail('User not found'));

  const { publicKey, secretKey } = deriveKeypairFromPhone(user.phone);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinHash:       hashPin(newPin),
      stellarSecret: encryptSecret(secretKey, newPin, user.phone),
      stellarPubKey: publicKey,
    },
  });
  await audit(req, 'reset_pin', user.id, 'user', { phone: user.phone });
  return res.json(ok({ message: 'PIN reset. Wallet preserved (same address). Share the temporary PIN with the user securely.' }));
});

// ── POST /api/admin/users/:id/role — toggle admin ───────────────────────────────
router.post('/users/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const makeAdmin = !!req.body?.isAdmin;
  if (req.params.id === req.userId && !makeAdmin) {
    return res.status(400).json(fail("You can't remove your own admin role."));
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { isAdmin: makeAdmin } });
  await audit(req, makeAdmin ? 'grant_admin' : 'revoke_admin', req.params.id, 'user');
  return res.json(ok({ message: makeAdmin ? 'Admin granted' : 'Admin revoked' }));
});

// ── POST /api/admin/users/:id/block · /unblock — freeze account ─────────────────
router.post('/users/:id/block', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isFrozen" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "isFrozen" = true WHERE "id" = $1`, req.params.id);
  await audit(req, 'freeze_account', req.params.id, 'user', { reason: req.body?.reason });
  return res.json(ok({ message: 'Account frozen' }));
});
router.post('/users/:id/unblock', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isFrozen" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "isFrozen" = false WHERE "id" = $1`, req.params.id);
  await audit(req, 'unfreeze_account', req.params.id, 'user');
  return res.json(ok({ message: 'Account unfrozen' }));
});

// ── POST /api/admin/transactions/:id/resolve — unstick a PENDING tx ─────────────
router.post('/transactions/:id/resolve', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const status = req.body?.status === 'CONFIRMED' ? 'CONFIRMED' : 'FAILED';
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx) return res.status(404).json(fail('Transaction not found'));
  if (tx.status !== 'PENDING') return res.status(400).json(fail('Only PENDING transactions can be resolved.'));
  await prisma.transaction.update({ where: { id: tx.id }, data: { status, errorMsg: `Manually resolved by admin → ${status}` } });
  await audit(req, 'resolve_transaction', tx.id, 'transaction', { from: 'PENDING', to: status });
  return res.json(ok({ message: `Transaction marked ${status}` }));
});

// ── GET /api/admin/audit — the immutable action log ─────────────────────────────
router.get('/audit', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const limit  = Math.min(parseInt(req.query.limit as string ?? '100'), 500);
  const offset = parseInt(req.query.offset as string ?? '0');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "AdminAuditLog" ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2`, limit, offset,
  );
  const [{ count }] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "AdminAuditLog"`);
  return res.json(ok({ logs: rows, total: count }));
});

export { router as adminSupportRouter };
