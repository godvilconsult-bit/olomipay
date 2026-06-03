/**
 * RBAC role taxonomy + normalization.
 *
 * Two naming systems coexist (both fully supported — nothing breaks):
 *   Legacy (in use):   SUPPORT · COMPLIANCE · FINANCE · SUPER_ADMIN
 *   Objective names:   VIEWER  · DEVELOPER  · FINANCIAL_CONTROLLER · OWNER
 *
 * normalizeRole() maps either spelling to a single canonical value so
 * requireRole() comparisons work regardless of which name was stored or
 * which name a route asks for.
 */

export type CanonicalRole =
  | 'VIEWER'
  | 'DEVELOPER'
  | 'FINANCIAL_CONTROLLER'
  | 'OWNER';

// Map every accepted spelling → canonical
const ALIAS: Record<string, CanonicalRole> = {
  // Viewers — read-only auditing
  VIEWER:               'VIEWER',
  SUPPORT:              'VIEWER',
  READONLY:             'VIEWER',
  // Technical developers — monitoring/debug, NO fund movement
  DEVELOPER:            'DEVELOPER',
  DEV:                  'DEVELOPER',
  TECH:                 'DEVELOPER',
  // Financial controllers — payments, settlements, reports
  FINANCIAL_CONTROLLER: 'FINANCIAL_CONTROLLER',
  FINANCE:              'FINANCIAL_CONTROLLER',
  COMPLIANCE:           'FINANCIAL_CONTROLLER',
  CONTROLLER:           'FINANCIAL_CONTROLLER',
  // Owners — full governance
  OWNER:                'OWNER',
  SUPER_ADMIN:          'OWNER',
  SUPERADMIN:           'OWNER',
};

export function normalizeRole(role?: string | null): CanonicalRole | null {
  if (!role) return null;
  return ALIAS[role.trim().toUpperCase()] ?? null;
}

/** Does `userRole` satisfy any of the `required` roles? OWNER satisfies everything. */
export function roleSatisfies(userRole?: string | null, required: string[] = []): boolean {
  const canon = normalizeRole(userRole);
  if (!canon) return false;
  if (canon === 'OWNER') return true; // owner bypasses
  const want = required.map(normalizeRole).filter(Boolean) as CanonicalRole[];
  return want.includes(canon);
}

/** Capabilities matrix — used for UI gating + server checks */
export const CAPABILITIES: Record<CanonicalRole, string[]> = {
  VIEWER:               ['read'],
  DEVELOPER:            ['read', 'system_monitor', 'debug'],
  FINANCIAL_CONTROLLER: ['read', 'send_payment', 'manage_settlements', 'view_reports', 'approve_payout'],
  OWNER:                ['read', 'system_monitor', 'debug', 'send_payment', 'manage_settlements',
                         'view_reports', 'approve_payout', 'manage_roles', 'manage_config', 'bulk_export'],
};

export function hasCapability(role: string | null | undefined, cap: string): boolean {
  const canon = normalizeRole(role);
  if (!canon) return false;
  return CAPABILITIES[canon].includes(cap);
}
