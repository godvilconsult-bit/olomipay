import { describe, it, expect } from 'vitest';
import {
  computeCommission, computeServiceFee, computeDeliveryFee,
  computeOrderMoney, settlementSplit, commissionPctForTier,
} from './fees';

describe('commission (tier + accessory aware)', () => {
  it('applies tier rates to gas', () => {
    expect(computeCommission([{ type: 'REFILL', lineTotal: 50000 }], 'FREE')).toBe(4000);     // 8%
    expect(computeCommission([{ type: 'REFILL', lineTotal: 50000 }], 'STANDARD')).toBe(3000); // 6%
    expect(computeCommission([{ type: 'REFILL', lineTotal: 50000 }], 'PREMIUM')).toBe(2500);  // 5%
  });
  it('charges accessories the higher rate', () => {
    expect(computeCommission([{ type: 'ACCESSORY', lineTotal: 10000 }], 'FREE')).toBe(1200);   // 12%
  });
  it('blends a mixed cart per line', () => {
    expect(computeCommission([{ type: 'REFILL', lineTotal: 50000 }, { type: 'ACCESSORY', lineTotal: 10000 }], 'FREE')).toBe(5200);
  });
  it('exposes tier rates', () => {
    expect(commissionPctForTier('FREE')).toBeCloseTo(0.08);
    expect(commissionPctForTier('PREMIUM')).toBeCloseTo(0.05);
  });
});

describe('service + delivery fees', () => {
  it('service fee is a flat 500 by default', () => { expect(computeServiceFee(50000)).toBe(500); });
  it('delivery fee is base + per-km', () => {
    expect(computeDeliveryFee(0)).toBe(2000);
    expect(computeDeliveryFee(2)).toBe(3000);
  });
});

describe('computeOrderMoney', () => {
  const m = computeOrderMoney({
    itemsTotal: 50000, lines: [{ type: 'REFILL', lineTotal: 50000 }], tier: 'FREE',
    supplierLat: -6.78, supplierLng: 39.25, dropLat: -6.79, dropLng: 39.25,
  });

  it('total = items + delivery + service', () => { expect(m.total).toBe(m.itemsTotal + m.deliveryFee + m.serviceFee); });
  it('upfront (mobile money) = items + service', () => { expect(m.upfrontAmount).toBe(m.itemsTotal + m.serviceFee); });
  it('supplier = items − commission', () => { expect(m.supplierAmount).toBe(m.itemsTotal - m.commissionAmount); });
  it('rider = delivery − margin', () => { expect(m.riderAmount).toBe(m.deliveryFee - m.deliveryMargin); });
  it('platform = commission + service + margin', () => { expect(m.platformAmount).toBe(m.commissionAmount + m.serviceFee + m.deliveryMargin); });

  it('conserves money: supplier + rider + platform === items + delivery + service', () => {
    expect(m.supplierAmount + m.riderAmount + m.platformAmount).toBe(m.itemsTotal + m.deliveryFee + m.serviceFee);
  });
});

describe('settlementSplit conservation', () => {
  it('splits sum exactly to the collected money', () => {
    const s = settlementSplit({ itemsTotal: 50000, deliveryFee: 3000, serviceFee: 500, commissionAmount: 4000 });
    expect(s.supplierAmount + s.riderAmount + s.platformAmount).toBe(50000 + 3000 + 500);
  });
  it('rider never receives more than the gross delivery fee', () => {
    const s = settlementSplit({ itemsTotal: 40000, deliveryFee: 2500, serviceFee: 500, commissionAmount: 3200 });
    expect(s.riderAmount).toBeLessThanOrEqual(2500);
  });
});
