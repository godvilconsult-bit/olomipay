/**
 * Currency-aware display formatting for the storefront.
 *
 * The app's existing formatTzs() hardcodes "TZS" and zero decimals, which is
 * correct for the gas flow and wrong for a global catalog. This mirrors the
 * backend's src/lib/money.ts: the exponent comes from ISO-4217, because yen has
 * none and Kuwaiti dinar has three.
 */

const EXPONENTS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

export function exponentFor(currency: string): number {
  return EXPONENTS[currency?.toUpperCase()] ?? 2;
}

/**
 * Minor units → major units. Always use this rather than dividing by 100:
 * yen has no minor unit and dinar has three, so a hardcoded 100 is wrong in
 * both directions.
 */
export function fromMinor(minor: number, currency = 'TZS'): number {
  return minor / 10 ** exponentFor(currency);
}

/** Format a minor-unit amount directly. */
export function formatMinor(minor: number, currency = 'TZS', locale = 'en'): string {
  return formatMoney(fromMinor(minor, currency), currency, locale);
}

/**
 * Format major units for display. Tanzanian shillings are quoted as whole
 * numbers in practice, so trailing ".00" is suppressed when the amount is
 * whole — showing "TZS 45,000" rather than "TZS 45,000.00".
 */
export function formatMoney(amount: number, currency = 'TZS', locale = 'en'): string {
  const digits = exponentFor(currency);
  const whole  = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(locale)}`;
  }
}

/** Convenience for the { price, currency } shape the catalog API returns. */
export function formatCatalogMoney(m: { price: number; currency: string } | null | undefined): string {
  if (!m) return '—';
  return formatMoney(m.price, m.currency);
}
