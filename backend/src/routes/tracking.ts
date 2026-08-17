/**
 * Journey tracking — the road route for an order, and the chain behind it.
 *
 * Two things the old tracking screen could not do:
 *
 *   1. Draw a real road route. Routing happened in the browser against OSRM's
 *      demo server, only on the Leaflet engine, refetched on every rider ping.
 *      It is now computed server-side and cached (services/routing.ts).
 *
 *   2. Show more than one hop. An order's goods usually reached the shop from
 *      somewhere upstream, and `Order.parentOrderId` records that. Walking it
 *      yields the provenance chain — manufacturer → wholesaler → shop → you —
 *      which is what "see the distribution of the product" actually means.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getRoute, usingPublicDemoServer, type LatLng } from '../services/routing';
import { haversineKm, etaMinutes } from '../lib/geo';

const router = Router();

/** Depth guard: a malformed parent chain must not loop forever. */
const MAX_CHAIN = 6;

interface JourneyLeg {
  seq: number;
  label: string;
  from: LatLng & { label?: string | null };
  to:   LatLng & { label?: string | null };
  status: 'DONE' | 'ACTIVE' | 'PENDING';
  polyline: string;
  distanceM: number;
  durationS: number;
  snapped: boolean;
}

/** Which leg states count as finished, from the legacy order status. */
const DONE_STATUSES = new Set(['DELIVERED', 'COMPLETED']);
const MOVING_STATUSES = new Set(['PICKED', 'FEE_CONFIRMED', 'RIDER_ACCEPTED']);

// ── GET /api/tracking/orders/:id ─────────────────────────────────────────────
router.get('/orders/:id', requireAuth, async (req: AuthRequest, res) => {
  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id,
      // Visible to the buyer, and to the shop fulfilling it.
      OR: [{ householdId: req.userId }, { supplier: { userId: req.userId } }],
    },
    include: {
      delivery: { select: { riderLat: true, riderLng: true, lastLocationAt: true, status: true } },
      supplier: { select: { businessName: true, lat: true, lng: true } },
      address:  { select: { label: true, lat: true, lng: true, street: true } },
    },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.supplier?.lat == null || order.supplier?.lng == null) {
    return res.status(409).json({ error: 'The vendor has not pinned their location yet' });
  }

  // Walk upstream so the buyer sees where the goods came from, not just the
  // last mile. Each hop is a real order between two organizations.
  const upstream: { fromLabel: string; from: LatLng; toLabel: string; to: LatLng }[] = [];
  let parentId = order.parentOrderId;
  for (let i = 0; parentId && i < MAX_CHAIN; i++) {
    const parent: any = await prisma.order.findUnique({
      where:  { id: parentId },
      include: {
        supplier: { select: { businessName: true, lat: true, lng: true } },
        address:  { select: { label: true, lat: true, lng: true } },
      },
    });
    if (!parent?.supplier?.lat || !parent?.address?.lat) break;
    upstream.unshift({
      fromLabel: parent.supplier.businessName ?? 'Supplier',
      from: { lat: parent.supplier.lat, lng: parent.supplier.lng },
      toLabel: parent.address.label ?? 'Shop',
      to: { lat: parent.address.lat, lng: parent.address.lng },
    });
    parentId = parent.parentOrderId;
  }

  const hops = [
    ...upstream.map(u => ({ ...u, done: true })),
    {
      fromLabel: order.supplier.businessName ?? 'Vendor',
      from: { lat: order.supplier.lat, lng: order.supplier.lng },
      toLabel: order.address?.label ?? 'Delivery address',
      to: { lat: order.address!.lat, lng: order.address!.lng },
      done: DONE_STATUSES.has(order.status),
    },
  ];

  // Routes are cached, so several hops cost little after the first request.
  const legs: JourneyLeg[] = [];
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i];
    const r = await getRoute(h.from, h.to);
    const isLast = i === hops.length - 1;
    legs.push({
      seq: i,
      label: `${h.fromLabel} → ${h.toLabel}`,
      from: { ...h.from, label: h.fromLabel },
      to:   { ...h.to,   label: h.toLabel },
      status: h.done ? 'DONE' : isLast && MOVING_STATUSES.has(order.status) ? 'ACTIVE' : 'PENDING',
      polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS, snapped: r.snapped,
    });
  }

  // ETA from where the rider actually is, not from the vendor — otherwise it
  // never counts down while they drive.
  const rider = order.delivery?.riderLat != null && order.delivery?.riderLng != null
    ? { lat: order.delivery.riderLat, lng: order.delivery.riderLng, at: order.delivery.lastLocationAt }
    : null;

  let etaMin: number | null = null;
  const drop = { lat: order.address!.lat, lng: order.address!.lng };
  if (rider && !DONE_STATUSES.has(order.status)) {
    const remaining = await getRoute({ lat: rider.lat, lng: rider.lng }, drop);
    etaMin = Math.max(1, Math.round(remaining.durationS / 60));
  } else if (!DONE_STATUSES.has(order.status)) {
    etaMin = etaMinutes(haversineKm(legs.at(-1)!.from.lat, legs.at(-1)!.from.lng, drop.lat, drop.lng));
  }

  res.json({
    orderNo: order.orderNo,
    status:  order.status,
    legs,
    rider,
    etaMinutes: etaMin,
    chainLength: legs.length,
    // Surfaced so the client can show provenance honestly rather than implying
    // a road route when it only has a straight line.
    routeQuality: legs.every(l => l.snapped) ? 'road' : 'approximate',
    ...(usingPublicDemoServer ? { warning: 'routing_demo_server' } : {}),
  });
});

export { router as trackingRouter };
