/**
 * Staff accounts — back-office admins with username + password, created and
 * managed by the SUPER_ADMIN. Separate from app users (phone + PIN).
 *
 * Mounted at /api/admin, so:
 *   POST /api/admin/staff/login              (public — username + password)
 *   GET  /api/admin/staff/me                 (any staff)
 *   GET  /api/admin/staff                     (SUPER_ADMIN)  list
 *   POST /api/admin/staff                     (SUPER_ADMIN)  create
 *   POST /api/admin/staff/:id/role            (SUPER_ADMIN)  change role
 *   POST /api/admin/staff/:id/active          (SUPER_ADMIN)  enable/disable
 *   POST /api/admin/staff/:id/reset-password  (SUPER_ADMIN)  reset password
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { hashPin, verifyPin } from '../services/crypto';
import { requireRole } from '../services/adminAuth';
import { AuthRequest } from '../middleware/auth';
import {
  STAFF_ROLES, APPROVER_ROLES, creatableRoles, canManageStaff,
  isSuperAdmin, departmentOf,
} from '../services/roles';
import { queueApproval } from '../services/approvals';

const router = Router();
const ok   = (d: any) => ({ success: true, data: d });
const fail = (m: string) => ({ success: false, error: m });
const ROLES = STAFF_ROLES as readonly string[];

async function audit(req: AuthRequest, action: string, targetId?: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminAuditLog" ("adminId","adminPhone","action","targetId","targetType","detail","ip")
       VALUES ($1,$2,$3,$4,'staff',$5,$6)`,
      req.userId ?? null, (req as any).adminPhone ?? null, action, targetId ?? null,
      detail ? JSON.stringify(detail).slice(0, 2000) : null,
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? null,
    );
  } catch {}
}

// ── Staff login (public) — with lockout after repeated failures ───────────────
router.post('/staff/login', async (req, res) => {
  const username = String(req.body?.username ?? '').toLowerCase().trim();
  const password = String(req.body?.password ?? '');
  if (!username || !password) return res.status(400).json(fail('Username and password required'));

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? null;
  const logSec = (type: string, detail?: string) =>
    prisma.$executeRawUnsafe(`INSERT INTO "SecurityEvent" ("type","phone","detail","ip") VALUES ($1,$2,$3,$4)`, type, username, detail ?? null, ip).catch(() => {});

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Staff" WHERE "username" = $1`, username).catch(() => []);
  const s = rows[0];
  if (!s || !s.isActive) { logSec('staff_failed_login', 'unknown/disabled'); return res.status(401).json(fail('Invalid credentials')); }

  const LOCK_MINUTES = 30, MAX_ATTEMPTS = 5;
  const now = Date.now();
  const lockedUntilMs = s.lockedUntil ? new Date(s.lockedUntil).getTime() : 0;
  if (lockedUntilMs > now) {
    const mins = Math.ceil((lockedUntilMs - now) / 60_000);
    return res.status(423).json({ success: false, error: `Account locked. Try again in ${mins} minute(s).`, locked: true, minutes: mins });
  }

  if (!await verifyPin(password, s.passwordHash)) {
    const count = (s.failedLoginCount ?? 0) + 1;
    if (count >= MAX_ATTEMPTS) {
      const until = new Date(now + LOCK_MINUTES * 60_000);
      await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "failedLoginCount" = 0, "lockedUntil" = $1 WHERE "id" = $2`, until, s.id);
      logSec('staff_account_locked', `locked ${LOCK_MINUTES}m after ${MAX_ATTEMPTS} fails`);
      return res.status(423).json({ success: false, error: `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`, locked: true, minutes: LOCK_MINUTES });
    }
    await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "failedLoginCount" = $1 WHERE "id" = $2`, count, s.id);
    logSec('staff_failed_login', `attempt ${count}/${MAX_ATTEMPTS}`);
    return res.status(401).json(fail(`Invalid credentials. ${MAX_ATTEMPTS - count} attempt(s) left before lockout.`));
  }

  await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "lastLoginAt" = NOW(), "failedLoginCount" = 0, "lockedUntil" = NULL WHERE "id" = $1`, s.id).catch(() => {});
  const accessToken = jwt.sign({ kind: 'staff', staffId: s.id, role: s.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return res.json(ok({ accessToken, staff: { id: s.id, username: s.username, name: s.name, role: s.role } }));
});

// ── Current staff identity + what THIS staff may create ───────────────────────
router.get('/staff/me', requireRole(...APPROVER_ROLES, 'FINANCE_STAFF', 'IT_STAFF', 'SUPPORT_STAFF', 'MARKETING_STAFF'),
  async (req: AuthRequest, res) => {
    const role = (req as any).adminRole;
    return res.json(ok({
      id: req.userId, name: (req as any).adminName, username: (req as any).adminPhone,
      role, isStaff: (req as any).isStaff,
      department: departmentOf(role),
      canCreateRoles: creatableRoles(role),   // roles this person may add
      canManageStaff: canManageStaff(role),    // edit role / delete (super-admin only)
    }));
  });

// ── List staff. Heads see only their department; super-admin sees all. ─────────
router.get('/staff', requireRole(...APPROVER_ROLES), async (req: AuthRequest, res) => {
  const role = (req as any).adminRole;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","username","name","role","isActive","lastLoginAt","createdAt" FROM "Staff" ORDER BY "createdAt" DESC`,
  ).catch(() => []);
  const dept = departmentOf(role);
  const visible = isSuperAdmin(role) ? rows : rows.filter(s => departmentOf(s.role) === dept || s.id === req.userId);
  return res.json(ok({ staff: visible }));
});

// ── Add staff. Super-admin → immediate. Head → queued for 3-admin approval. ────
router.post('/staff', requireRole(...APPROVER_ROLES), async (req: AuthRequest, res) => {
  const actorRole = (req as any).adminRole;
  const username = String(req.body?.username ?? '').toLowerCase().trim();
  const password = String(req.body?.password ?? '');
  const name     = String(req.body?.name ?? '').slice(0, 80);
  const role     = String(req.body?.role ?? '').toUpperCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json(fail('Username must be 3–32 chars: letters, numbers, . _ -'));
  if (password.length < 8) return res.status(400).json(fail('Password must be at least 8 characters'));

  // Enforce who-can-create-whom
  const allowed = creatableRoles(actorRole);
  if (!allowed.includes(role)) {
    return res.status(403).json(fail(`You can only create: ${allowed.join(', ') || 'no roles'}`));
  }

  const exists = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "Staff" WHERE "username" = $1`, username).catch(() => []);
  if (exists.length) return res.status(409).json(fail('Username already taken'));

  // Hash the password NOW so it never sits in plaintext (incl. in an approval row).
  const passwordHash = hashPin(password);

  try {
    const r = await queueApproval({
      action: 'add_staff',
      payload: { username, passwordHash, name: name || username, role },
      actorId: req.userId!, actorPhone: (req as any).adminPhone ?? null,
    });
    await audit(req, r.executed ? 'create_staff' : 'propose_staff', undefined, { username, role, ...r });
    return res.json(ok(r));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Failed to add staff'));
  }
});

// ── Edit role — SUPER_ADMIN only (incl. promoting another SUPER_ADMIN) ─────────
router.post('/staff/:id/role', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const role = String(req.body?.role ?? '').toUpperCase();
  if (!ROLES.includes(role)) return res.status(400).json(fail('Invalid role'));
  await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "role" = $1 WHERE "id" = $2`, role, req.params.id);
  await audit(req, 'set_staff_role', req.params.id, { role });
  return res.json(ok({ message: `Role updated to ${role}` }));
});

router.post('/staff/:id/active', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const active = !!req.body?.active;
  await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "isActive" = $1 WHERE "id" = $2`, active, req.params.id);
  await audit(req, active ? 'activate_staff' : 'deactivate_staff', req.params.id);
  return res.json(ok({ message: active ? 'Staff activated' : 'Staff deactivated' }));
});

router.post('/staff/:id/reset-password', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const password = String(req.body?.password ?? '');
  if (password.length < 8) return res.status(400).json(fail('Password must be at least 8 characters'));
  await prisma.$executeRawUnsafe(`UPDATE "Staff" SET "passwordHash" = $1 WHERE "id" = $2`, hashPin(password), req.params.id);
  await audit(req, 'reset_staff_password', req.params.id);
  return res.json(ok({ message: 'Password reset' }));
});

// ── Delete staff — SUPER_ADMIN only ───────────────────────────────────────────
router.delete('/staff/:id', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  if (req.params.id === req.userId) return res.status(400).json(fail('You cannot delete your own account.'));
  await prisma.$executeRawUnsafe(`DELETE FROM "Staff" WHERE "id" = $1`, req.params.id);
  await audit(req, 'delete_staff', req.params.id);
  return res.json(ok({ message: 'Staff deleted' }));
});

export { router as staffRouter };
