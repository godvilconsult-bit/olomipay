'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Placed on the landing page.
 * If the user already has a valid session, bounce them straight to /dashboard.
 * Renders nothing — invisible redirect.
 */
export default function AlreadyAuthed() {
  const router = useRouter();
  useEffect(() => {
    const hasToken  = !!(localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
    const hasCookie = document.cookie.includes('olomipay_session=1');

    // CRITICAL: the middleware gates routes on the COOKIE only. If a token
    // exists but the cookie is gone (expired / cleared / blocked), redirecting
    // to /dashboard gets bounced right back here by the middleware — an
    // infinite /↔/dashboard loop that freezes the page. Re-establish the cookie
    // first so both sides agree before we redirect.
    if (hasToken && !hasCookie) {
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `olomipay_session=1; path=/; expires=${expires}; SameSite=Lax`;
    }

    // Redirect only when we have (or just restored) the cookie. A visitor with
    // neither token nor cookie simply stays on the landing page.
    if (hasToken || hasCookie) router.replace('/dashboard');
  }, [router]);
  return null;
}
