import { NextRequest, NextResponse } from 'next/server';

// ── Public routes — accessible WITHOUT authentication ─────────────────────────
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/register',
  '/join',
  '/scan',          // QR scanner — allow unauthenticated scanning
];

// Prefixes that are always public (e.g. /claim/abc123, /join/xyz)
const PUBLIC_PREFIXES = ['/claim/', '/join/', '/auth/', '/_next/', '/api/', '/icon', '/logo', '/manifest', '/sw.js'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public routes and static assets
  if (isPublic(pathname)) return NextResponse.next();

  // Check for the session cookie set by setTokens() in api.ts
  const hasSession = req.cookies.has('olomipay_session');

  if (!hasSession) {
    // Redirect unauthenticated users to the landing page
    const url = req.nextUrl.clone();
    url.pathname = '/';
    // Preserve the originally-requested URL so we can redirect back after login
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.js|.*\\.css).*)'],
};
