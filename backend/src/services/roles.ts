/**
 * Organisational RBAC for OlomiPay staff.
 *
 * Structure:
 *   SUPER_ADMIN                      — full governance; only a super-admin can
 *                                      create/edit/delete ANY staff, assign any
 *                                      role, promote another SUPER_ADMIN, and
 *                                      bypass approvals.
 *   <DEPT>_HEAD  (the "four heads")  — FINANCE_HEAD, IT_HEAD, SUPPORT_HEAD,
 *                                      MARKETING_HEAD. Each can ADD staff in
 *                                      their OWN department (subject to 3-admin
 *                                      approval). Cannot create heads/admins,
 *                                      cannot edit roles or delete staff.
 *   <DEPT>_STAFF                     — department workers. Cannot manage staff.
 *
 * "Admins" (who can approve things) = SUPER_ADMIN + all *_HEAD.
 */

export const DEPARTMENTS = ['FINANCE', 'IT', 'SUPPORT', 'MARKETING'] as const;
export type Department = typeof DEPARTMENTS[number];

export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'FINANCE_HEAD',   'FINANCE_STAFF',
  'IT_HEAD',        'IT_STAFF',
  'SUPPORT_HEAD',   'SUPPORT_STAFF',
  'MARKETING_HEAD', 'MARKETING_STAFF',
] as const;
export type StaffRole = typeof STAFF_ROLES[number];

/** Roles allowed to approve money-moving / staff-add requests. */
export const APPROVER_ROLES = ['SUPER_ADMIN', 'FINANCE_HEAD', 'IT_HEAD', 'SUPPORT_HEAD', 'MARKETING_HEAD'];

const up = (r?: string | null) => (r ?? '').trim().toUpperCase();

// Legacy spellings → new roles (so old data / requireRole calls keep working)
const ALIAS: Record<string, string> = {
  OWNER: 'SUPER_ADMIN', SUPERADMIN: 'SUPER_ADMIN',
  FINANCE: 'FINANCE_HEAD', FINANCIAL_CONTROLLER: 'FINANCE_HEAD', COMPLIANCE: 'FINANCE_HEAD',
  SUPPORT: 'SUPPORT_HEAD', DEVELOPER: 'IT_HEAD', DEV: 'IT_HEAD', TECH: 'IT_HEAD',
};
const canon = (r?: string | null) => ALIAS[up(r)] ?? up(r);

export function isSuperAdmin(role?: string | null): boolean { return canon(role) === 'SUPER_ADMIN'; }
export function isHead(role?: string | null): boolean { return /_HEAD$/.test(canon(role)); }
export function isAdmin(role?: string | null): boolean { return isSuperAdmin(role) || isHead(role); }

export function departmentOf(role?: string | null): Department | null {
  const r = canon(role);
  for (const d of DEPARTMENTS) if (r.startsWith(d + '_')) return d;
  return null;
}

/** Which roles may `actorRole` create? */
export function creatableRoles(actorRole?: string | null): string[] {
  if (isSuperAdmin(actorRole)) return [...STAFF_ROLES];      // anything, incl. heads + super-admin
  if (isHead(actorRole)) {
    const d = departmentOf(actorRole);
    return d ? [`${d}_STAFF`] : [];                          // own-department staff only
  }
  return [];                                                  // staff can create nobody
}

/** Only a super-admin can edit roles / delete staff / promote a super-admin. */
export function canManageStaff(actorRole?: string | null): boolean { return isSuperAdmin(actorRole); }

/**
 * Does `userRole` satisfy any of the `required` roles? SUPER_ADMIN satisfies
 * everything. Legacy spellings are aliased on both sides.
 */
export function roleSatisfies(userRole?: string | null, required: string[] = []): boolean {
  const u = canon(userRole);
  if (!u) return false;
  if (u === 'SUPER_ADMIN') return true;             // super-admin bypasses
  const want = required.map(canon);
  return want.includes(u);
}
