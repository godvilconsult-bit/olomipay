/**
 * riskGate — lightweight, FAIL-OPEN pre-flight fraud screen.
 *
 * Design principles (so it can NEVER break legitimate payments):
 *   • Any internal error → ALLOW (fail-open). A screening bug must not
 *     stop the money engine.
 *   • Only BLOCK on hard, unambiguous signals (frozen account, absolute
 *     hard cap). Everything suspicious-but-plausible → REVIEW (still allowed
 *     through, just flagged + logged for the async agent).
 *   • Uses ONLY the existing Postgres tables — no Redis/Couchbase required.
 *     Velocity counts run off the indexed Transaction table.
 *
 * Tiering (the sub-50ms staged model):
 *   Tier 0  in-memory rules   — amount caps, frozen flag        (~1ms)
 *   Tier 1  DB feature lookup — velocity, new-recipient, daily  (~10-20ms)
 *   Tier 2  async agent       — invoked OUT OF BAND for REVIEW   (not in path)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Absolute hard cap (USDC) — above this a single tx is blocked outright.
// Set well above normal limits so it never catches ordinary users.
const HARD_CAP_USDC          = 10_000;
// Amounts above this get REVIEW (allowed, flagged)
const REVIEW_THRESHOLD_USDC  = 2_000;
// Max sends in a rolling 60s window before REVIEW
const VELOCITY_60S_MAX        = 5;
// Max sends in a rolling 1h window before REVIEW
const VELOCITY_1H_MAX         = 30;

export type RiskDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface RiskResult {
  decision: RiskDecision;
  score:    number;     // 0-100, higher = riskier
  reasons:  string[];
  ms:       number;     // evaluation latency
}

export async function evaluateSend(params: {
  userId:     string;
  amountUsdc: number;
  toAddress?: string;
}): Promise<RiskResult> {
  const t0      = Date.now();
  const reasons: string[] = [];
  let   score   = 0;

  try {
    // ── Tier 0: instant rules ────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where:  { id: params.userId },
      select: { isFrozen: true },
    });

    if (user?.isFrozen) {
      return { decision: 'BLOCK', score: 100, reasons: ['account_frozen'], ms: Date.now() - t0 };
    }

    if (params.amountUsdc > HARD_CAP_USDC) {
      return { decision: 'BLOCK', score: 95, reasons: ['exceeds_hard_cap'], ms: Date.now() - t0 };
    }

    if (params.amountUsdc >= REVIEW_THRESHOLD_USDC) {
      score += 40;
      reasons.push('large_amount');
    }

    // ── Tier 1: velocity + behaviour (indexed Transaction queries) ────────
    const now   = Date.now();
    const since60s = new Date(now - 60_000);
    const since1h  = new Date(now - 3_600_000);

    const [count60s, count1h, priorToRecipient] = await Promise.all([
      prisma.transaction.count({
        where: { userId: params.userId, type: 'SEND', createdAt: { gte: since60s } },
      }),
      prisma.transaction.count({
        where: { userId: params.userId, type: 'SEND', createdAt: { gte: since1h } },
      }),
      params.toAddress
        ? prisma.transaction.count({
            where: { userId: params.userId, type: 'SEND', toAddress: params.toAddress },
          })
        : Promise.resolve(1),
    ]);

    if (count60s >= VELOCITY_60S_MAX) { score += 35; reasons.push('velocity_60s'); }
    if (count1h  >= VELOCITY_1H_MAX)  { score += 30; reasons.push('velocity_1h'); }
    if (priorToRecipient === 0 && params.amountUsdc >= REVIEW_THRESHOLD_USDC / 2) {
      score += 20;
      reasons.push('new_recipient_large');
    }

    // ── Decision ──────────────────────────────────────────────────────────
    const decision: RiskDecision = score >= 60 ? 'REVIEW' : 'ALLOW';
    return { decision, score, reasons, ms: Date.now() - t0 };

  } catch (e: any) {
    // FAIL-OPEN — never block a payment because screening errored
    console.warn('[riskGate] eval error (failing open):', e.message);
    return { decision: 'ALLOW', score: 0, reasons: ['gate_error_fail_open'], ms: Date.now() - t0 };
  }
}

/** Persist a flagged tx for the async FinCrime agent / admin review (best-effort). */
export async function logRiskReview(userId: string, amountUsdc: number, result: RiskResult): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RiskReview" ("userId","amountUsdc","decision","score","reasons","createdAt")
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      userId, amountUsdc, result.decision, result.score, result.reasons.join(','),
    );
  } catch {
    // table may not exist yet on older DBs — non-fatal
  }
}
