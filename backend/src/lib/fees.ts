/**
 * JIKO CONNECT money engine — the single source of truth for how every order
 * divides between the four parties. All amounts are TZS integers.
 *
 *   household pays (mobile money, upfront) = itemsTotal + serviceFee
 *   household pays (to rider, on delivery) = deliveryFee
 *   ─────────────────────────────────────────────────────────────
 *   supplier receives  = itemsTotal − commission
 *   rider receives      = deliveryFee − deliveryMargin
 *   PLATFORM keeps      = commission + serviceFee + deliveryMargin
 *
 * Three revenue streams, all tunable via env for ops:
 *   1. Commission   — % of gas value, taken from the supplier's cut.
 *                     Tier-aware (Phase 2) and accessory-aware (Phase 3).
 *   2. Service fee  — flat (+ optional %) convenience fee on each order.
 *   3. Delivery cut — % of the rider fee kept by the platform.
 */
import { haversineKm } from './geo';
import type { SupplierTier, ProductType } from '@prisma/client';

// ── Commission (Phase 1 base + Phase 2 tiers + Phase 3 accessories) ──────────────
const COMMISSION_BY_TIER: Record<SupplierTier, number> = {
  FREE:     Number(process.env.JIKO_COMMISSION_FREE     ?? 0.08), // 8%
  STANDARD: Number(process.env.JIKO_COMMISSION_STANDARD ?? 0.06), // 6% (Pro)
  PREMIUM:  Number(process.env.JIKO_COMMISSION_PREMIUM  ?? 0.05), // 5%
};
// Accessories carry a higher margin than gas (Phase 3 — "push accessories").
const ACCESSORY_COMMISSION_PCT = Number(process.env.JIKO_COMMISSION_ACCESSORY ?? 0.12); // 12%

// ── Service / convenience fee (Phase 1) ──────────────────────────────────────────
const SERVICE_FEE_FLAT = Number(process.env.JIKO_SERVICE_FEE      ?? 500); // TZS flat
const SERVICE_FEE_PCT  = Number(process.env.JIKO_SERVICE_FEE_PCT  ?? 0);   // + % of gas

// ── Delivery fee + platform margin on it (Phase 1) ───────────────────────────────
const DELIVERY_BASE     = Number(process.env.JIKO_DELIVERY_BASE     ?? 2000); // flag-fall
const DELIVERY_PER_KM   = Number(process.env.JIKO_DELIVERY_PER_KM   ?? 500);  // per km
const DELIVERY_MARGIN_PCT = Number(process.env.JIKO_DELIVERY_MARGIN_PCT ?? 0.15); // 15%

export interface MoneyLine { type: ProductType; lineTotal: number }

export interface OrderMoney {
  itemsTotal:       number;
  deliveryFee:      number;  // gross — what the household pays the rider
  serviceFee:       number;  // platform convenience fee (collected upfront with gas)
  surgeMultiplier:  number;
  total:            number;  // grand total across all legs
  upfrontAmount:    number;  // collected now by mobile money = itemsTotal + serviceFee
  commissionPct:    number;  // effective blended rate (for display/reporting)
  commissionAmount: number;
  deliveryMargin:   number;  // platform cut of the delivery fee
  // Final split (also computed lazily by settlementSplit):
  supplierAmount:   number;
  riderAmount:      number;  // deliveryFee − deliveryMargin
  platformAmount:   number;  // commission + serviceFee + deliveryMargin
  distanceKm:       number;
}

export function commissionPctForTier(tier: SupplierTier = 'FREE'): number {
  return COMMISSION_BY_TIER[tier] ?? COMMISSION_BY_TIER.FREE;
}

export function computeDeliveryFee(distanceKm: number, surge = 1): number {
  return Math.round((DELIVERY_BASE + DELIVERY_PER_KM * distanceKm) * surge);
}

/** Per-line commission so accessories are charged their higher rate. */
export function computeCommission(lines: MoneyLine[], tier: SupplierTier = 'FREE'): number {
  const gasPct = commissionPctForTier(tier);
  return Math.round(
    lines.reduce((sum, l) => sum + l.lineTotal * (l.type === 'ACCESSORY' ? ACCESSORY_COMMISSION_PCT : gasPct), 0),
  );
}

export function computeServiceFee(itemsTotal: number): number {
  return Math.round(SERVICE_FEE_FLAT + SERVICE_FEE_PCT * itemsTotal);
}

export function computeOrderMoney(params: {
  itemsTotal: number;
  lines: MoneyLine[];
  tier?: SupplierTier;
  supplierLat?: number | null;
  supplierLng?: number | null;
  dropLat: number;
  dropLng: number;
  surge?: number;
}): OrderMoney {
  const surge = params.surge ?? 1;
  const tier  = params.tier ?? 'FREE';
  const distanceKm =
    params.supplierLat != null && params.supplierLng != null
      ? haversineKm(params.supplierLat, params.supplierLng, params.dropLat, params.dropLng)
      : 3; // fallback when the vendor hasn't pinned a location yet

  const deliveryFee      = computeDeliveryFee(distanceKm, surge);
  const deliveryMargin   = Math.round(deliveryFee * DELIVERY_MARGIN_PCT);
  const serviceFee       = computeServiceFee(params.itemsTotal);
  const commissionAmount = computeCommission(params.lines, tier);
  const commissionPct    = params.itemsTotal > 0 ? commissionAmount / params.itemsTotal : commissionPctForTier(tier);
  const total            = params.itemsTotal + deliveryFee + serviceFee;

  return {
    itemsTotal:       params.itemsTotal,
    deliveryFee,
    serviceFee,
    surgeMultiplier:  surge,
    total,
    upfrontAmount:    params.itemsTotal + serviceFee,
    commissionPct,
    commissionAmount,
    deliveryMargin,
    supplierAmount:   params.itemsTotal - commissionAmount,
    riderAmount:      deliveryFee - deliveryMargin,
    platformAmount:   commissionAmount + serviceFee + deliveryMargin,
    distanceKm:       Math.round(distanceKm * 10) / 10,
  };
}

/**
 * Final four-way split applied when a delivery is confirmed. Works off the
 * amounts persisted on the order so it stays correct even if env rates change
 * between placement and settlement.
 */
export function settlementSplit(money: {
  itemsTotal: number; deliveryFee: number; serviceFee?: number; commissionAmount: number;
}) {
  const serviceFee     = money.serviceFee ?? 0;
  const deliveryMargin = Math.round(money.deliveryFee * DELIVERY_MARGIN_PCT);
  return {
    supplierAmount: money.itemsTotal - money.commissionAmount,
    riderAmount:    money.deliveryFee - deliveryMargin,
    platformAmount: money.commissionAmount + serviceFee + deliveryMargin,
    deliveryMargin,
  };
}
