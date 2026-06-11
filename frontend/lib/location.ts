'use client';

export interface DeviceLocation { lat: number; lng: number; accuracy: number }

/**
 * Get the device's CURRENT position at high accuracy. `maximumAge: 0` forces a
 * fresh fix (no stale cached value), which is what fixes "different location on
 * different pages". Falls back to a lower-accuracy reading if the precise one
 * times out, so we still return something usable.
 */
export function getDeviceLocation(opts?: { timeout?: number }): Promise<DeviceLocation> {
  const timeout = opts?.timeout ?? 15000;
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    const ok = (p: GeolocationPosition) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    navigator.geolocation.getCurrentPosition(ok, () => {
      // Retry once without high accuracy (some indoor/PC devices fail the precise fix).
      navigator.geolocation.getCurrentPosition(ok, reject, { enableHighAccuracy: false, timeout, maximumAge: 30000 });
    }, { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

/** Distance in metres between two lat/lng points. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

export function prettyDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}
