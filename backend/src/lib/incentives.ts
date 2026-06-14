/** Rider weekly-trips incentive (Tier 4). Tunable via env. */
export const RIDER_WEEKLY_TARGET = Number(process.env.JIKO_RIDER_WEEKLY_TARGET ?? 20);
export const RIDER_WEEKLY_BONUS  = Number(process.env.JIKO_RIDER_WEEKLY_BONUS ?? 5000);

/**
 * Bonus due when the rider's rolling 7-day delivered count FIRST reaches the
 * target — awarded exactly once (the moment the count equals the target), so it
 * doesn't pay again on every subsequent delivery in the same window.
 */
export function weeklyBonusDue(weekTripsAfterThisDelivery: number): number {
  return weekTripsAfterThisDelivery === RIDER_WEEKLY_TARGET ? RIDER_WEEKLY_BONUS : 0;
}
