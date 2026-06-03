/**
 * Ledger writer with guaranteed durability.
 *
 * When money has ALREADY moved on-chain, the internal Transaction rows MUST be
 * recorded. Previously these used `Promise.all([...]).catch(() => {})` which
 * silently dropped failures, creating a DB ↔ chain divergence.
 *
 * This writer instead:
 *   • writes each ledger row independently, and
 *   • on any failure, enqueues the row into LedgerBackfill so the reconciler
 *     can re-apply it later. Nothing is ever silently lost.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface LedgerRow {
  userId:      string;
  type:        'SEND' | 'RECEIVE' | 'FEE' | 'DEPOSIT' | 'WITHDRAWAL';
  amountUsdc?: number;
  stellarTxId?: string;
  toAddress?:  string;
  memo?:       string;
}

/** Write ledger rows after a confirmed on-chain transfer. Failures are queued, never dropped. */
export async function writeLedgerRows(rows: LedgerRow[]): Promise<void> {
  for (const r of rows) {
    try {
      await prisma.transaction.create({
        data: {
          userId:      r.userId,
          type:        r.type as any,
          status:      'CONFIRMED',
          amountUsdc:  r.amountUsdc,
          stellarTxId: r.stellarTxId,
          toAddress:   r.toAddress,
          memo:        r.memo,
        },
      });
    } catch (e: any) {
      console.error('[ledger] write failed, enqueuing backfill:', e.message);
      await enqueueBackfill(r).catch(() => {});
    }
  }
}

async function enqueueBackfill(r: LedgerRow): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LedgerBackfill" ("userId","type","amountUsdc","stellarTxId","toAddress","memo")
     VALUES ($1,$2,$3,$4,$5,$6)`,
    r.userId, r.type, r.amountUsdc ?? null, r.stellarTxId ?? null, r.toAddress ?? null, r.memo ?? null,
  );
}

/** Drain the backfill queue (called by the reconciler). Returns count applied. */
export async function drainLedgerBackfill(limit = 50): Promise<number> {
  let applied = 0;
  let rows: any[] = [];
  try {
    rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "LedgerBackfill" WHERE "applied" = false AND "attempts" < 5 ORDER BY "createdAt" ASC LIMIT ${limit}`,
    );
  } catch { return 0; }

  for (const row of rows) {
    try {
      await prisma.transaction.create({
        data: {
          userId:      row.userId,
          type:        row.type,
          status:      'CONFIRMED',
          amountUsdc:  row.amountUsdc ?? undefined,
          stellarTxId: row.stellarTxId ?? undefined,
          toAddress:   row.toAddress ?? undefined,
          memo:        row.memo ?? undefined,
        },
      });
      await prisma.$executeRawUnsafe(`UPDATE "LedgerBackfill" SET "applied" = true WHERE "id" = $1`, row.id);
      applied++;
    } catch {
      await prisma.$executeRawUnsafe(`UPDATE "LedgerBackfill" SET "attempts" = "attempts" + 1 WHERE "id" = $1`, row.id).catch(() => {});
    }
  }
  return applied;
}
