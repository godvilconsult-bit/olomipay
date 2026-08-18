import { describe, it, expect } from 'vitest';
import { unitPriceForQty, lineTotalForQty, normaliseTiers, priceBands, nextBreak } from './pricing';

const TIERS = [
  { minQty: 10,  priceMinor: 900 },
  { minQty: 100, priceMinor: 800 },
];

describe('unitPriceForQty', () => {
  it('uses the base price below the first break', () => {
    expect(unitPriceForQty(1000, TIERS, 1)).toBe(1000);
    expect(unitPriceForQty(1000, TIERS, 9)).toBe(1000);
  });

  it('applies a tier exactly at its threshold', () => {
    expect(unitPriceForQty(1000, TIERS, 10)).toBe(900);
    expect(unitPriceForQty(1000, TIERS, 100)).toBe(800);
  });

  it('picks the deepest tier the quantity reaches', () => {
    expect(unitPriceForQty(1000, TIERS, 99)).toBe(900);
    expect(unitPriceForQty(1000, TIERS, 5000)).toBe(800);
  });

  it('falls back to the base price when there are no tiers', () => {
    // The whole safety property: an offer without tiers is unchanged.
    expect(unitPriceForQty(1000, null, 50)).toBe(1000);
    expect(unitPriceForQty(1000, [], 50)).toBe(1000);
    expect(unitPriceForQty(1000, undefined, 1)).toBe(1000);
  });

  it('ignores malformed tiers rather than throwing', () => {
    const junk = [{ minQty: 'ten', priceMinor: 900 }, null, { minQty: 10 }, { priceMinor: 5 }];
    expect(unitPriceForQty(1000, junk as any, 50)).toBe(1000);
    expect(unitPriceForQty(1000, 'not an array' as any, 50)).toBe(1000);
  });

  it('handles tiers supplied out of order', () => {
    const messy = [{ minQty: 100, priceMinor: 800 }, { minQty: 10, priceMinor: 900 }];
    expect(unitPriceForQty(1000, messy, 10)).toBe(900);
    expect(unitPriceForQty(1000, messy, 100)).toBe(800);
  });

  it('treats a nonsense quantity as one unit', () => {
    expect(unitPriceForQty(1000, TIERS, 0)).toBe(1000);
    expect(unitPriceForQty(1000, TIERS, -5)).toBe(1000);
    expect(unitPriceForQty(1000, TIERS, NaN)).toBe(1000);
  });
});

describe('lineTotalForQty', () => {
  it('multiplies the tiered unit price, not the base', () => {
    expect(lineTotalForQty(1000, TIERS, 10)).toBe(9_000);
    expect(lineTotalForQty(1000, TIERS, 100)).toBe(80_000);
  });

  it('has the inherent quantity-break crossover, and reports it', () => {
    // 99 x 900 = 89 100, but 100 x 800 = 80 000: more units, less money. This
    // is how quantity breaks genuinely behave. Rather than bill for units the
    // buyer did not order, nextBreak() surfaces the gap so the UI can offer it.
    expect(lineTotalForQty(1000, TIERS, 99)).toBe(89_100);
    expect(lineTotalForQty(1000, TIERS, 100)).toBe(80_000);

    const hint = nextBreak(1000, TIERS, 99);
    expect(hint).toEqual({ atQty: 100, unitPriceMinor: 800, addUnits: 1, savesMinor: 9_100 });
  });

  it('reports no break once the deepest tier is reached', () => {
    expect(nextBreak(1000, TIERS, 100)).toBeNull();
    expect(nextBreak(1000, null, 5)).toBeNull();
  });});

describe('priceBands', () => {
  it('describes a single open band when there are no tiers', () => {
    expect(priceBands(1000, null)).toEqual([{ minQty: 1, maxQty: null, priceMinor: 1000 }]);
  });

  it('closes each band at the next threshold and leaves the last open', () => {
    expect(priceBands(1000, TIERS)).toEqual([
      { minQty: 1,   maxQty: 9,    priceMinor: 1000 },
      { minQty: 10,  maxQty: 99,   priceMinor: 900 },
      { minQty: 100, maxQty: null, priceMinor: 800 },
    ]);
  });

  it('does not duplicate the base band when a tier starts at one', () => {
    expect(priceBands(1000, [{ minQty: 1, priceMinor: 950 }])).toEqual([
      { minQty: 1, maxQty: null, priceMinor: 950 },
    ]);
  });
});

describe('normaliseTiers', () => {
  it('floors quantities and rounds prices to integers', () => {
    expect(normaliseTiers([{ minQty: 10.7, priceMinor: 899.6 }])).toEqual([{ minQty: 10, priceMinor: 900 }]);
  });
});
