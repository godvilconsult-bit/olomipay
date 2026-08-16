/**
 * Freight marketplace tests.
 *
 * The interesting logic is the backhaul matcher. Endpoint-proximity matching is
 * easy and wrong — it happily matches a load travelling the opposite way down
 * the same highway, which is exactly the trip a carrier is trying to avoid. The
 * direction tests below are the ones that matter.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { postLoad, quoteOnLoad, acceptQuote, matchLoadsForRoute, matchRoutesForLoad } from '../../services/freight';
import { makeHousehold } from './factories';

// Real Tanzanian lane, so the distances are realistic: Dar es Salaam -> Mwanza,
// roughly 1100 km north-west. Morogoro sits on the way; Mtwara is far south.
const DAR    = { lat: -6.79,  lng: 39.21 };
const DODOMA = { lat: -6.16,  lng: 35.75 };
const MWANZA = { lat: -2.52,  lng: 32.90 };
const MTWARA = { lat: -10.27, lng: 40.18 };

let seq = 0;
const phone = () => `+2555${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;

async function makeOrg(kind: 'INDIVIDUAL' | 'CARRIER' | 'RETAILER', name: string) {
  const user = await prisma.user.create({ data: { phone: phone(), pinHash: 'x', role: 'HOUSEHOLD', name } });
  const org  = await prisma.organization.create({
    data: {
      name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${seq++}`, kind,
      canBuy: true, canSell: kind === 'RETAILER', canCarry: kind === 'CARRIER',
    },
  });
  await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: 'OWNER' } });
  await prisma.user.update({ where: { id: user.id }, data: { primaryOrgId: org.id } });
  return { user, org };
}

const soon  = (days: number) => new Date(Date.now() + days * 864e5);

async function makeLoad(userId: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }, weightKg = 1000) {
  return postLoad(userId, {
    originLat: from.lat, originLng: from.lng,
    destLat:   to.lat,   destLng:   to.lng,
    pickupFrom: soon(1), pickupTo: soon(3),
    weightKg,
  });
}

async function expectRejection(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e: any) { return { http: e?.http, message: e?.message ?? '' }; }
  throw new Error('Expected rejection, but it resolved');
}

beforeAll(async () => { await prisma.$connect(); });

describe('posting and quoting', () => {
  it('posts a load and lets a carrier bid on it', async () => {
    const shipper = await makeOrg('RETAILER', 'Shipper Co');
    const carrier = await makeOrg('CARRIER',  'Haulage Ltd');

    const load = await makeLoad(shipper.user.id, DAR, MWANZA, 2_000);
    expect(load.status).toBe('OPEN');
    expect(load.reference).toMatch(/^LD-/);

    const quote = await quoteOnLoad(carrier.user.id, load.id, { amountMinor: 1_200_000 });
    expect(quote.status).toBe('PENDING');

    // First bid flips the load out of OPEN so the shipper sees activity.
    const after = await prisma.load.findUniqueOrThrow({ where: { id: load.id } });
    expect(after.status).toBe('QUOTED');
  });

  it('replaces a carrier previous bid instead of stacking another', async () => {
    const shipper = await makeOrg('RETAILER', 'Rebid Shipper');
    const carrier = await makeOrg('CARRIER',  'Rebid Carrier');
    const load = await makeLoad(shipper.user.id, DAR, DODOMA);

    await quoteOnLoad(carrier.user.id, load.id, { amountMinor: 900_000 });
    await quoteOnLoad(carrier.user.id, load.id, { amountMinor: 850_000 });

    const quotes = await prisma.quote.findMany({ where: { loadId: load.id } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].amountMinor).toBe(850_000);
  });

  it('refuses a bid from an organization that is not a carrier', async () => {
    const shipper = await makeOrg('RETAILER', 'Guard Shipper');
    const notCarrier = await makeOrg('INDIVIDUAL', 'Just Someone');
    const load = await makeLoad(shipper.user.id, DAR, DODOMA);

    const err = await expectRejection(() => quoteOnLoad(notCarrier.user.id, load.id, { amountMinor: 100 }));
    expect(err.http).toBe(403);
    expect(err.message).toMatch(/carrier/i);
  });

  it('refuses a shipper bidding on their own load', async () => {
    const shipper = await makeOrg('CARRIER', 'Self Dealer');
    const load = await makeLoad(shipper.user.id, DAR, DODOMA);

    const err = await expectRejection(() => quoteOnLoad(shipper.user.id, load.id, { amountMinor: 100 }));
    expect(err.http).toBe(400);
    expect(err.message).toMatch(/your own load/i);
  });
});

describe('awarding', () => {
  it('creates a shipment with a leg and closes the losing bids', async () => {
    const shipper = await makeOrg('RETAILER', 'Award Shipper');
    const winner  = await makeOrg('CARRIER',  'Cheap Haulage');
    const loser   = await makeOrg('CARRIER',  'Pricey Haulage');

    const load = await makeLoad(shipper.user.id, DAR, MWANZA, 3_000);
    const cheap  = await quoteOnLoad(winner.user.id, load.id, { amountMinor: 1_000_000 });
    await quoteOnLoad(loser.user.id, load.id, { amountMinor: 1_500_000 });

    const result = await acceptQuote(shipper.user.id, cheap.id);

    expect(result.load.status).toBe('AWARDED');
    expect(result.shipment.carrierOrgId).toBe(winner.org.id);
    // Freight tracking rides the same Shipment/Leg spine as product delivery.
    expect(result.shipment.legs).toHaveLength(1);
    expect(result.shipment.legs[0].seq).toBe(0);
    expect(result.load.shipmentId).toBe(result.shipment.id);

    // Losers are told, rather than left waiting.
    const quotes = await prisma.quote.findMany({ where: { loadId: load.id } });
    expect(quotes.find(q => q.bidderOrgId === winner.org.id)!.status).toBe('ACCEPTED');
    expect(quotes.find(q => q.bidderOrgId === loser.org.id)!.status).toBe('REJECTED');
  });

  it('lets only the shipper award, and only once', async () => {
    const shipper = await makeOrg('RETAILER', 'Once Shipper');
    const carrier = await makeOrg('CARRIER',  'Once Carrier');
    const other   = await makeOrg('CARRIER',  'Meddler');

    const load  = await makeLoad(shipper.user.id, DAR, DODOMA);
    const quote = await quoteOnLoad(carrier.user.id, load.id, { amountMinor: 500_000 });

    const forbidden = await expectRejection(() => acceptQuote(other.user.id, quote.id));
    expect(forbidden.http).toBe(403);

    await acceptQuote(shipper.user.id, quote.id);
    const again = await expectRejection(() => acceptQuote(shipper.user.id, quote.id));
    expect(again.http).toBe(409);
  });
});

describe('backhaul matching', () => {
  /**
   * A point at fraction `t` along the Dar→Mwanza lane, optionally nudged
   * `offsetLat` degrees off it.
   *
   * Real cities are poor fixtures for this: Morogoro is "on the way" by road
   * but sits ~99 km from the straight Dar–Mwanza line, so a test using it would
   * pass or fail for reasons unrelated to the logic. Interpolating the lane
   * makes each case unambiguous.
   */
  function onLane(t: number, offsetLat = 0) {
    return {
      lat: DAR.lat + (MWANZA.lat - DAR.lat) * t + offsetLat,
      lng: DAR.lng + (MWANZA.lng - DAR.lng) * t,
    };
  }

  async function routeFor(carrierUserId: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }, capacityKgFree = 5_000, corridorKm = 60) {
    const orgId = (await prisma.user.findUniqueOrThrow({ where: { id: carrierUserId } })).primaryOrgId!;
    return prisma.carrierRoute.create({
      data: {
        carrierOrgId: orgId,
        originLat: from.lat, originLng: from.lng,
        destLat:   to.lat,   destLng:   to.lng,
        corridorKm, departsAt: soon(1), capacityKgFree,
      },
    });
  }

  it('matches a load whose pickup and drop both sit on the lane', async () => {
    const shipper = await makeOrg('RETAILER', 'Lane Shipper');
    const carrier = await makeOrg('CARRIER',  'Lane Carrier');

    const load  = await makeLoad(shipper.user.id, onLane(0.3), onLane(0.7), 1_500);
    const route = await routeFor(carrier.user.id, DAR, MWANZA);

    const matches = await matchLoadsForRoute(route.id);

    expect(matches.map(m => m.load.id)).toContain(load.id);
    const m = matches.find(x => x.load.id === load.id)!;
    expect(m.pickupOffsetKm).toBeLessThan(1);   // dead on the lane
    expect(m.dropOffsetKm).toBeLessThan(1);
  });

  it('excludes a load far off the corridor', async () => {
    const shipper = await makeOrg('RETAILER', 'Far Shipper');
    const carrier = await makeOrg('CARRIER',  'Far Carrier');

    // Mtwara is ~900 km south of the Dar -> Mwanza lane.
    const offLane = await makeLoad(shipper.user.id, MTWARA, DODOMA, 500);
    const route   = await routeFor(carrier.user.id, DAR, MWANZA);

    const matches = await matchLoadsForRoute(route.id);
    expect(matches.map(m => m.load.id)).not.toContain(offLane.id);
  });

  it('excludes a load running the opposite way down the same lane', async () => {
    // The case endpoint-distance matching gets wrong. BOTH ends sit exactly on
    // the corridor, so only the direction check can reject it: the cargo travels
    // back towards Dar while the truck heads to Mwanza.
    const shipper = await makeOrg('RETAILER', 'Reverse Shipper');
    const carrier = await makeOrg('CARRIER',  'Reverse Carrier');

    const backwards = await makeLoad(shipper.user.id, onLane(0.7), onLane(0.3), 800);
    const forwards  = await makeLoad(shipper.user.id, onLane(0.3), onLane(0.7), 800);
    const route     = await routeFor(carrier.user.id, DAR, MWANZA);

    const matches = await matchLoadsForRoute(route.id);
    const ids = matches.map(m => m.load.id);

    expect(ids).toContain(forwards.id);        // control: same corridor, right way
    expect(ids).not.toContain(backwards.id);
  });

  it('excludes a load heavier than the spare capacity', async () => {
    const shipper = await makeOrg('RETAILER', 'Heavy Shipper');
    const carrier = await makeOrg('CARRIER',  'Small Truck');

    const heavy = await makeLoad(shipper.user.id, onLane(0.3), onLane(0.7), 9_000);
    const route = await routeFor(carrier.user.id, DAR, MWANZA, 2_000);

    const matches = await matchLoadsForRoute(route.id);
    expect(matches.map(m => m.load.id)).not.toContain(heavy.id);
  });

  it('never offers a carrier their own load', async () => {
    const carrier = await makeOrg('CARRIER', 'Self Match');
    const own   = await makeLoad(carrier.user.id, onLane(0.3), onLane(0.7), 500);
    const route = await routeFor(carrier.user.id, DAR, MWANZA);

    const matches = await matchLoadsForRoute(route.id);
    expect(matches.map(m => m.load.id)).not.toContain(own.id);
  });

  it('ranks the least detour first', async () => {
    const shipper = await makeOrg('RETAILER', 'Rank Shipper');
    const carrier = await makeOrg('CARRIER',  'Rank Carrier');

    const near = await makeLoad(shipper.user.id, onLane(0.3),        onLane(0.7), 500);
    const far  = await makeLoad(shipper.user.id, onLane(0.3, -0.35), onLane(0.7), 500);
    const route = await routeFor(carrier.user.id, DAR, MWANZA, 5_000, 120);

    const matches = await matchLoadsForRoute(route.id);
    const ids = matches.map(m => m.load.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(far.id);
    expect(ids.indexOf(near.id)).toBeLessThan(ids.indexOf(far.id));
  });

  it('works from the other direction: carriers already running a suitable lane', async () => {
    const shipper = await makeOrg('RETAILER', 'Mirror Shipper');
    const carrier = await makeOrg('CARRIER',  'Mirror Carrier');

    const route = await routeFor(carrier.user.id, DAR, MWANZA);
    const load  = await makeLoad(shipper.user.id, onLane(0.3), onLane(0.7), 1_000);

    const carriers = await matchRoutesForLoad(load.id);
    expect(carriers.map(c => c.route.id)).toContain(route.id);
  });
});
