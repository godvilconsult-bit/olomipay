'use client';

export interface DeviceLocation { lat: number; lng: number; accuracy: number }
export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Location layer that works in BOTH the browser AND the native Capacitor app.
 *
 * Preferred path on a phone is the @capacitor/geolocation plugin — it shows the
 * real OS "Allow location" dialog. BUT if that plugin isn't compiled into the
 * APK (older build / missing native module → "not implemented on android"), we
 * must NOT hard-fail: we fall back to the WebView's own navigator.geolocation
 * so the app keeps working. Every native call below is wrapped so a missing or
 * broken plugin transparently degrades to the web implementation.
 */

let _cap: { isNative: boolean; Geolocation?: any } | null = null;
async function cap() {
  if (_cap) return _cap;
  try {
    const core: any = await import('@capacitor/core');
    const isNative = !!core?.Capacitor?.isNativePlatform?.();
    if (isNative) {
      try {
        const geo: any = await import('@capacitor/geolocation');
        _cap = { isNative: true, Geolocation: geo.Geolocation };
      } catch {
        // Plugin JS not bundled — still native, but we'll use the web fallback.
        _cap = { isNative: true };
      }
    } else {
      _cap = { isNative: false };
    }
  } catch { _cap = { isNative: false }; }
  return _cap;
}

// ── Web (navigator.geolocation) implementations — also the native fallback ───────
function webGetPosition(timeout: number): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    const ok = (p: GeolocationPosition) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    // High-accuracy first; on failure retry with a looser/cached fix before giving up.
    navigator.geolocation.getCurrentPosition(ok, () => {
      navigator.geolocation.getCurrentPosition(ok, reject, { enableHighAccuracy: false, timeout, maximumAge: 30000 });
    }, { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

function webWatch(onUpdate: (l: DeviceLocation) => void, onError?: (e: any) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) { onError?.(new Error('Geolocation unavailable')); return () => {}; }
  const wid = navigator.geolocation.watchPosition(
    p => onUpdate({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    e => onError?.(e),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
  return () => navigator.geolocation.clearWatch(wid);
}

/**
 * Ensure we have location permission. On native this shows the OS prompt the
 * first time. Returns true if granted (or if we should let the web path try).
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
    } catch {
      // Plugin missing/unavailable → let the WebView geolocation handle it.
      return true;
    }
  }
  // Web: permission is requested when we read a position.
  return true;
}

/**
 * Read the current permission WITHOUT prompting. Native uses the plugin's
 * checkPermissions(); web uses the Permissions API when available. If the
 * native plugin is missing we return 'prompt' so the UI offers "Enable" and the
 * web fallback can then request it.
 */
export async function getPermissionState(): Promise<PermState> {
  const c = await cap();
  if (c.isNative && c.Geolocation) {
    try {
      const p = await c.Geolocation.checkPermissions();
      const v = p.location ?? p.coarseLocation;
      return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt';
    } catch { return 'prompt'; }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  const anyNav = navigator as any;
  if (anyNav.permissions?.query) {
    try { const p = await anyNav.permissions.query({ name: 'geolocation' }); return p.state as PermState; }
    catch { return 'prompt'; }
  }
  return 'prompt';
}

/** True on a real native (Capacitor) build. */
export async function isNativePlatform(): Promise<boolean> {
  const c = await cap();
  return c.isNative;
}

/** Get the device's CURRENT position at high accuracy (fresh fix). */
export async function getDeviceLocation(opts?: { timeout?: number }): Promise<DeviceLocation> {
  const timeout = opts?.timeout ?? 15000;
  const c = await cap();

  if (c.isNative && c.Geolocation) {
    try {
      await ensureLocationPermission();
      const p = await c.Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout, maximumAge: 0 });
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    } catch {
      // Native plugin missing/failed → fall back to the WebView's geolocation.
      return webGetPosition(timeout);
    }
  }
  return webGetPosition(timeout);
}

/**
 * Continuously watch position (real-time GPS, e.g. for live rider tracking).
 * Returns a cleanup function. Native plugin preferred; falls back to web.
 */
export async function watchDeviceLocation(
  onUpdate: (loc: DeviceLocation) => void,
  onError?: (e: any) => void,
): Promise<() => void> {
  const c = await cap();

  if (c.isNative && c.Geolocation) {
    try {
      await ensureLocationPermission();
      const id = await c.Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (p: any, err: any) => {
        if (err) { onError?.(err); return; }
        if (p) onUpdate({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      });
      return () => { try { c.Geolocation.clearWatch({ id }); } catch {} };
    } catch {
      // Plugin missing/failed → fall back to the WebView's geolocation watch.
      return webWatch(onUpdate, onError);
    }
  }
  return webWatch(onUpdate, onError);
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
