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
    const hasSession =
      sessionStorage.getItem('olomipay_at') ||
      sessionStorage.getItem('olomipay_rt') ||
      document.cookie.includes('olomipay_session=1');
    if (hasSession) router.replace('/dashboard');
  }, [router]);
  return null;
}
