'use client';

import { usePathname } from 'next/navigation';

// Public pages that must NOT have the sidebar margin offset
const PUBLIC_PREFIXES = ['/', '/auth/', '/claim/', '/join/'];
const PUBLIC_EXACT    = ['/', '/scan'];

function isPublic(path: string): boolean {
  if (PUBLIC_EXACT.includes(path)) return true;
  return ['/auth/', '/claim/', '/join/'].some(p => path.startsWith(p));
}

/**
 * Wraps page content.
 * On authenticated pages: adds lg:ml-64 offset for the sidebar.
 * On public pages (landing, auth, claim, join): no offset — full-width.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className={isPublic(path) ? '' : 'lg:ml-64'}>
      {children}
    </div>
  );
}
