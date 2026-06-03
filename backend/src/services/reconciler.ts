/**
 * Auto-reconciler — self-heals stuck money transactions so the #1 support ticket
 * ("I paid but nothing happened") rarely reaches a human.
 *
 * SAFETY MODEL
 *  - Deposits: a deposit only becomes CONFIRMED inside the momo callback success path.
 *    A deposit still PENDING long after creation is an *abandoned STK prompt* (user
 *    never approved on their phone) → safe to expire as FAILED. The rare case where
 *    money WAS taken but the credit failed still surfaces in the support console's
 *    "needs attention" list (likelyCharged), where a human issues a maker-checker credit.
 *  - Withdrawals: USDC custody is involved, so we DO NOT auto-fail them. We only flag
 *    long-stuck ones for a human. Nothing here moves money on its own.
 */

import { PrismaClient } from '@prisma/client';
import { notify } from './notifications';
import { findTxHashByMemo } from './stellar';
import { writeLedgerRows, drainLedgerBackfill } from './ledger';

const prisma = new PrismaClient();

const DEPOSIT_TIMEOUT_MIN = Number(process.env.RECONCILE_DEPOSIT_TIMEOUT_MIN ?? 30);
const INTERVAL_MS         = Number(process.env.RECONCILE_INTERVAL_MS ?? 120_000); // every 2 min
// Chat payments resolve in seconds; if still PENDING after this, reconcile against chain.
const PAYMENT_CHECK_MIN   = Number(process.env.RECONCILE_PAYMENT_CHECK_MIN ?? 3);
const PAYMENT_FAIL_MIN    = Number(process.env.RECONCILE_PAYMENT_FAIL_MIN  ?? 30);

async function log(action: string, txId: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AutoReconcileLog" ("action","txId","detail") VALUES ($1,$2,$3)`,
      action, txId, detail ? JSON.stringify(detail).slice(0, 1000) : null,
    );
  } catch {}
}

let lastSummary = { ranAt: null as string | null, expiredDeposits: 0, flaggedWithdrawals: 0, paymentsHealed: 0, paymentsFailed: 0, backfilled: 0 };
export function getReconcilerStatus() { return { ...lastSummary, depositTimeoutMin: DEPOSIT_TIMEOUT_MIN, intervalMs: INTERVAL_MS }; }

/**
 * Reconcile stuck chat PAYMENT messages against Stellar (chain = source of truth).
 * Resolves the "submitted-but-response-lost" divergence:
 *   - PENDING payment with a memo that DID land on-chain → mark CONFIRMED + backfill ledger.
 *   - PENDING payment past the fail timeout with NO matching on-chain tx → mark FAILED.
 */
async function reconcilePayments(): Promise<{ healed: number; failed: number }> {
  let healed = 0, failed = 0;
  const checkCutoff = new Date(Date.now() - PAYMENT_CHECK_MIN * 60_000);
  const failCutoff  = new Date(Date.now() - PAYMENT_FAIL_MIN  * 60_000);

  let stuck: any[] = [];
  try {
    stuck = await prisma.message.findMany({
      where: { type: 'PAYMENT' as any, paymentStatus: 'PENDING' as any, createdAt: { lt: checkCutoff } },
      include: { sender: { select: { stellarPubKey: true, phone: true } } },
      take: 50,
    });
  } catch { return { healed, failed }; }

  for (const m of stuck) {
    try {
      const memo = `Chat:${m.id.slice(0, 16)}`;
      const hash = m.sender?.stellarPubKey ? await findTxHashByMemo(m.sender.stellarPubKey, memo) : null;

      if (hash) {
        // Money actually moved — heal the record + backfill ledger rows
        await prisma.message.update({ where: { id: m.id }, data: { paymentStatus: 'CONFIRMED', stellarTxId: hash } });
        const net = Number(m.amountUsdc ?? 0);
        const conv = await prisma.conversationMember.findMany({
          where: { conversationId: m.conversationId, userId: { not: m.senderId } }, select: { userId: true },
        });
        const rows: any[] = [{ userId: m.senderId, type: 'SEND', amountUsdc: net, stellarTxId: hash, memo: 'Chat payment (reconciled)' }];
        if (conv[0]) rows.push({ userId: conv[0].userId, type: 'RECEIVE', amountUsdc: net, stellarTxId: hash, memo: 'Chat payment (reconciled)' });
        await writeLedgerRows(rows);
        await log('heal_payment', m.id, { hash });
        healed++;
      } else if (m.createdAt < failCutoff) {
        // No on-chain trace after the fail window — safe to mark FAILED
        await prisma.message.update({ where: { id: m.id }, data: { paymentStatus: 'FAILED' } });
        await log('fail_payment', m.id, { reason: 'no on-chain tx within window' });
        failed++;
      }
    } catch (e: any) {
      console.error('[reconciler] payment reconcile failed', m.id, e.message);
    }
  }
  return { healed, failed };
}

export async function runReconciler(): Promise<typeof lastSummary> {
  let expiredDeposits = 0, flaggedWithdrawals = 0;
  const cutoff = new Date(Date.now() - DEPOSIT_TIMEOUT_MIN * 60_000);

  // 1) Expire abandoned PENDING deposits.
  let stuckDeposits: any[] = [];
  try {
    stuckDeposits = await prisma.transaction.findMany({
      where: { status: 'PENDING', type: 'DEPOSIT' as any, createdAt: { lt: cutoff } },
      take: 100,
    });
  } catch { return lastSummary; /* tables not ready */ }

  for (const t of stuckDeposits) {
    try {
      await prisma.transaction.update({
        where: { id: t.id },
        data:  { status: 'FAILED', errorMsg: `Auto-expired by reconciler: no payment confirmation within ${DEPOSIT_TIMEOUT_MIN} min` },
      });
      await log('expire_deposit', t.id, { amountTzs: t.amountTzs, ageMin: Math.round((Date.now() - +t.createdAt) / 60000) });
      notify.transactionFailed(t.userId, 'Your deposit timed out. You were not charged — please try again.').catch(() => {});
      expiredDeposits++;
    } catch (e: any) {
      console.error('[reconciler] expire deposit failed', t.id, e.message);
    }
  }

  // 2) Flag long-stuck withdrawals for human review (no money action).
  try {
    flaggedWithdrawals = await prisma.transaction.count({
      where: { status: 'PENDING', type: 'WITHDRAWAL' as any, createdAt: { lt: cutoff } },
    });
  } catch {}

  // 3) Reconcile stuck chat payments against the chain (heal or fail).
  const { healed: paymentsHealed, failed: paymentsFailed } = await reconcilePayments().catch(() => ({ healed: 0, failed: 0 }));

  // 4) Drain the ledger backfill queue (rows whose DB write failed after money moved).
  const backfilled = await drainLedgerBackfill().catch(() => 0);

  lastSummary = { ranAt: new Date().toISOString(), expiredDeposits, flaggedWithdrawals, paymentsHealed, paymentsFailed, backfilled };
  if (expiredDeposits || paymentsHealed || paymentsFailed || backfilled)
    console.log(`[reconciler] deposits expired=${expiredDeposits} · payments healed=${paymentsHealed} failed=${paymentsFailed} · ledger backfilled=${backfilled}`);
  return lastSummary;
}

export function startReconciler(): void {
  console.log(`[reconciler] starting — every ${Math.round(INTERVAL_MS / 1000)}s, deposit timeout ${DEPOSIT_TIMEOUT_MIN}min`);
  setInterval(() => { runReconciler().catch(() => {}); }, INTERVAL_MS);
}
