/**
 * Ops monitor — periodic self-checks that raise alerts when something is wrong,
 * so you don't have to watch the dashboard. Currently watches:
 *   • Gas treasury running low (can't sponsor accounts / pay gas).
 *   • Reconciliation shortfall (platform USDC < what we owe users — critical).
 *
 * Alerts go through services/alerts.ts (webhook + super-admin push), throttled.
 */
import { prisma } from '../lib/prisma';
import { sendOpsAlert } from './alerts';
import { getTreasuryStatus, getBalance } from './stellar';

async function checkGasTreasury(): Promise<void> {
  try {
    const t = await getTreasuryStatus();
    if (!t.healthy) {
      await sendOpsAlert({
        key: 'gas_low', severity: 'critical', title: 'Gas treasury low',
        message: `Gas wallet has ${t.xlm.toFixed(2)} XLM (~${t.estAccountsLeft} accounts left). Top it up.`,
      });
    }
  } catch { /* skip this cycle */ }
}

async function checkReconciliation(): Promise<void> {
  try {
    const platformPub = process.env.STELLAR_PUBLIC_KEY ?? '';
    if (!platformPub) return;
    const bal = await getBalance(platformPub).catch(() => ({ usdc: '0' } as any));
    const agg = await prisma.transaction.groupBy({
      by: ['type'], where: { status: 'CONFIRMED' }, _sum: { amountUsdc: true },
    });
    const sum = (t: string) => agg.find(a => a.type === t)?._sum.amountUsdc ?? 0;
    const liabilities  = Math.max(0, (sum('DEPOSIT') + sum('RECEIVE')) - (sum('WITHDRAWAL') + sum('SEND') + sum('FEE')));
    const platformUsdc = parseFloat((bal as any).usdc);
    if (platformUsdc + 0.0001 < liabilities) {
      await sendOpsAlert({
        key: 'reconciliation_shortfall', severity: 'critical', title: 'Reconciliation shortfall',
        message: `Platform USDC $${platformUsdc.toFixed(2)} < user liabilities $${liabilities.toFixed(2)}. Pause crediting and investigate.`,
      });
    }
  } catch { /* skip this cycle */ }
}

async function checkSecurity(): Promise<void> {
  try {
    const since = new Date(Date.now() - 20 * 60 * 1000); // last 20 min
    // Mass lockouts (users or staff)
    const locks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS c FROM "SecurityEvent" WHERE "type" IN ('account_locked','staff_account_locked') AND "createdAt" >= $1`, since,
    ).catch(() => [{ c: 0 }]);
    const lockCount = locks[0]?.c ?? 0;
    if (lockCount >= 3) {
      await sendOpsAlert({
        key: 'mass_lockouts', severity: 'critical', title: 'Multiple account lockouts',
        message: `${lockCount} accounts locked in the last 20 minutes — possible credential-stuffing attack.`,
      });
    }
    // Suspicious IPs hammering logins
    const ips = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "ip", COUNT(*)::int AS c FROM "SecurityEvent" WHERE "type" IN ('failed_login','staff_failed_login') AND "createdAt" >= $1 AND "ip" IS NOT NULL GROUP BY "ip" HAVING COUNT(*) >= 15 ORDER BY c DESC LIMIT 5`, since,
    ).catch(() => []);
    if (ips.length) {
      await sendOpsAlert({
        key: 'suspicious_ip', severity: 'critical', title: 'Suspicious login activity',
        message: `Heavy failed logins from: ${ips.map(x => `${x.ip} (${x.c})`).join(', ')}. Possible attack.`,
      });
    }
  } catch { /* skip cycle */ }
}

// Nudge users to fund their savings goals when an auto-save schedule is due.
// (We never auto-debit without the user's PIN — we remind, they confirm.)
async function checkAutoSaveReminders(): Promise<void> {
  try {
    const { notify } = await import('./notifications');
    const now = new Date();
    const due = await prisma.savingsGoal.findMany({
      where: {
        status: 'active', autoSaveFreq: { not: 'none' },
        autoSaveAmount: { gt: 0 }, nextAutoSaveAt: { lte: now },
      },
      take: 200,
    }).catch(() => [] as any[]);

    for (const g of due) {
      await notify.autoSaveReminder(g.userId, g.name, `$${g.autoSaveAmount.toFixed(2)}`).catch(() => {});
      const days = g.autoSaveFreq === 'weekly' ? 7 : 30;
      await prisma.savingsGoal.update({
        where: { id: g.id },
        data:  { nextAutoSaveAt: new Date(now.getTime() + days * 86_400_000) },
      }).catch(() => {});
    }
  } catch { /* skip cycle */ }
}

export function startOpsMonitor(): void {
  const RUN_EVERY = 20 * 60 * 1000; // every 20 minutes
  const run = () => { checkGasTreasury(); checkReconciliation(); checkSecurity(); checkAutoSaveReminders(); };
  setTimeout(run, 60_000);          // first run a minute after boot
  setInterval(run, RUN_EVERY);
  console.log('[ops-monitor] started — gas + reconciliation + security watch every 20m');
}
