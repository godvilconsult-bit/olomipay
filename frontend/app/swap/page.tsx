'use client';

// Swap (USDC ↔ XLM) has been removed — OlomiPay uses a single USD balance and
// users never hold or trade XLM. This route now just redirects to the dashboard.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SwapRemovedPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
