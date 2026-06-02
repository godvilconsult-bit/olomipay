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

const prisma = new PrismaClient();

const DEPOSIT_TIMEOUT_MIN = Number(process.env.RECONCILE_DEPOSIT_TIMEOUT_MIN ?? 30);
const INTERVAL_MS         = Number(process.env.RECONCILE_INTERVAL_MS ?? 120_000); // every 2 min

async function log(action: string, txId: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AutoReconcileLog" ("action","txId","detail") VALUES ($1,$2,$3)`,
      action, txId, detail ? JSON.stringify(detail).slice(0, 1000) : null,
    );
  } catch {}
}

let lastSummary = { ranAt: null as string | null, expiredDeposits: 0, flaggedWithdrawals: 0 };
export function getReconcilerStatus() { return { ...lastSummary, depositTimeoutMin: DEPOSIT_TIMEOUT_MIN, intervalMs: INTERVAL_MS }; }

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

  lastSummary = { ranAt: new Date().toISOString(), expiredDeposits, flaggedWithdrawals };
  if (expiredDeposits > 0) console.log(`[reconciler] expired ${expiredDeposits} abandoned deposits; ${flaggedWithdrawals} withdrawals need review`);
  return lastSummary;
}

export function startReconciler(): void {
  console.log(`[reconciler] starting — every ${Math.round(INTERVAL_MS / 1000)}s, deposit timeout ${DEPOSIT_TIMEOUT_MIN}min`);
  setInterval(() => { runReconciler().catch(() => {}); }, INTERVAL_MS);
}
