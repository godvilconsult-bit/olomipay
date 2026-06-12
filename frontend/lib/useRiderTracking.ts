'use client';

import { useEffect, useRef } from 'react';
import { watchDeviceLocation, type DeviceLocation } from './location';

interface Opts {
  /** Only watch while true (e.g. rider is ONLINE / on an active job). */
  enabled: boolean;
  /** Called with each fresh fix, throttled to `minIntervalMs`. */
  onUpdate: (loc: DeviceLocation) => void;
  onError?: (e: any) => void;
  /** Minimum gap between forwarded updates (battery + bandwidth). Default 3s. */
  minIntervalMs?: number;
}

/**
 * Live GPS tracking for riders (Uber/Bolt-style). Uses watchPosition with high
 * accuracy via the native-aware location layer (Capacitor plugin on the app,
 * navigator.geolocation on the web), throttles forwarding, and tears the watch
 * down the moment `enabled` goes false — so tracking stops when the rider goes
 * offline or the delivery completes (no background battery drain).
 */
export function useRiderTracking({ enabled, onUpdate, onError, minIntervalMs = 3000 }: Opts) {
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef  = useRef(onError);
  const lastRef     = useRef(0);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    watchDeviceLocation(
      (loc) => {
        const now = Date.now();
        if (now - lastRef.current < minIntervalMs) return;
        lastRef.current = now;
        onUpdateRef.current(loc);
      },
      (e) => onErrorRef.current?.(e),
    ).then((c) => { cancelled ? c() : (cleanup = c); });

    return () => { cancelled = true; cleanup?.(); };
  }, [enabled, minIntervalMs]);
}
