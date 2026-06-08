'use client';

/**
 * Tiny haptic helper. Uses the Web Vibration API, which works in Android Chrome
 * and the Capacitor Android WebView (needs the VIBRATE permission in the native
 * manifest — Capacitor includes it by default). No-ops silently where vibration
 * isn't available (e.g. iOS Safari) so it's always safe to call.
 */
export function tapHaptic(ms = 8): void {
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(ms);
  } catch { /* ignore */ }
}

/** A celebratory double-pulse for a completed action (e.g. signed in). */
export function successHaptic(): void {
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.vibrate === 'function') nav.vibrate([18, 60, 35]);
  } catch { /* ignore */ }
}
