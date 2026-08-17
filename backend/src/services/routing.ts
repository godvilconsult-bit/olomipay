/**
 * Road routing behind a provider interface.
 *
 * Today the frontend calls router.project-osrm.org directly from the browser,
 * re-fetching every time a rider moves. Three problems with that:
 *
 *   1. That host is OSRM's demo server. Its usage policy forbids production
 *      traffic and it is rate-limited with no SLA — it is the single biggest
 *      obstacle to running this anywhere real.
 *   2. A route between two fixed points does not change as the rider moves, so
 *      recomputing it per ping is wasted work on the shopper's data plan.
 *   3. Only the Leaflet engine did it at all; the Google engine drew no route.
 *
 * Routing moves here so it is computed once per leg, cached on the row, and
 * swappable: point JIKO_OSRM_URL at a self-hosted OSRM or Valhalla, or add a
 * provider for Mapbox, without touching any caller.
 */
import { haversineKm, etaMinutes } from '../lib/geo';

export interface LatLng { lat: number; lng: number }

export interface RouteResult {
  /** Encoded polyline (precision 5), ready for Leaflet or Google to decode. */
  polyline: string;
  distanceM: number;
  durationS: number;
  /** False when this is the straight-line fallback rather than a real road route. */
  snapped: boolean;
  provider: string;
}

export interface RoutingProvider {
  readonly name: string;
  route(from: LatLng, to: LatLng): Promise<RouteResult | null>;
}

// ── Polyline encoding ────────────────────────────────────────────────────────
// Google's algorithm. Implemented here rather than pulled in as a dependency:
// it is ~20 lines and both map engines can decode it.

function encodeSigned(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(points: LatLng[]): string {
  const out: string[] = [];
  let prevLat = 0, prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    encodeSigned(lat - prevLat, out);
    encodeSigned(lng - prevLng, out);
    prevLat = lat; prevLng = lng;
  }
  return out.join('');
}

// ── OSRM ─────────────────────────────────────────────────────────────────────

const DEFAULT_OSRM = 'https://router.project-osrm.org';

class OsrmProvider implements RoutingProvider {
  readonly name = 'osrm';
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 6_000) {}

  async route(from: LatLng, to: LatLng): Promise<RouteResult | null> {
    const url = `${this.baseUrl}/route/v1/driving/`
      + `${from.lng},${from.lat};${to.lng},${to.lat}`
      + `?overview=full&geometries=polyline`;

    // A slow router must never hold up an order or a tracking response; the
    // caller falls back to a straight line.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const data: any = await res.json();
      const leg = data?.routes?.[0];
      if (!leg?.geometry) return null;
      return {
        polyline:  leg.geometry,
        distanceM: Math.round(leg.distance ?? 0),
        durationS: Math.round(leg.duration ?? 0),
        snapped:   true,
        provider:  this.name,
      };
    } catch {
      return null;   // timeout, DNS, rate limit — all handled the same way
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Straight line, so a map always has something to draw. */
class StraightLineProvider implements RoutingProvider {
  readonly name = 'straight-line';
  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
    return {
      polyline:  encodePolyline([from, to]),
      distanceM: Math.round(km * 1000),
      durationS: etaMinutes(km) * 60,
      snapped:   false,
      provider:  this.name,
    };
  }
}

const osrmUrl = (process.env.JIKO_OSRM_URL ?? DEFAULT_OSRM).replace(/\/+$/, '');

if (osrmUrl === DEFAULT_OSRM && process.env.NODE_ENV === 'production') {
  // Loud on purpose: this is a correctness-of-operations problem, not a nicety.
  console.warn(
    '[routing] Using the public OSRM demo server in production. Its usage policy ' +
    'forbids this and it is rate-limited. Set JIKO_OSRM_URL to a self-hosted instance.',
  );
}

const primary  = new OsrmProvider(osrmUrl);
const fallback = new StraightLineProvider();

// ── Cache ────────────────────────────────────────────────────────────────────
// Routes between two fixed points are stable, so an in-process cache absorbs the
// repeat lookups that a tracking screen generates. Coordinates are rounded to
// ~11 m so tiny GPS jitter still hits the same entry.

const CACHE_MAX = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: RouteResult }>();

const key = (a: LatLng, b: LatLng) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

/**
 * Road route between two points, cached. Never throws and never returns null:
 * a failed provider degrades to a straight line so callers stay simple.
 */
export async function getRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const k = key(from, to);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const result = (await primary.route(from, to)) ?? (await fallback.route(from, to));

  if (cache.size >= CACHE_MAX) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(k, { at: Date.now(), value: result });
  return result;
}

export const routingProviderName = primary.name;
export const usingPublicDemoServer = osrmUrl === DEFAULT_OSRM;
