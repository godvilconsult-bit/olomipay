import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deriveKeypairFromPhone, getAccountInfo } from '../services/stellar';
import { isEncryptedKeyValid } from '../services/crypto';
import { runReconciler, getReconcilerStatus } from '../services/reconciler';

const router = Router();
const prisma = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// Minutes after which a still-PENDING money transaction is considered "stuck".
const STUCK_MINUTES = Number(process.env.SUPPORT_STUCK_MINUTES ?? 10);
const MONEY_TYPES: any = ['DEPOSIT', 'WITHDRAWAL', 'SEND', 'RECEIVE'];

async function requireAdmin(req: AuthRequest, res: any, next: any) {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true, phone: true } });
  if (!u?.isAdmin) return res.status(403).json(fail('Admin access required'));
  (req as any).adminPhone = u.phone;
  next();
}
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
// SUPPORT CONSOLE — stuck money, failures needing attention, live metrics
// ════════════════════════════════════════════════════════════════════════════

// Every money transaction still PENDING past the threshold = a customer waiting.
router.get('/support/stuck', requireAuth, requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000);
  const rows = await prisma.transaction.findMany({
    where:   { status: 'PENDING', type: { in: MONEY_TYPES }, createdAt: { lt: cutoff } },
    include: { user: { select: { id: true, phone: true, kycName: true } } },
    orderBy: { createdAt: 'asc' }, take: 200,
  });
  const data = rows.map(t => ({
    id: t.id, type: t.type, status: t.status,
    amountTzs: t.amountTzs, amountUsdc: t.amountUsdc,
    userId: t.userId, phone: t.user?.phone, name: t.user?.kycName,
    createdAt: t.createdAt, ageMin: Math.round((Date.now() - +t.createdAt) / 60000),
    memo: t.memo, errorMsg: t.errorMsg,
  }));
  return res.json(ok({ stuck: data, total: data.length, thresholdMin: STUCK_MINUTES }));
});

// Recently FAILED money transactions an agent should look at (e.g. "Float too low").
router.get('/support/attention', requireAuth, requireAdmin, async (_req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await prisma.transaction.findMany({
    where:   { status: 'FAILED', type: { in: MONEY_TYPES }, createdAt: { gt: since } },
    include: { user: { select: { id: true, phone: true, kycName: true } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  const data = rows.map(t => ({
    id: t.id, type: t.type, amountTzs: t.amountTzs, amountUsdc: t.amountUsdc,
    userId: t.userId, phone: t.user?.phone, name: t.user?.kycName,
    createdAt: t.createdAt, errorMsg: t.errorMsg,
    // money was likely taken if the deposit got past STK (has a provider/receipt id)
    likelyCharged: t.type === 'DEPOSIT' && !!t.mpesaTxId,
  }));
  return res.json(ok({ attention: data, total: data.length }));
});

// Counters for the support dashboard header.
router.get('/support/metrics', requireAuth, requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000);
  const since24 = new Date(Date.now() - 24 * 3600 * 1000);
  const [stuck, failed24, kyc, approvals] = await Promise.all([
    prisma.transaction.count({ where: { status: 'PENDING', type: { in: MONEY_TYPES }, createdAt: { lt: cutoff } } }),
    prisma.transaction.count({ where: { status: 'FAILED',  type: { in: MONEY_TYPES }, createdAt: { gt: since24 } } }),
    prisma.user.count({ where: { kycStatus: { in: ['SUBMITTED', 'PENDING'] } } }),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS c FROM "AdminApproval" WHERE "status"='PENDING'`).then(r => r[0]?.c ?? 0).catch(() => 0),
  ]);
  return res.json(ok({ stuck, failed24, pendingKyc: kyc, openApprovals: approvals }));
});

// Auto-reconciler — status, recent actions, and a manual "run now" trigger.
router.get('/support/reconciler', requireAuth, requireAdmin, async (_req, res) => {
  const logs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "AutoReconcileLog" ORDER BY "createdAt" DESC LIMIT 50`,
  ).catch(() => []);
  return res.json(ok({ status: getReconcilerStatus(), logs }));
});

router.post('/support/reconciler/run', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const summary = await runReconciler();
  await audit(req, 'run_reconciler', undefined, 'system', summary);
  return res.json(ok({ message: 'Reconciler ran', summary }));
});

// ════════════════════════════════════════════════════════════════════════════
// AUTOMATED DIAGNOSIS — one call returns a customer's problems + recommended fix
// ════════════════════════════════════════════════════════════════════════════
router.get('/users/:id/diagnose', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json(fail('User not found'));

  const problems: Array<{ code: string; severity: 'high' | 'medium' | 'low'; message: string; action: string }> = [];

  // 1) Wallet key integrity (can the user even sign?)
  const keyValid = isEncryptedKeyValid((user as any).stellarSecret);
  if (!keyValid) problems.push({
    code: 'WALLET_KEY_CORRUPT', severity: 'high',
    message: 'Stored encrypted wallet key is invalid — the user cannot sign transactions.',
    action: 'Reset PIN (re-derives the key from the phone; same address, funds preserved).',
  });

  // 2) Deterministic / recoverable?
  const derived = deriveKeypairFromPhone(user.phone);
  const deterministic = derived.publicKey === user.stellarPubKey;
  if (!deterministic) problems.push({
    code: 'WALLET_NOT_DETERMINISTIC', severity: 'medium',
    message: 'Wallet address does not match the phone-derived address — not auto-recoverable.',
    action: 'Migrate/reprovision to the deterministic address (guard against balance loss).',
  });

  // 3) On-chain activation & trustline (chain truth)
  const acct = await getAccountInfo(user.stellarPubKey).catch(() => null);
  const funded = acct?.funded ?? false;
  const hasUsdcTrustline = (acct?.balances ?? []).some(b => b.asset === 'USDC');
  if (!funded) problems.push({
    code: 'ACCOUNT_NOT_FUNDED', severity: 'high',
    message: 'Stellar account is not funded (no XLM) — balance shows 0 and sends fail.',
    action: 'Activate wallet (fund minimum XLM + add USDC trustline).',
  });
  else if (!hasUsdcTrustline) problems.push({
    code: 'NO_USDC_TRUSTLINE', severity: 'high',
    message: 'Account funded but has no USDC trustline — cannot hold/receive USDC.',
    action: 'Activate wallet to add the USDC trustline.',
  });

  // 4) Frozen?
  if ((user as any).isFrozen) problems.push({
    code: 'ACCOUNT_FROZEN', severity: 'medium',
    message: 'Account is frozen — all activity is blocked.',
    action: 'Review the freeze reason in the audit log; unfreeze if resolved.',
  });

  // 5) Stuck money transactions for this user
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000);
  const stuck = await prisma.transaction.findMany({
    where: { userId: user.id, status: 'PENDING', type: { in: MONEY_TYPES }, createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' }, take: 20,
  });
  for (const t of stuck) problems.push({
    code: 'STUCK_TRANSACTION', severity: 'high',
    message: `${t.type} of ${t.amountUsdc ?? ''} USDC / ${t.amountTzs ?? ''} TZS stuck PENDING since ${new Date(t.createdAt).toISOString()}.`,
    action: t.type === 'DEPOSIT'
      ? 'If the customer was charged, propose a manual credit (maker-checker); else mark FAILED.'
      : 'Check the payout provider; refund or confirm the transaction.',
  });

  return res.json(ok({
    user: { id: user.id, phone: user.phone, name: user.kycName, kycStatus: user.kycStatus, isAdmin: user.isAdmin },
    wallet: {
      address: user.stellarPubKey, keyValid, deterministic, funded, hasUsdcTrustline,
      xlm: acct?.xlm ?? '0', usdc: acct?.usdc ?? '0',
    },
    problems,
    healthy: problems.length === 0,
  }));
});

// ════════════════════════════════════════════════════════════════════════════
// CASE NOTES — append-only support context per customer
// ════════════════════════════════════════════════════════════════════════════
router.get('/users/:id/notes', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SupportNote" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 100`, req.params.id,
  ).catch(() => []);
  return res.json(ok({ notes: rows }));
});

router.post('/users/:id/notes', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const body = String(req.body?.note ?? '').trim().slice(0, 2000);
  if (!body) return res.status(400).json(fail('Note text is required'));
  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "SupportNote" ("userId","authorId","authorPhone","note")
     VALUES ($1,$2,$3,$4) RETURNING *`,
    req.params.id, req.userId!, (req as any).adminPhone ?? null, body,
  );
  await audit(req, 'add_support_note', req.params.id, 'user');
  return res.json(ok({ note: row }));
});

// ════════════════════════════════════════════════════════════════════════════
// SUPPORT TICKETS — the in-app customer inbox lands here
// ════════════════════════════════════════════════════════════════════════════
router.get('/support/tickets', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const status = String(req.query.status ?? '');
  const where  = ['OPEN', 'PENDING', 'RESOLVED'].includes(status) ? `WHERE t."status"='${status}'` : '';
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT t.*, u."phone", u."kycName",
            (SELECT COUNT(*)::int FROM "SupportTicketMessage" m WHERE m."ticketId"=t."id") AS "messageCount"
     FROM "SupportTicket" t JOIN "User" u ON u."id"=t."userId"
     ${where} ORDER BY t."unreadForAdmin" DESC, t."lastMessageAt" DESC LIMIT 200`,
  ).catch(() => []);
  const [{ open }] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS open FROM "SupportTicket" WHERE "status"!='RESOLVED'`).catch(() => [{ open: 0 }]);
  return res.json(ok({ tickets: rows, openCount: open }));
});

router.get('/support/tickets/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const [ticket] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT t.*, u."phone", u."kycName", u."id" AS "customerId"
     FROM "SupportTicket" t JOIN "User" u ON u."id"=t."userId" WHERE t."id"=$1`, req.params.id,
  );
  if (!ticket) return res.status(404).json(fail('Ticket not found'));
  const messages = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","authorType","body","createdAt" FROM "SupportTicketMessage" WHERE "ticketId"=$1 ORDER BY "createdAt" ASC`, ticket.id,
  );
  await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "unreadForAdmin"=false WHERE "id"=$1`, ticket.id).catch(() => {});
  return res.json(ok({ ticket, messages }));
});

router.post('/support/tickets/:id/reply', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const body = String(req.body?.body ?? '').trim().slice(0, 4000);
  if (!body) return res.status(400).json(fail('Reply is empty'));
  const [ticket] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "id"=$1`, req.params.id);
  if (!ticket) return res.status(404).json(fail('Ticket not found'));

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupportTicketMessage" ("ticketId","authorId","authorType","body") VALUES ($1,$2,'ADMIN',$3)`,
    ticket.id, req.userId!, body,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "SupportTicket" SET "lastMessageAt"=NOW(),"updatedAt"=NOW(),"unreadForUser"=true,"unreadForAdmin"=false,"status"='PENDING' WHERE "id"=$1`, ticket.id,
  );
  await audit(req, 'reply_ticket', ticket.id, 'ticket');
  return res.json(ok({ message: 'Reply sent' }));
});

router.post('/support/tickets/:id/status', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const status = String(req.body?.status ?? '');
  if (!['OPEN', 'PENDING', 'RESOLVED'].includes(status)) return res.status(400).json(fail('Invalid status'));
  await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "status"=$1,"updatedAt"=NOW() WHERE "id"=$2`, status, req.params.id);
  await audit(req, 'set_ticket_status', req.params.id, 'ticket', { status });
  return res.json(ok({ message: `Ticket ${status}` }));
});

// ════════════════════════════════════════════════════════════════════════════
// REFUND — record a reversing decision on a failed/stuck money transaction
// (does not move chain funds itself; for momo/bank payout reversals + bookkeeping)
// ════════════════════════════════════════════════════════════════════════════
router.post('/transactions/:id/refund', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason ?? '').slice(0, 300);
  if (!reason) return res.status(400).json(fail('A reason is required'));
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx) return res.status(404).json(fail('Transaction not found'));
  if (!['PENDING', 'FAILED'].includes(tx.status)) return res.status(400).json(fail('Only PENDING/FAILED transactions can be refunded.'));

  await prisma.transaction.update({
    where: { id: tx.id },
    data:  { status: 'FAILED', errorMsg: `Refunded by admin: ${reason}` },
  });
  // The refund itself is recorded in the immutable audit log (with amount + reason).
  await audit(req, 'refund_transaction', tx.id, 'transaction', {
    reason, type: tx.type, amountUsdc: tx.amountUsdc, amountTzs: tx.amountTzs,
  });
  return res.json(ok({ message: 'Refund recorded. Process the off-chain payout reversal in your provider dashboard.' }));
});

export { router as adminCasesRouter };
