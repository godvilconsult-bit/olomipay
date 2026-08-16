import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, exponentFor, splitByPct, formatMoney } from './money';

describe('exponentFor', () => {
  it('defaults to 2 for ordinary currencies', () => {
    expect(exponentFor('TZS')).toBe(2);
    expect(exponentFor('USD')).toBe(2);
    expect(exponentFor('EUR')).toBe(2);
  });

  it('knows the zero-decimal currencies', () => {
    expect(exponentFor('JPY')).toBe(0);
    expect(exponentFor('UGX')).toBe(0);
    expect(exponentFor('XOF')).toBe(0);
  });

  it('knows the three-decimal currencies', () => {
    expect(exponentFor('KWD')).toBe(3);
    expect(exponentFor('BHD')).toBe(3);
  });

  it('is case-insensitive and falls back to 2 for unknown codes', () => {
    expect(exponentFor('jpy')).toBe(0);
    expect(exponentFor('ZZZ')).toBe(2);
  });
});

describe('toMinor / fromMinor', () => {
  it('round-trips ordinary amounts', () => {
    expect(toMinor(45_000, 'TZS')).toBe(4_500_000);
    expect(fromMinor(4_500_000, 'TZS')).toBe(45_000);
  });

  it('does not scale zero-decimal currencies', () => {
    expect(toMinor(1_000, 'JPY')).toBe(1_000);
    expect(fromMinor(1_000, 'JPY')).toBe(1_000);
  });

  it('scales three-decimal currencies by a thousand', () => {
    expect(toMinor(2.5, 'KWD')).toBe(2_500);
    expect(fromMinor(2_500, 'KWD')).toBe(2.5);
  });

  it('survives the classic binary-float rounding traps', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754, which naive rounding
    // turns into 100 rather than 101.
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30);
    expect(toMinor(8.165, 'USD')).toBe(817);
  });

  it('handles negative amounts symmetrically', () => {
    expect(toMinor(-1.005, 'USD')).toBe(-101);
    expect(toMinor(-45_000, 'TZS')).toBe(-4_500_000);
  });

  it('rejects values that are not finite numbers', () => {
    expect(() => toMinor(NaN)).toThrow();
    expect(() => toMinor(Infinity)).toThrow();
  });
});

describe('splitByPct', () => {
  it('never creates or destroys money', () => {
    // The invariant the order money engine relies on: the parts must sum
    // exactly back to the total, at any percentage, for any amount.
    for (const total of [1, 7, 99, 100, 4_500_000, 12_345_679]) {
      for (const pct of [0, 0.05, 0.08, 0.12, 0.15, 0.333, 1]) {
        const [part, rest] = splitByPct(total, pct);
        expect(part + rest).toBe(total);
      }
    }
  });

  it('takes the expected share', () => {
    expect(splitByPct(10_000, 0.08)).toEqual([800, 9_200]);
  });
});

describe('formatMoney', () => {
  it('renders the right number of decimals per currency', () => {
    expect(formatMoney(4_500_000, 'TZS')).toMatch(/45,000\.00/);
    expect(formatMoney(1_000, 'JPY')).toMatch(/1,000/);
    expect(formatMoney(2_500, 'KWD')).toMatch(/2\.500/);
  });

  it('falls back rather than throwing on an unknown code', () => {
    expect(formatMoney(1_00, 'ZZZ')).toContain('ZZZ');
  });
});
