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

const AGENT_LOW_FLOAT_USDC = 20;   // warn agents below this cash-out float
const AGENT_VELOCITY_COUNT = 15;   // completed cash txns in 20 min from one agent
const AGENT_CANCEL_RATIO   = 0.5;  // share of recent attempts that expired/cancelled

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

// Agent network health: low cash-out float, transaction velocity, and a high
// share of failed/abandoned attempts — all early signals of trouble or fraud.
async function checkAgentHealth(): Promise<void> {
  try {
    const { notify } = await import('./notifications');
    const since = new Date(Date.now() - 20 * 60 * 1000);

    const agents = await prisma.agent.findMany({ where: { status: 'active' }, take: 100 }).catch(() => [] as any[]);
    if (!agents.length) return;

    // ── Velocity + abandonment per agent (DB-only, cheap) ──────────────────────
    for (const a of agents) {
      const recent = await prisma.agentTransaction.findMany({
        where: { agentId: a.id, createdAt: { gte: since } },
        select: { status: true },
      }).catch(() => [] as any[]);
      if (!recent.length) continue;

      const completed = recent.filter(t => t.status === 'COMPLETED').length;
      const dead      = recent.filter(t => t.status === 'EXPIRED' || t.status === 'CANCELLED').length;

      if (completed >= AGENT_VELOCITY_COUNT) {
        await sendOpsAlert({
          key: `agent_velocity_${a.id}`, severity: 'warn', title: 'Agent high velocity',
          message: `Agent ${a.code} (${a.businessName}) completed ${completed} cash transactions in 20 min — review for unusual activity.`,
        });
      }
      if (recent.length >= 6 && dead / recent.length >= AGENT_CANCEL_RATIO) {
        await sendOpsAlert({
          key: `agent_abandon_${a.id}`, severity: 'warn', title: 'Agent failed-attempt spike',
          message: `Agent ${a.code} (${a.businessName}): ${dead}/${recent.length} recent cash-outs expired/cancelled — possible scam attempts or operational issue.`,
        });
      }
    }

    // ── Low float (limit Stellar calls to a handful of active agents) ──────────
    const userIds = agents.map(a => a.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }, select: { id: true, stellarPubKey: true },
    }).catch(() => [] as any[]);
    const pubByUser = new Map<string, string>(users.map((u: any) => [u.id, u.stellarPubKey] as [string, string]));

    for (const a of agents.slice(0, 25)) {
      const pub = pubByUser.get(a.userId);
      if (!pub) continue;
      const bal = await getBalance(pub).catch(() => null);
      if (!bal) continue;
      const float = parseFloat((bal as any).usdc ?? '0');
      if (float < AGENT_LOW_FLOAT_USDC) {
        await notify.lowBalance(a.userId, `$${float.toFixed(2)}`).catch(() => {});
        await sendOpsAlert({
          key: `agent_low_float_${a.id}`, severity: 'warn', title: 'Agent float low',
          message: `Agent ${a.code} (${a.businessName}) float is $${float.toFixed(2)} — they may be unable to serve cash-ins.`,
        });
      }
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

// Expire pending agent cash-out codes past their TTL so stale codes can't be used.
async function expireStaleCashouts(): Promise<void> {
  try {
    await prisma.agentTransaction.updateMany({
      where: { type: 'CASH_OUT', status: 'PENDING', expiresAt: { lt: new Date() } },
      data:  { status: 'EXPIRED', code: null },
    });
  } catch { /* skip cycle */ }
}

export function startOpsMonitor(): void {
  const RUN_EVERY = 20 * 60 * 1000; // every 20 minutes
  const run = () => { checkGasTreasury(); checkReconciliation(); checkSecurity(); checkAutoSaveReminders(); expireStaleCashouts(); checkAgentHealth(); };
  setTimeout(run, 60_000);          // first run a minute after boot
  setInterval(run, RUN_EVERY);
  console.log('[ops-monitor] started — gas + reconciliation + security watch every 20m');
}
