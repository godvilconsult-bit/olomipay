/**
 * Freight marketplace — loads, quotes, awards, and backhaul matching.
 *
 * Two-sided by design (§8 of the refactor doc):
 *   shipper → carrier : post a Load, collect Quotes, accept one
 *   carrier → shipper : post a CarrierRoute (a lane you already run) and get
 *                       offered OPEN loads that fit along it
 *
 * The second direction is the one that makes a load board worth using. Empty
 * return trips are the industry's biggest waste, so matching a load to a truck
 * that is already making the journey is where the value is.
 */
import { prisma } from '../lib/prisma';
import { projectOntoPath, haversineKm } from '../lib/geo';
import { makeOrderNo } from '../lib/ids';
import { ensureOrgForUser } from './orgs';

function fail(message: string, http: number): never {
  throw Object.assign(new Error(message), { http });
}

/**
 * The org a user acts as, created on demand.
 *
 * This used to fail with 409 when `primaryOrgId` was null, which was every
 * account registered after the phase 2 backfill — so sellers could not list,
 * buyers could not message, and nobody could post a load. Creating it here
 * heals those accounts without a migration.
 */
export async function actingOrgId(userId: string): Promise<string> {
  return ensureOrgForUser(userId);
}

// ── Shipper side ────────────────────────────────────────────────────────────

export interface NewLoad {
  originLat: number; originLng: number; destLat: number; destLng: number;
  originLabel?: string; destLabel?: string;
  pickupFrom: Date; pickupTo: Date;
  weightKg: number; volumeM3?: number;
  cargoType?: string; isHazmat?: boolean; needsRefrigeration?: boolean;
  budgetMinor?: number; currency?: string; notes?: string;
}

export async function postLoad(userId: string, input: NewLoad) {
  if (input.weightKg <= 0) fail('Weight must be greater than zero', 400);
  if (input.pickupTo < input.pickupFrom) fail('Pickup window ends before it starts', 400);

  const shipperOrgId = await actingOrgId(userId);
  return prisma.load.create({
    data: {
      reference: `LD-${makeOrderNo()}`,
      shipperOrgId,
      originLat: input.originLat, originLng: input.originLng,
      destLat:   input.destLat,   destLng:   input.destLng,
      originLabel: input.originLabel, destLabel: input.destLabel,
      pickupFrom: input.pickupFrom, pickupTo: input.pickupTo,
      weightKg: input.weightKg, volumeM3: input.volumeM3,
      cargoType: input.cargoType ?? 'general',
      isHazmat: input.isHazmat ?? false,
      needsRefrigeration: input.needsRefrigeration ?? false,
      budgetMinor: input.budgetMinor, currency: input.currency ?? 'TZS',
      notes: input.notes,
    },
  });
}

// ── Carrier side ────────────────────────────────────────────────────────────

export async function quoteOnLoad(
  userId: string,
  loadId: string,
  input: { amountMinor: number; currency?: string; etaPickup?: Date; etaDrop?: Date; message?: string },
) {
  if (input.amountMinor <= 0) fail('Quote must be greater than zero', 400);

  const bidderOrgId = await actingOrgId(userId);
  const [load, org] = await Promise.all([
    prisma.load.findUnique({ where: { id: loadId } }),
    prisma.organization.findUnique({ where: { id: bidderOrgId }, select: { canCarry: true } }),
  ]);
  if (!load) fail('Load not found', 404);
  if (!org?.canCarry) fail('Your organization is not registered as a carrier', 403);
  if (load.shipperOrgId === bidderOrgId) fail('You cannot quote on your own load', 400);
  if (load.status !== 'OPEN' && load.status !== 'QUOTED') fail('This load is no longer accepting quotes', 409);

  // Re-bidding replaces the previous offer rather than stacking another one.
  const quote = await prisma.quote.upsert({
    where:  { loadId_bidderOrgId: { loadId, bidderOrgId } },
    update: {
      amountMinor: input.amountMinor, currency: input.currency ?? load.currency,
      etaPickup: input.etaPickup, etaDrop: input.etaDrop, message: input.message,
      status: 'PENDING', decidedAt: null,
    },
    create: {
      loadId, bidderOrgId,
      amountMinor: input.amountMinor, currency: input.currency ?? load.currency,
      etaPickup: input.etaPickup, etaDrop: input.etaDrop, message: input.message,
    },
  });

  if (load.status === 'OPEN') {
    await prisma.load.update({ where: { id: loadId }, data: { status: 'QUOTED' } });
  }
  return quote;
}

/**
 * Accept a quote. Creates the Shipment and its single leg, so freight tracking
 * runs on exactly the same spine as product deliveries.
 */
export async function acceptQuote(userId: string, quoteId: string) {
  const orgId = await actingOrgId(userId);
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { load: true } });
  if (!quote) fail('Quote not found', 404);
  if (quote.load.shipperOrgId !== orgId) fail('Only the shipper can accept a quote', 403);
  if (quote.load.status === 'AWARDED') fail('This load has already been awarded', 409);
  if (quote.status !== 'PENDING') fail('That quote is no longer available', 409);

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        shipperOrgId: quote.load.shipperOrgId,
        carrierOrgId: quote.bidderOrgId,
        status:       'PLANNED',
        legs: {
          create: {
            seq: 0,
            originLat: quote.load.originLat, originLng: quote.load.originLng,
            destLat:   quote.load.destLat,   destLng:   quote.load.destLng,
            originLabel: quote.load.originLabel, destLabel: quote.load.destLabel,
            status: 'PENDING',
          },
        },
      },
      include: { legs: true },
    });

    await tx.quote.update({ where: { id: quoteId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
    // Losing bids are closed explicitly so carriers are not left waiting.
    await tx.quote.updateMany({
      where: { loadId: quote.loadId, id: { not: quoteId }, status: 'PENDING' },
      data:  { status: 'REJECTED', decidedAt: new Date() },
    });
    const load = await tx.load.update({
      where: { id: quote.loadId },
      data:  { status: 'AWARDED', shipmentId: shipment.id },
    });

    return { load, shipment, quote };
  });
}

// ── Matching ────────────────────────────────────────────────────────────────

export interface LoadMatch {
  load: any;
  detourKm: number;      // worst of the two off-lane distances
  pickupOffsetKm: number;
  dropOffsetKm: number;
  laneKm: number;
}

/**
 * Loads that fit a lane the carrier is already running.
 *
 * A load qualifies when both ends sit inside the corridor AND the pickup comes
 * before the drop along the direction of travel — otherwise a load heading the
 * opposite way down the same highway would match, which is precisely the trip
 * the carrier is trying to avoid.
 *
 * LIMITATION: the corridor is measured against the straight line between the
 * lane's endpoints, not the road. Where a highway bends, real waypoints can sit
 * far off that line — Morogoro is ~99 km from the straight Dar–Mwanza line
 * despite being directly on the road — so `corridorKm` has to absorb the
 * curvature, which also lets through some genuinely distant loads. Measuring
 * against the routed polyline (phase 7's RoutingProvider) removes the
 * compromise; until then, err on the wide side and let carriers judge.
 */
export async function matchLoadsForRoute(routeId: string, limit = 20): Promise<LoadMatch[]> {
  const route = await prisma.carrierRoute.findUnique({ where: { id: routeId } });
  if (!route) fail('Route not found', 404);

  const laneKm = haversineKm(route.originLat, route.originLng, route.destLat, route.destLng);

  // Cheap bounding-box prefilter, then the exact corridor test in memory. The
  // box is padded by the corridor so nothing inside it is excluded early.
  const padDeg = route.corridorKm / 110.574;
  const minLat = Math.min(route.originLat, route.destLat) - padDeg;
  const maxLat = Math.max(route.originLat, route.destLat) + padDeg;

  const candidates = await prisma.load.findMany({
    where: {
      status:     { in: ['OPEN', 'QUOTED'] },
      weightKg:   { lte: route.capacityKgFree },
      pickupTo:   { gte: route.departsAt },
      originLat:  { gte: minLat, lte: maxLat },
      shipperOrgId: { not: route.carrierOrgId },
    },
    take: 500,
    orderBy: { pickupFrom: 'asc' },
  });

  const matches: LoadMatch[] = [];
  for (const load of candidates) {
    const pickup = projectOntoPath(load.originLat, load.originLng, route.originLat, route.originLng, route.destLat, route.destLng);
    const drop   = projectOntoPath(load.destLat,   load.destLng,   route.originLat, route.originLng, route.destLat, route.destLng);

    if (pickup.distanceKm > route.corridorKm) continue;
    if (drop.distanceKm   > route.corridorKm) continue;
    if (drop.t < pickup.t) continue;   // wrong way down the lane

    matches.push({
      load,
      detourKm:       Math.max(pickup.distanceKm, drop.distanceKm),
      pickupOffsetKm: pickup.distanceKm,
      dropOffsetKm:   drop.distanceKm,
      laneKm,
    });
  }

  // Least detour first — the whole point is filling a trip already being made.
  matches.sort((a, b) => a.detourKm - b.detourKm);
  return matches.slice(0, limit);
}

export interface NearbyLoad {
  load: any;
  /** Straight-line km from the driver to the pickup. */
  pickupDistanceKm: number;
  /** Length of the haul itself, pickup → drop. */
  haulKm: number;
}

/**
 * Loads whose pickup sits within `radiusKm` of where the driver is standing.
 *
 * This is the opportunistic case: a driver opens the map and takes whatever is
 * near them, as opposed to matchLoadsForRoute, which fills a trip they have
 * already committed to. Both are needed — a boda rider works the first way, a
 * long-haul truck the second.
 *
 * A bounding box on the indexed origin columns does the coarse filter, then
 * haversine trims the corners: a box's diagonal is ~41% longer than its
 * half-width, so skipping the exact pass would return loads well outside the
 * radius the driver asked for.
 */
export async function nearbyLoads(params: {
  lat: number; lng: number;
  radiusKm?: number;
  maxWeightKg?: number;
  excludeOrgId?: string;
  limit?: number;
}): Promise<NearbyLoad[]> {
  const radiusKm = Math.min(params.radiusKm ?? 25, 500);
  const limit    = Math.min(params.limit ?? 50, 200);

  const latDelta = radiusKm / 110.574;
  const cos      = Math.cos((params.lat * Math.PI) / 180);
  // Guard the poles, where cos approaches zero and the delta explodes.
  const lngDelta = radiusKm / (111.320 * Math.max(0.01, Math.abs(cos)));

  const where: any = {
    status:    { in: ['OPEN', 'QUOTED'] },
    originLat: { gte: params.lat - latDelta, lte: params.lat + latDelta },
    originLng: { gte: params.lng - lngDelta, lte: params.lng + lngDelta },
    // Expired pickup windows are noise on a driver's map.
    pickupTo:  { gte: new Date() },
  };
  if (params.maxWeightKg)  where.weightKg     = { lte: params.maxWeightKg };
  if (params.excludeOrgId) where.shipperOrgId = { not: params.excludeOrgId };

  const candidates = await prisma.load.findMany({
    where,
    take: limit * 4,   // headroom for the corners the box over-returns
    orderBy: { pickupFrom: 'asc' },
    include: { shipper: { select: { id: true, name: true, slug: true, isVerified: true } } },
  });

  const out: NearbyLoad[] = [];
  for (const load of candidates) {
    const pickupDistanceKm = haversineKm(params.lat, params.lng, load.originLat, load.originLng);
    if (pickupDistanceKm > radiusKm) continue;
    out.push({
      load,
      pickupDistanceKm,
      haulKm: haversineKm(load.originLat, load.originLng, load.destLat, load.destLng),
    });
  }

  // Nearest pickup first: the driver's cost of taking a job is getting to it.
  out.sort((a, b) => a.pickupDistanceKm - b.pickupDistanceKm);
  return out.slice(0, limit);
}

/** The mirror image: carriers already running a lane that suits this load. */
export async function matchRoutesForLoad(loadId: string, limit = 20) {
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) fail('Load not found', 404);

  const routes = await prisma.carrierRoute.findMany({
    where: {
      isActive:       true,
      capacityKgFree: { gte: load.weightKg },
      departsAt:      { lte: load.pickupTo },
      carrierOrgId:   { not: load.shipperOrgId },
    },
    take: 500,
    include: { carrier: { select: { id: true, name: true, slug: true, isVerified: true, rating: true } } },
  });

  const out: { route: any; detourKm: number }[] = [];
  for (const r of routes) {
    const pickup = projectOntoPath(load.originLat, load.originLng, r.originLat, r.originLng, r.destLat, r.destLng);
    const drop   = projectOntoPath(load.destLat,   load.destLng,   r.originLat, r.originLng, r.destLat, r.destLng);
    if (pickup.distanceKm > r.corridorKm || drop.distanceKm > r.corridorKm) continue;
    if (drop.t < pickup.t) continue;
    out.push({ route: r, detourKm: Math.max(pickup.distanceKm, drop.distanceKm) });
  }

  out.sort((a, b) => a.detourKm - b.detourKm);
  return out.slice(0, limit);
}
