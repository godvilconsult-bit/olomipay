import { describe, it, expect } from 'vitest';
import { weeklyBonusDue, RIDER_WEEKLY_TARGET, RIDER_WEEKLY_BONUS } from './incentives';

describe('rider weekly bonus', () => {
  it('pays exactly at the target', () => {
    expect(weeklyBonusDue(RIDER_WEEKLY_TARGET)).toBe(RIDER_WEEKLY_BONUS);
  });
  it('pays nothing below the target', () => {
    expect(weeklyBonusDue(RIDER_WEEKLY_TARGET - 1)).toBe(0);
    expect(weeklyBonusDue(0)).toBe(0);
  });
  it('does not pay again past the target (awarded once)', () => {
    expect(weeklyBonusDue(RIDER_WEEKLY_TARGET + 1)).toBe(0);
    expect(weeklyBonusDue(RIDER_WEEKLY_TARGET + 5)).toBe(0);
  });
});
