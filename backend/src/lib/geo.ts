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
