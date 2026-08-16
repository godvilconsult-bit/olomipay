/**
 * Money as integer minor units.
 *
 * Float money is a rounding bug waiting to happen: 0.1 + 0.2 !== 0.3 in IEEE-754,
 * and once several currencies are in play the drift becomes a reconciliation
 * problem. Every new money column stores an integer in the currency's smallest
 * unit, alongside an explicit ISO-4217 code.
 *
 * The exponent is NOT always 2. Japanese yen has none, Kuwaiti dinar has three.
 * Hardcoding ×100 would silently corrupt those markets by a factor of 100 or 10,
 * which is exactly the class of bug a global rollout must not ship with.
 */

/** ISO-4217 exponents that differ from the default of 2. */
const EXPONENTS: Record<string, number> = {
  // Zero-decimal currencies
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three-decimal currencies
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

export const DEFAULT_CURRENCY = 'TZS';

/** Decimal places for a currency. Unknown codes fall back to 2. */
export function exponentFor(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

function factor(currency: string): number {
  return 10 ** exponentFor(currency);
}

/**
 * Major units (what a human types: 45000 shillings) → minor units for storage.
 * Rounds half away from zero so a half-unit never silently disappears.
 */
export function toMinor(amount: number, currency: string = DEFAULT_CURRENCY): number {
  if (!Number.isFinite(amount)) throw new Error(`toMinor: not a finite number: ${amount}`);
  const scaled = amount * factor(currency);
  // Number.EPSILON guards the classic 1.005 * 100 === 100.49999999999999 case.
  return Math.round(scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled));
}

/** Minor units → major units, for display and for legacy Float columns. */
export function fromMinor(minor: number, currency: string = DEFAULT_CURRENCY): number {
  return minor / factor(currency);
}

/**
 * Split a minor-unit amount by a percentage without losing or inventing money.
 * Returns [part, remainder] which always sum exactly back to `total` — the
 * property the order money engine depends on when dividing between supplier,
 * rider and platform.
 */
export function splitByPct(total: number, pct: number): [number, number] {
  const part = Math.round(total * pct);
  return [part, total - part];
}

/** Locale-aware formatting. Falls back to a plain join if Intl lacks the code. */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY, locale = 'en'): string {
  const digits = exponentFor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(fromMinor(minor, currency));
  } catch {
    return `${currency} ${fromMinor(minor, currency).toFixed(digits)}`;
  }
}
