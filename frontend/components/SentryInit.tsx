'use client';

import { useEffect } from 'react';

/**
 * Lightweight client-side error tracking. Initialises Sentry only if
 * NEXT_PUBLIC_SENTRY_DSN is set — otherwise it's a complete no-op. Dynamically
 * imported so it never affects the bundle/build when unused.
 */
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          tracesSampleRate: 0.1,
          environment: process.env.NODE_ENV ?? 'production',
        });
      })
      .catch(() => {});
  }, []);
  return null;
}
