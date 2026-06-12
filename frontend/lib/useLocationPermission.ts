'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureLocationPermission, getDeviceLocation, getPermissionState, isNativePlatform,
  type DeviceLocation, type PermState,
} from './location';

export type LocationPermStatus = 'checking' | PermState; // checking | granted | denied | prompt | unsupported

export type OS = 'ios' | 'android' | 'desktop';
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';

export interface DeviceInfo {
  os: OS;
  browser: Browser;
  isNative: boolean;
  isPWA: boolean;
  isSecure: boolean;
}

/** Best-effort UA sniff — only used to tailor the "how to re-enable" copy. */
export function detectDevice(): DeviceInfo {
  if (typeof navigator === 'undefined') return { os: 'desktop', browser: 'other', isNative: false, isPWA: false, isSecure: true };
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const os: OS = iOS ? 'ios' : android ? 'android' : 'desktop';

  let browser: Browser = 'other';
  if (/Edg|EdgiOS/.test(ua)) browser = 'edge';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome/.test(ua)) browser = 'chrome';
  else if (/Safari/.test(ua)) browser = 'safari';

  const isPWA = (typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)) || false;
  const isSecure = typeof window === 'undefined' ? true : (window.isSecureContext ?? location.protocol === 'https:');

  return { os, browser, isNative: false, isPWA, isSecure };
}

/**
 * Production location-permission state machine for the PWA.
 *
 * - Reads the current permission without prompting (Permissions API on web,
 *   Capacitor checkPermissions on native) and keeps it live via `onchange`.
 * - `request()` triggers the real OS/browser prompt from a user gesture.
 * - Exposes device/browser info so the UI can show the right re-enable steps.
 * - Flags insecure (non-HTTPS) origins, where geolocation is blocked.
 */
export function useLocationPermission() {
  const [status, setStatus] = useState<LocationPermStatus>('checking');
  const [coords, setCoords] = useState<DeviceLocation | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceInfo>(() => detectDevice());
  const [requesting, setRequesting] = useState(false);
  const queryRef = useRef<any>(null);

  // Initial detection + live monitoring via the Permissions API.
  useEffect(() => {
    let alive = true;
    (async () => {
      const native = await isNativePlatform();
      const base = detectDevice();
      if (alive) setDevice({ ...base, isNative: native });

      // Browsers block geolocation entirely on insecure origins.
      if (!native && !base.isSecure) { if (alive) setStatus('unsupported'); return; }

      const s = await getPermissionState();
      if (alive) setStatus(s);

      // Subscribe to live permission changes on the web.
      if (!native && typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
        try {
          const q = await (navigator as any).permissions.query({ name: 'geolocation' });
          queryRef.current = q;
          q.onchange = () => { if (alive) setStatus(q.state); };
        } catch { /* Permissions API absent (older Safari) — that's fine */ }
      }
    })();
    return () => { alive = false; if (queryRef.current) queryRef.current.onchange = null; };
  }, []);

  /** Trigger the native/browser permission prompt. Call from a click handler. */
  const request = useCallback(async () => {
    setError(null);
    setRequesting(true);
    try {
      await ensureLocationPermission();         // native OS dialog
      const loc = await getDeviceLocation();    // web prompt + first fix
      setCoords(loc);
      setStatus('granted');
      return loc;
    } catch (e: any) {
      // GeolocationPositionError: 1 = denied, 2 = unavailable, 3 = timeout
      const denied = e?.code === 1 || /denied|permission/i.test(e?.message ?? '');
      setStatus(denied ? 'denied' : 'prompt');
      setError(
        e?.code === 3 ? 'Location timed out. Move to open sky and retry.' :
        e?.code === 2 ? 'Location is unavailable right now. Retry in a moment.' :
        denied ? 'Location permission was blocked.' :
        (e?.message ?? 'Could not get your location.'),
      );
      return null;
    } finally {
      setRequesting(false);
    }
  }, []);

  return {
    status, coords, error, device, requesting,
    request, retry: request,
    isGranted: status === 'granted',
  };
}
