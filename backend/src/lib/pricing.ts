/**
 * Quantity price breaks.
 *
 * B2B sellers quote "1–9 at X, 10–99 at Y, 100+ at Z". Offer.priceMinor stays
 * the base (qty 1) price that every existing display already reads, and `tiers`
 * is optional extra data — so an offer without tiers behaves exactly as it did
 * before this existed. That is deliberate: adding tiered pricing must not
 * silently change what any current buyer sees.
 */

export interface PriceTier {
  minQty: number;
  priceMinor: number;
}

/** Discard anything malformed and sort ascending, so lookup is predictable. */
export function normaliseTiers(raw: unknown): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) =>
      t && Number.isFinite(t.minQty) && Number.isFinite(t.priceMinor) &&
      t.minQty >= 1 && t.priceMinor >= 0)
    .map((t: any) => ({ minQty: Math.floor(t.minQty), priceMinor: Math.round(t.priceMinor) }))
    .sort((a, b) => a.minQty - b.minQty);
}

/**
 * Unit price for a given quantity: the highest tier whose threshold the
 * quantity reaches, falling back to the base price.
 *
 * Note this returns the UNIT price, not the line total — callers multiply. A
 * tier of {minQty: 10, priceMinor: 900} means "900 each when buying 10+".
 */
export function unitPriceForQty(basePriceMinor: number, tiers: unknown, qty: number): number {
  if (!Number.isFinite(qty) || qty < 1) return basePriceMinor;
  const list = normaliseTiers(tiers);

  let price = basePriceMinor;
  for (const tier of list) {
    if (qty >= tier.minQty) price = tier.priceMinor;
    else break;               // sorted ascending, so no later tier can apply
  }
  return price;
}

/** Line total for a quantity, in minor units. */
export function lineTotalForQty(basePriceMinor: number, tiers: unknown, qty: number): number {
  return unitPriceForQty(basePriceMinor, tiers, qty) * Math.max(1, Math.floor(qty));
}

/**
 * Display rows: the base price plus each tier, as [from, to] bands.
 * The last band is open-ended, which is what "100+" means on a price table.
 */
export function priceBands(basePriceMinor: number, tiers: unknown): {
  minQty: number; maxQty: number | null; priceMinor: number;
}[] {
  const list = normaliseTiers(tiers);
  if (list.length === 0) return [{ minQty: 1, maxQty: null, priceMinor: basePriceMinor }];

  const bands: { minQty: number; maxQty: number | null; priceMinor: number }[] = [];
  // A tier starting at 1 replaces the base band rather than duplicating it.
  if (list[0].minQty > 1) {
    bands.push({ minQty: 1, maxQty: list[0].minQty - 1, priceMinor: basePriceMinor });
  }
  list.forEach((tier, i) => {
    const next = list[i + 1];
    bands.push({ minQty: tier.minQty, maxQty: next ? next.minQty - 1 : null, priceMinor: tier.priceMinor });
  });
  return bands;
}

/**
 * How far the buyer is from the next price break, and what it would save.
 *
 * Quantity breaks have an inherent crossover: at a base of 1000 with a 100+
 * tier of 800, ordering 99 costs 89,100 while ordering 100 costs 80,000 — more
 * units for less money. That is genuine B2B behaviour, not a defect, and the
 * honest response is to show the buyer rather than quietly bill them for units
 * they did not order.
 */
export function nextBreak(basePriceMinor: number, tiers: unknown, qty: number): {
  atQty: number; unitPriceMinor: number; addUnits: number; savesMinor: number;
} | null {
  const list = normaliseTiers(tiers);
  const next = list.find(t => t.minQty > qty);
  if (!next) return null;

  const nowTotal  = lineTotalForQty(basePriceMinor, tiers, qty);
  const thenTotal = next.minQty * next.priceMinor;
  if (thenTotal >= nowTotal) return null;   // no saving worth showing

  return {
    atQty: next.minQty,
    unitPriceMinor: next.priceMinor,
    addUnits: next.minQty - qty,
    savesMinor: nowTotal - thenTotal,
  };
}
