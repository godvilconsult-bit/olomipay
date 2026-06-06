/**
 * Multi-step approval engine (shared across all admin routers).
 *
 * Sensitive, money-moving actions require THREE distinct admin sign-offs
 * (FINANCE / SUPER_ADMIN) before they execute. A SUPER_ADMIN (OWNER) overrides
 * and executes in one step. The number of required sign-offs auto-scales down if
 * fewer eligible approvers exist, so it never deadlocks.
 *
 * Each action type registers a handler in ACTION_HANDLERS; queueApproval() and
 * the /approvals/:id/approve endpoint both run actions through that registry.
 */

import { prisma } from '../lib/prisma';
import { roleSatisfies } from './roles';
import { platformSendUsdc, platformSendXlm } from './stellar';

export const REQUIRED_APPROVALS = 3;

export const isSuper = (role?: string | null) => roleSatisfies(role, ['SUPER_ADMIN']);

export async function getAdminRole(actorId: string): Promise<string | null> {
  // Staff account first (the going-forward admins), then legacy app-user-admin.
  const staff = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "role" FROM "Staff" WHERE "id" = $1 AND "isActive" = true`, actorId,
  ).catch(() => []);
  if (staff[0]) return staff[0].role ?? null;
  const u = await prisma.user.findUnique({ where: { id: actorId }, select: { adminRole: true } }).catch(() => null);
  return u?.adminRole ?? null;
}

/** How many OTHER admins can validly approve (FINANCE or SUPER_ADMIN/OWNER)? */
export async function validApproverCount(excludeId: string): Promise<number> {
  // Eligible STAFF approvers
  const staff = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "role" FROM "Staff" WHERE "isActive" = true AND "id" <> $1`, excludeId,
  ).catch(() => []);
  const staffCount = staff.filter(a => roleSatisfies(a.role, ['FINANCE', 'SUPER_ADMIN'])).length;
  // Plus legacy app-user admins
  const admins = await prisma.user.findMany({
    where: { isAdmin: true, id: { not: excludeId } }, select: { adminRole: true },
  }).catch(() => []);
  const userCount = admins.filter(a => roleSatisfies(a.adminRole, ['FINANCE', 'SUPER_ADMIN'])).length;
  return staffCount + userCount;
}

// ── Action registry ──────────────────────────────────────────────────────────
// Each handler runs the actual side-effect and returns a short result string.
type Handler = (payload: any) => Promise<string>;

const ACTION_HANDLERS: Record<string, Handler> = {
  // Credit a user from the platform wallet.
  manual_credit: async (p) => {
    const u = await prisma.user.findUnique({ where: { id: p.userId } });
    if (!u) throw new Error('User no longer exists');
    const hash = await platformSendUsdc(u.stellarPubKey, p.amountUsdc, `Manual credit: ${p.reason}`.slice(0, 28));
    await prisma.transaction.create({ data: {
      userId: u.id, type: 'RECEIVE', status: 'CONFIRMED', amountUsdc: p.amountUsdc,
      stellarTxId: hash, memo: `Manual credit (admin): ${p.reason}`,
    }});
    return hash;
  },

  // Send XLM or USDC from the platform wallet to any Stellar address.
  admin_send: async (p) => {
    const amount = Number(p.amount);
    if (!(amount > 0)) throw new Error('Invalid amount');
    const hash = p.asset === 'USDC'
      ? await platformSendUsdc(p.toAddress, amount, p.memo)
      : await platformSendXlm(p.toAddress, amount, p.memo);
    await prisma.transaction.create({ data: {
      userId: p.actorId, type: 'SEND', status: 'CONFIRMED',
      amountUsdc: p.asset === 'USDC' ? amount : 0,
      stellarTxId: hash, toAddress: p.toAddress, memo: `Admin ${p.asset} send: ${p.memo ?? ''}`.slice(0, 60),
    }}).catch(() => {});
    return hash;
  },

  // Reverse a stuck/failed transaction (off-chain payout reversal handled by ops).
  refund: async (p) => {
    const tx = await prisma.transaction.findUnique({ where: { id: p.txId } });
    if (!tx) throw new Error('Transaction not found');
    if (!['PENDING', 'FAILED'].includes(tx.status)) throw new Error('Only PENDING/FAILED can be refunded');
    await prisma.transaction.update({
      where: { id: tx.id }, data: { status: 'FAILED', errorMsg: `Refunded by admin: ${p.reason}` },
    });
    return 'refunded';
  },
};

export async function executeApprovalAction(appr: any): Promise<string> {
  const payload = JSON.parse(appr.payload ?? '{}');
  const handler = ACTION_HANDLERS[appr.action];
  if (!handler) throw new Error(`Unknown approval action: ${appr.action}`);
  return handler(payload);
}

export async function markExecuted(apprId: string, finalApproverId: string, approvals: any[], result: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "AdminApproval" SET "status"='APPROVED', "checkerId"=$1, "result"=$2, "approvals"=$3::jsonb, "decidedAt"=NOW() WHERE "id"=$4`,
    finalApproverId, result, JSON.stringify(approvals), apprId,
  );
}

export interface QueueResult {
  approvalId: string;
  executed: boolean;
  result?: string;
  requiredApprovals?: number;
  message: string;
}

/**
 * Queue a sensitive action for multi-step approval — or, if the actor is a
 * SUPER_ADMIN, execute it immediately (override). Returns a uniform result the
 * route handlers can pass straight back to the client.
 */
export async function queueApproval(params: {
  action: string; payload: any; actorId: string; actorPhone?: string | null;
}): Promise<QueueResult> {
  const { action, payload, actorId, actorPhone = null } = params;
  const role = await getAdminRole(actorId);

  // SUPER_ADMIN override — execute now, recorded as a single sign-off.
  if (isSuper(role)) {
    const approvals = [{ adminId: actorId, phone: actorPhone, role: 'SUPER_ADMIN', at: new Date().toISOString() }];
    const [row] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "AdminApproval" ("action","payload","makerId","makerPhone","requiredApprovals","approvals")
       VALUES ($1,$2,$3,$4,1,$5::jsonb) RETURNING *`,
      action, JSON.stringify({ ...payload, actorId }), actorId, actorPhone, JSON.stringify(approvals),
    );
    try {
      const result = await executeApprovalAction(row);
      await markExecuted(row.id, actorId, approvals, result);
      return { approvalId: row.id, executed: true, result, message: 'Executed (super-admin override).' };
    } catch (e: any) {
      await prisma.$executeRawUnsafe(`UPDATE "AdminApproval" SET "status"='FAILED', "result"=$1, "decidedAt"=NOW() WHERE "id"=$2`, e.message, row.id);
      throw e;
    }
  }

  // Otherwise queue for multi-step approval (3, capped to available approvers).
  const others   = await validApproverCount(actorId);
  const required = Math.max(1, Math.min(REQUIRED_APPROVALS, others));
  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "AdminApproval" ("action","payload","makerId","makerPhone","requiredApprovals")
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    action, JSON.stringify({ ...payload, actorId }), actorId, actorPhone, required,
  );
  return {
    approvalId: row.id, executed: false, requiredApprovals: required,
    message: `Queued — needs ${required} approval(s) from other admins.`,
  };
}
