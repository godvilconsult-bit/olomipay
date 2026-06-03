import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deriveKeypairFromPhone, activateUserWallet, getBalance, platformSendUsdc } from '../services/stellar';
import { encryptSecret, hashPin } from '../services/crypto';
import { roleSatisfies } from '../services/roles';

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

// ── RBAC — gate by admin role (OWNER/SUPER_ADMIN bypasses everything) ───────────
// Accepts BOTH naming systems via roles.ts alias map:
//   Legacy: SUPPORT · COMPLIANCE · FINANCE · SUPER_ADMIN
//   New:    VIEWER  · DEVELOPER  · FINANCIAL_CONTROLLER · OWNER
function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: any, next: any) => {
    const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true, adminRole: true } });
    if (!u?.isAdmin) return res.status(403).json(fail('Admin access required'));
    // roleSatisfies normalizes both stored role and required roles, OWNER bypasses
    if (roleSatisfies(u.adminRole, roles)) return next();
    return res.status(403).json(fail(`Requires role: ${roles.join(' or ')}`));
  };
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

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Maker–checker (4-eyes) for money-moving actions
// ════════════════════════════════════════════════════════════════════════════

// Maker proposes a manual credit — does NOT execute; queues for a second admin.
router.post('/users/:id/credit', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const amountUsdc = Number(req.body?.amountUsdc);
  const reason     = String(req.body?.reason ?? '').slice(0, 300);
  if (!(amountUsdc > 0)) return res.status(400).json(fail('amountUsdc must be > 0'));
  if (!reason)           return res.status(400).json(fail('A reason is required'));

  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, phone: true } });
  if (!target) return res.status(404).json(fail('User not found'));

  const payload = { userId: target.id, phone: target.phone, amountUsdc, reason };
  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "AdminApproval" ("action","payload","makerId","makerPhone")
     VALUES ($1,$2,$3,$4) RETURNING id`,
    'manual_credit', JSON.stringify(payload), req.userId!, (req as any).adminPhone ?? null,
  );
  await audit(req, 'propose_credit', target.id, 'user', payload);
  return res.json(ok({ approvalId: row.id, message: 'Credit queued — a different admin must approve it.' }));
});

// Pending approvals queue
router.get('/approvals', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "AdminApproval" ORDER BY "createdAt" DESC LIMIT 200`,
  );
  const [{ count }] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "AdminApproval" WHERE "status"='PENDING'`);
  return res.json(ok({ approvals: rows, total: rows.length, pending: count }));
});

// Checker approves → executes. Must be a DIFFERENT admin with FINANCE/SUPER role.
router.post('/approvals/:id/approve', requireAuth, requireRole('FINANCE', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const [appr] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "AdminApproval" WHERE "id"=$1`, req.params.id);
  if (!appr) return res.status(404).json(fail('Approval not found'));
  if (appr.status !== 'PENDING') return res.status(400).json(fail('Already decided'));
  if (appr.makerId === req.userId) return res.status(403).json(fail('The checker must be a different admin (4-eyes).'));

  try {
    const payload = JSON.parse(appr.payload ?? '{}');
    let result = '';
    if (appr.action === 'manual_credit') {
      const u = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!u) throw new Error('User no longer exists');
      const hash = await platformSendUsdc(u.stellarPubKey, payload.amountUsdc, `Manual credit: ${payload.reason}`.slice(0, 28));
      await prisma.transaction.create({ data: {
        userId: u.id, type: 'RECEIVE', status: 'CONFIRMED', amountUsdc: payload.amountUsdc,
        stellarTxId: hash, memo: `Manual credit (admin): ${payload.reason}`,
      }});
      result = hash;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminApproval" SET "status"='APPROVED', "checkerId"=$1, "result"=$2, "decidedAt"=NOW() WHERE "id"=$3`,
      req.userId!, result, appr.id,
    );
    await audit(req, 'approve_' + appr.action, appr.id, 'approval', { result });
    return res.json(ok({ message: 'Approved & executed', result }));
  } catch (e: any) {
    await prisma.$executeRawUnsafe(`UPDATE "AdminApproval" SET "status"='FAILED', "checkerId"=$1, "result"=$2, "decidedAt"=NOW() WHERE "id"=$3`, req.userId!, e.message, appr.id);
    return res.status(502).json(fail(e.message ?? 'Execution failed'));
  }
});

router.post('/approvals/:id/reject', requireAuth, requireRole('FINANCE', 'COMPLIANCE', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  await prisma.$executeRawUnsafe(`UPDATE "AdminApproval" SET "status"='REJECTED', "checkerId"=$1, "decidedAt"=NOW() WHERE "id"=$2 AND "status"='PENDING'`, req.userId!, req.params.id);
  await audit(req, 'reject_approval', req.params.id, 'approval');
  return res.json(ok({ message: 'Rejected' }));
});

// Set an admin's RBAC role (SUPER_ADMIN only)
router.post('/users/:id/admin-role', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const role = String(req.body?.role ?? '');
  const valid = ['SUPPORT', 'COMPLIANCE', 'FINANCE', 'SUPER_ADMIN', ''];
  if (!valid.includes(role)) return res.status(400).json(fail('Invalid role'));
  await prisma.user.update({ where: { id: req.params.id }, data: { isAdmin: role !== '', adminRole: role || null } as any });
  await audit(req, 'set_admin_role', req.params.id, 'user', { role });
  return res.json(ok({ message: `Role set to ${role || 'none'}` }));
});

export { router as adminSupportRouter };
