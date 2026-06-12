'use client';

export interface DeviceLocation { lat: number; lng: number; accuracy: number }

/**
 * Location layer that works in BOTH the browser AND the native Capacitor app.
 *
 * In the Android/iOS app we MUST use the @capacitor/geolocation plugin — the
 * web `navigator.geolocation` API does not trigger the native runtime
 * permission dialog inside a WebView, so on a phone it silently fails. The
 * plugin's requestPermissions() shows the real OS "Allow location" prompt.
 */

let _cap: { isNative: boolean; Geolocation?: any } | null = null;
async function cap() {
  if (_cap) return _cap;
  try {
    const core: any = await import('@capacitor/core');
    const isNative = !!core?.Capacitor?.isNativePlatform?.();
    if (isNative) {
      const geo: any = await import('@capacitor/geolocation');
      _cap = { isNative: true, Geolocation: geo.Geolocation };
    } else {
      _cap = { isNative: false };
    }
  } catch { _cap = { isNative: false }; }
  return _cap;
}

/**
 * Ensure we have location permission. On native this shows the OS prompt the
 * first time. Returns true if granted. Safe to call early (auto-prompt).
 */
export async function ensureLocationPermission(): Promise<boolean> {
  const c = await cap();
  if (c.isNative && c.Geolocation) {
    try {
      let perm = await c.Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        perm = await c.Geolocation.requestPermissions({ permissions: ['location'] });
      }
      return perm.location === 'granted' || perm.coarseLocation === 'granted';
    } catch { return false; }
  }
  // Web: there's no silent request; permission is requested when we read a position.
  return true;
}

/** Get the device's CURRENT position at high accuracy (fresh fix). */
export async function getDeviceLocation(opts?: { timeout?: number }): Promise<DeviceLocation> {
  const timeout = opts?.timeout ?? 15000;
  const c = await cap();

  if (c.isNative && c.Geolocation) {
    await ensureLocationPermission();
    const p = await c.Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout, maximumAge: 0 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
  }

  // Browser fallback
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    const ok = (p: GeolocationPosition) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    navigator.geolocation.getCurrentPosition(ok, () => {
      navigator.geolocation.getCurrentPosition(ok, reject, { enableHighAccuracy: false, timeout, maximumAge: 30000 });
    }, { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

/**
 * Continuously watch position (real-time GPS, e.g. for live rider tracking).
 * Returns a cleanup function. Works on native (plugin) and web.
 */
export async function watchDeviceLocation(
  onUpdate: (loc: DeviceLocation) => void,
  onError?: (e: any) => void,
): Promise<() => void> {
  const c = await cap();

  if (c.isNative && c.Geolocation) {
    await ensureLocationPermission();
    const id = await c.Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (p: any, err: any) => {
      if (err) { onError?.(err); return; }
      if (p) onUpdate({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    });
    return () => { try { c.Geolocation.clearWatch({ id }); } catch {} };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) { onError?.(new Error('Geolocation unavailable')); return () => {}; }
  const wid = navigator.geolocation.watchPosition(
    p => onUpdate({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    e => onError?.(e),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
  return () => navigator.geolocation.clearWatch(wid);
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
