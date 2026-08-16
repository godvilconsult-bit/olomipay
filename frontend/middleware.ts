import { NextRequest, NextResponse } from 'next/server';

// ── Public routes — accessible WITHOUT authentication ─────────────────────────
const PUBLIC_PATHS = [
  '/',
  '/welcome',
  '/auth/login',
  '/auth/register',
];

// Prefixes that are always public
//
// /shop is the catalog-first storefront. It MUST stay unauthenticated: a
// login-gated catalog cannot be indexed by search engines and cannot be shared
// as a link, which removes the cheapest acquisition channel a marketplace has.
// Browsing is public; checking out still requires an account.
const PUBLIC_PREFIXES = ['/auth/', '/_next/', '/api/', '/shop', '/icon', '/logo', '/manifest', '/sw.js'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public routes and static assets
  if (isPublic(pathname)) return NextResponse.next();

  // Check for the session cookie set by setTokens() in api.ts
  const hasSession = req.cookies.has('jiko_session');

  if (!hasSession) {
    // Redirect unauthenticated users to the LOGIN page — never to '/'.
    // The landing page redirects authed-looking users to /dashboard, so if we
    // sent them back to '/' here, a cookie/token mismatch would ping-pong
    // forever (/ ↔ /dashboard), freezing the app. /auth/login has no such
    // redirect, so it's a safe terminal.
    const url = req.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', pathname); // so we can return after login
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.js|.*\\.css).*)'],
};
