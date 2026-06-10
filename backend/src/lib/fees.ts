/**
 * Money split for JIKO CONNECT. Every delivered order divides into three:
 *   household pays  = itemsTotal + deliveryFee   (× surge on the delivery leg)
 *   supplier gets   = itemsTotal − commission
 *   rider gets      = deliveryFee
 *   platform keeps  = commission
 *
 * All amounts in TZS. Tunable via env for ops.
 */
import { haversineKm } from './geo';

const COMMISSION_PCT  = Number(process.env.JIKO_COMMISSION_PCT  ?? 0.07); // 7%
const DELIVERY_BASE   = Number(process.env.JIKO_DELIVERY_BASE   ?? 2000); // TZS flag-fall
const DELIVERY_PER_KM = Number(process.env.JIKO_DELIVERY_PER_KM ?? 500);  // TZS / km

export interface OrderMoney {
  itemsTotal:       number;
  deliveryFee:      number;
  surgeMultiplier:  number;
  total:            number;
  commissionPct:    number;
  commissionAmount: number;
  distanceKm:       number;
}

export function computeDeliveryFee(distanceKm: number, surge = 1): number {
  return Math.round((DELIVERY_BASE + DELIVERY_PER_KM * distanceKm) * surge);
}

export function computeOrderMoney(params: {
  itemsTotal: number;
  supplierLat?: number | null;
  supplierLng?: number | null;
  dropLat: number;
  dropLng: number;
  surge?: number;
}): OrderMoney {
  const surge = params.surge ?? 1;
  const distanceKm =
    params.supplierLat != null && params.supplierLng != null
      ? haversineKm(params.supplierLat, params.supplierLng, params.dropLat, params.dropLng)
      : 3; // fallback when the vendor hasn't pinned a location yet

  const deliveryFee      = computeDeliveryFee(distanceKm, surge);
  const commissionAmount = Math.round(params.itemsTotal * COMMISSION_PCT);
  const total            = params.itemsTotal + deliveryFee;

  return {
    itemsTotal:       params.itemsTotal,
    deliveryFee,
    surgeMultiplier:  surge,
    total,
    commissionPct:    COMMISSION_PCT,
    commissionAmount,
    distanceKm:       Math.round(distanceKm * 10) / 10,
  };
}

/** Final three-way split applied when a delivery is confirmed. */
export function settlementSplit(money: { itemsTotal: number; deliveryFee: number; commissionAmount: number }) {
  return {
    supplierAmount: money.itemsTotal - money.commissionAmount,
    riderAmount:    money.deliveryFee,
    platformAmount: money.commissionAmount,
  };
}
