/** Geospatial helpers for vendor discovery, delivery distance, and ETAs. */

const R = 6371; // earth radius km

/** Great-circle distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough delivery ETA in minutes for a boda-boda: ~24 km/h + 6 min handling. */
export function etaMinutes(km: number): number {
  return Math.max(8, Math.round((km / 24) * 60) + 6);
}

export interface PathProjection {
  /** Perpendicular distance from the point to the lane, in km. */
  distanceKm: number;
  /** Position along the lane: 0 at origin, 1 at destination. */
  t: number;
}

/**
 * Project a point onto the straight lane between two points.
 *
 * Used for freight backhaul matching: a load is "on the way" when both its
 * pickup and its drop lie within the carrier's corridor AND the pickup comes
 * before the drop along the direction of travel. Comparing endpoint distances
 * alone would wrongly match a load running the opposite way down the same road.
 *
 * Uses an equirectangular projection around the lane's midpoint. Over corridor
 * widths (tens of km) the distortion is far below the tolerance being tested,
 * and it avoids the cost and complexity of true geodesic cross-track distance.
 */
export function projectOntoPath(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): PathProjection {
  const KM_PER_DEG_LAT = 110.574;
  const refLat  = ((aLat + bLat) / 2) * Math.PI / 180;
  const kmPerLng = 111.320 * Math.cos(refLat);

  const toXY = (lat: number, lng: number) => ({ x: lng * kmPerLng, y: lat * KM_PER_DEG_LAT });
  const A = toXY(aLat, aLng);
  const B = toXY(bLat, bLng);
  const P = toXY(pLat, pLng);

  const vx = B.x - A.x, vy = B.y - A.y;
  const lenSq = vx * vx + vy * vy;

  // Degenerate lane (origin === destination): fall back to point distance.
  if (lenSq === 0) return { distanceKm: haversineKm(pLat, pLng, aLat, aLng), t: 0 };

  const rawT = ((P.x - A.x) * vx + (P.y - A.y) * vy) / lenSq;
  const t    = Math.max(0, Math.min(1, rawT));

  const cx = A.x + t * vx, cy = A.y + t * vy;
  const dx = P.x - cx,     dy = P.y - cy;

  return { distanceKm: Math.sqrt(dx * dx + dy * dy), t };
}
