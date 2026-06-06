/**
 * Unified admin authentication.
 *
 * Two kinds of admin caller are accepted:
 *   1. STAFF — back-office accounts (username + password). Token carries
 *      { kind:'staff', staffId, role }. This is the going-forward model.
 *   2. Legacy app-user-admin — an app User with isAdmin=true (e.g. the bootstrap
 *      owner). Kept for backward compatibility.
 *
 * On success the request is populated with the ACTING admin's identity so the
 * rest of the code (audit log, approvals) treats `req.userId` as the actor id:
 *   req.userId    = staff/user id of the acting admin
 *   req.adminRole = their RBAC role (SUPPORT/COMPLIANCE/FINANCE/SUPER_ADMIN)
 *   req.adminPhone= username (staff) or phone (legacy)
 *   req.isStaff   = true for staff accounts
 */
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { roleSatisfies } from './roles';
import { AuthRequest } from '../middleware/auth';

export interface ResolvedAdmin {
  id: string; role: string | null; name: string; phone: string; isStaff: boolean;
}

export async function resolveAdmin(req: AuthRequest): Promise<ResolvedAdmin | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  let payload: any;
  try { payload = jwt.verify(h.slice(7), process.env.JWT_SECRET!); } catch { return null; }

  // 1) Staff token
  if (payload?.kind === 'staff' && payload.staffId) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","username","name","role","isActive" FROM "Staff" WHERE "id" = $1`, payload.staffId,
    ).catch(() => []);
    const s = rows[0];
    if (!s || !s.isActive) return null;
    return { id: s.id, role: s.role, name: s.name ?? s.username, phone: s.username, isStaff: true };
  }

  // 2) Legacy app-user admin
  if (payload?.userId) {
    const u = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isAdmin: true, adminRole: true, phone: true, kycName: true },
    }).catch(() => null);
    if (u?.isAdmin) {
      return { id: payload.userId, role: u.adminRole, name: u.kycName ?? u.phone, phone: u.phone, isStaff: false };
    }
  }
  return null;
}

function apply(req: AuthRequest, a: ResolvedAdmin) {
  req.userId = a.id;                 // actor id for audit/approvals
  (req as any).staffId   = a.isStaff ? a.id : undefined;
  (req as any).adminRole = a.role;
  (req as any).adminPhone = a.phone;
  (req as any).adminName = a.name;
  (req as any).isStaff   = a.isStaff;
  (req as any).userPhone = a.phone;
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  resolveAdmin(req).then(a => {
    if (!a) return res.status(403).json({ success: false, error: 'Admin access required' });
    apply(req, a); next();
  }).catch(() => res.status(500).json({ success: false, error: 'Auth error' }));
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    resolveAdmin(req).then(a => {
      if (!a) return res.status(403).json({ success: false, error: 'Admin access required' });
      if (!roleSatisfies(a.role, roles)) {
        return res.status(403).json({ success: false, error: `Requires role: ${roles.join(' or ')}` });
      }
      apply(req, a); next();
    }).catch(() => res.status(500).json({ success: false, error: 'Auth error' }));
  };
}
