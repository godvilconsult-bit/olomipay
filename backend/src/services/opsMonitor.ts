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

export function startOpsMonitor(): void {
  const RUN_EVERY = 20 * 60 * 1000; // every 20 minutes
  const run = () => { checkGasTreasury(); checkReconciliation(); };
  setTimeout(run, 60_000);          // first run a minute after boot
  setInterval(run, RUN_EVERY);
  console.log('[ops-monitor] started — gas + reconciliation watch every 20m');
}
