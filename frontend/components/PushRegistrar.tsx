'use client';

import { useEffect } from 'react';
import { registerPush } from '../lib/usePushNotifications';

/**
 * Mounts invisibly in the app layout.
 * Registers the service worker and push subscription when the user is logged in.
 * Safe to render on every page — deduplicates internally.
 */
export default function PushRegistrar() {
  useEffect(() => {
    // Only register if the user is logged in (has an access token)
    const token = localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt');
    if (token) {
      // Small delay so the page renders first
      const t = setTimeout(() => registerPush(), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  return null; // renders nothing
}
