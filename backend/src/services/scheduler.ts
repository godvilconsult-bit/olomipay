/**
 * Scheduled payments cron job.
 * Runs every minute, executes due payments, updates next_run_at.
 */

import { PrismaClient } from '@prisma/client';
import { contractTransfer } from './stellar';
import { decryptSecret } from './crypto';
import { notify } from './notifications';
import * as StellarSdk from '@stellar/stellar-sdk';

const prisma = new PrismaClient();

function nextRunDate(frequency: string, from: Date): Date {
  const d = new Date(from);
  switch (frequency) {
    case 'DAILY':     d.setDate(d.getDate() + 1);    break;
    case 'WEEKLY':    d.setDate(d.getDate() + 7);    break;
    case 'BIWEEKLY':  d.setDate(d.getDate() + 14);   break;
    case 'MONTHLY':   d.setMonth(d.getMonth() + 1);  break;
  }
  return d;
}

export async function runScheduledPayments(): Promise<void> {
  const now = new Date();

  // Guard: skip gracefully if table doesn't exist yet (pre-migration)
  try {
    await prisma.$queryRaw`SELECT 1 FROM "ScheduledPayment" LIMIT 1`;
  } catch {
    return; // Table not migrated yet — silent skip
  }

  const duePmts = await prisma.scheduledPayment.findMany({
    where: {
      isActive:  true,
      nextRunAt: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: { user: true },
    take: 50, // Process max 50 at a time
  });

  if (duePmts.length === 0) return;
  console.log(`[scheduler] Processing ${duePmts.length} scheduled payments`);

  for (const pmt of duePmts) {
    try {
      const hash = await contractTransfer({
        fromEncryptedSecret: pmt.user.stellarSecret,
        fromPin:             '', // Scheduled payments use a stored PIN hash — in prod use HSM
        fromPhone:           pmt.user.phone,
        fromPublicKey:       pmt.user.stellarPubKey,
        toPublicKey:         pmt.toAddress,
        amountUsdc:          pmt.amount,
        memo:                pmt.memo ?? 'Scheduled payment',
      });

      const nextRun = nextRunDate(pmt.frequency, now);
      const shouldDeactivate = pmt.endDate && nextRun > pmt.endDate;

      await prisma.scheduledPayment.update({
        where: { id: pmt.id },
        data: {
          nextRunAt:      nextRun,
          lastRunAt:      now,
          executionCount: { increment: 1 },
          isActive:       !shouldDeactivate,
        },
      });

      await prisma.transaction.create({ data: {
        userId: pmt.userId, type: 'SEND', status: 'CONFIRMED',
        amountUsdc: pmt.amount, stellarTxId: hash,
        toAddress: pmt.toAddress, memo: pmt.memo ?? 'Scheduled payment',
      }});

      const toLabel = pmt.toName ?? pmt.toPhone ?? pmt.toAddress.slice(0, 8) + '...';
      await notify.scheduledPaymentSent(pmt.userId, `$${pmt.amount} USDC`, toLabel);

    } catch (e: any) {
      console.error(`[scheduler] Payment ${pmt.id} failed:`, e.message);
      await notify.transactionFailed(pmt.userId, e.message ?? 'Scheduled payment failed');
      // Don't deactivate on failure — retry next cycle
      await prisma.scheduledPayment.update({
        where: { id: pmt.id },
        data:  { nextRunAt: new Date(now.getTime() + 5 * 60_000) }, // retry in 5 min
      });
    }
  }
}

export function startScheduler(): void {
  console.log('[scheduler] Starting — checking every 60 seconds');
  setInterval(async () => {
    try {
      await runScheduledPayments();
    } catch (e: any) {
      console.error('[scheduler] Error:', e.message);
    }
  }, 60_000);
}
