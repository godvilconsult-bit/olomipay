/**
 * Tiered KYC — compliance limits that scale with how much a user has verified.
 *
 * This is the COMPLIANCE gate (fail-CLOSED: over the limit → blocked), distinct
 * from riskGate.ts which is the fraud screen (fail-OPEN). Together: riskGate asks
 * "does this look like fraud?", kycTiers asks "is this user allowed to move this
 * much given who they've proven they are?".
 *
 * Levels:
 *   0  New        — phone only. Can hold + receive + small sends.
 *   1  Basic      — full name provided. Everyday payments + small remittance.
 *   2  Verified   — government ID approved. Full personal limits, cross-border,
 *                   cash agents, bank withdrawal.
 *   3  Enhanced   — admin-granted (business / high-volume). Highest limits.
 *
 * Limits are in USD and enforced against rolling 24h + 30d OUTGOING volume.
 */
import { prisma } from '../lib/prisma';

export type Feature = 'send' | 'remittance' | 'bank' | 'agent_cashout' | 'become_agent';

export interface Tier {
  level:        number;
  label:        string;
  perTxUsdc:    number;
  dailyUsdc:    number;
  monthlyUsdc:  number;
  features:     Feature[];
  upgradeHint:  string;
}

export const TIERS: Record<number, Tier> = {
  0: {
    level: 0, label: 'New',
    perTxUsdc: 50, dailyUsdc: 100, monthlyUsdc: 300,
    features: ['send'],
    upgradeHint: 'Add your full name to unlock higher limits and sending money abroad.',
  },
  1: {
    level: 1, label: 'Basic',
    perTxUsdc: 300, dailyUsdc: 1_000, monthlyUsdc: 5_000,
    features: ['send', 'remittance'],
    upgradeHint: 'Verify your ID to raise limits and use cash agents & bank withdrawals.',
  },
  2: {
    level: 2, label: 'Verified',
    perTxUsdc: 3_000, dailyUsdc: 10_000, monthlyUsdc: 50_000,
    features: ['send', 'remittance', 'bank', 'agent_cashout', 'become_agent'],
    upgradeHint: 'Contact support for a business (Enhanced) account with higher limits.',
  },
  3: {
    level: 3, label: 'Enhanced',
    perTxUsdc: 25_000, dailyUsdc: 100_000, monthlyUsdc: 1_000_000_000,
    features: ['send', 'remittance', 'bank', 'agent_cashout', 'become_agent'],
    upgradeHint: '',
  },
};

export function tierFor(level: number): Tier {
  return TIERS[Math.max(0, Math.min(3, level ?? 0))];
}

// Outgoing transaction types that count toward a user's spending limits.
const OUTGOING_TYPES = ['SEND', 'WITHDRAWAL', 'BANK_WITHDRAWAL', 'REMITTANCE', 'BILL_PAYMENT'];

/** Sum a user's outgoing USDC since a given time (CONFIRMED + PENDING, so
 *  in-flight transfers can't be used to slip past the cap). */
async function outgoingSince(userId: string, since: Date): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    where: {
      userId, type: { in: OUTGOING_TYPES as any },
      status: { in: ['CONFIRMED', 'PENDING'] as any },
      createdAt: { gte: since },
    },
    _sum: { amountUsdc: true },
  }).catch(() => ({ _sum: { amountUsdc: 0 } } as any));
  return agg._sum.amountUsdc ?? 0;
}

export interface LimitCheck {
  ok:      boolean;
  error?:  string;
  tier:    Tier;
  usedToday:   number;
  usedMonth:   number;
}

/**
 * Enforce tier + limits for an outgoing action. Fail-CLOSED on a real breach,
 * but fail-OPEN on an internal error (a limits-lookup bug must not freeze a
 * verified user's legitimate payment — the hard riskGate cap still applies).
 */
export async function checkTierLimit(
  userId: string,
  amountUsdc: number,
  feature: Feature,
): Promise<LimitCheck> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }, select: { kycLevel: true },
    });
    const tier = tierFor(user?.kycLevel ?? 0);

    const usedToday = await outgoingSince(userId, new Date(Date.now() - 86_400_000));
    const usedMonth = await outgoingSince(userId, new Date(Date.now() - 30 * 86_400_000));
    const base = { tier, usedToday, usedMonth };

    if (!tier.features.includes(feature)) {
      return { ok: false, ...base,
        error: `Your account level (${tier.label}) can't do this yet. ${tier.upgradeHint}` };
    }
    if (amountUsdc > tier.perTxUsdc) {
      return { ok: false, ...base,
        error: `Amount exceeds your per-transaction limit of $${tier.perTxUsdc.toLocaleString()}. ${tier.upgradeHint}` };
    }
    if (usedToday + amountUsdc > tier.dailyUsdc) {
      const left = Math.max(0, tier.dailyUsdc - usedToday);
      return { ok: false, ...base,
        error: `This exceeds your daily limit. Remaining today: $${left.toFixed(2)}. ${tier.upgradeHint}` };
    }
    if (usedMonth + amountUsdc > tier.monthlyUsdc) {
      const left = Math.max(0, tier.monthlyUsdc - usedMonth);
      return { ok: false, ...base,
        error: `This exceeds your monthly limit. Remaining this month: $${left.toFixed(2)}. ${tier.upgradeHint}` };
    }
    return { ok: true, ...base };
  } catch (e: any) {
    console.warn('[kycTiers] check error (failing open):', e.message);
    return { ok: true, tier: tierFor(0), usedToday: 0, usedMonth: 0 };
  }
}
