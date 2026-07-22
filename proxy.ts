import { NextResponse } from 'next/server';

import { ROUTES } from '@/lib/auth/redirects';
import { updateSession } from '@/lib/supabase/middleware';

import type { NextRequest } from 'next/server';

/**
 * Deny-by-default route protection.
 *
 * Anything not listed here requires an authenticated session. Route groups such
 * as `app/(dashboard)/` are NOT URL segments, so a prefix allowlist would silently
 * leave every newly added dashboard route unprotected at the edge.
 */
export const PUBLIC_ROUTES = [
  ROUTES.home,
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
  ROUTES.authCodeError,
] as const;

/**
 * Public prefixes — everything below these paths is reachable without a session.
 * `/join/` is public so a logged-out invitee can reach the join page, which then
 * routes them to sign in (carrying `?next` back to the same link).
 */
export const PUBLIC_ROUTE_PREFIXES = ['/auth/', '/join/'] as const;

/** Signed-in users are bounced away from these to the app. */
export const AUTH_ROUTES = [ROUTES.login, ROUTES.register] as const;

/** Where authenticated users land when they hit an auth route. */
export const DEFAULT_AUTHENTICATED_ROUTE = ROUTES.boards;

/** Where unauthenticated users are sent when they hit a protected route. */
export const LOGIN_ROUTE = ROUTES.login;

export function isPublicRoute(pathname: string): boolean {
  return (
    (PUBLIC_ROUTES as readonly string[]).includes(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function isAuthRoute(pathname: string): boolean {
  return (AUTH_ROUTES as readonly string[]).includes(pathname);
}

/**
 * Carries the session cookies rotated by `updateSession` onto a redirect.
 * Returning a fresh `NextResponse.redirect()` without this drops the rotated
 * refresh token, killing the session or wedging the user in a redirect loop.
 */
function redirectWithCookies(source: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    return redirectWithCookies(response, new URL(LOGIN_ROUTE, request.url));
  }

  if (user && isAuthRoute(pathname)) {
    return redirectWithCookies(response, new URL(DEFAULT_AUTHENTICATED_ROUTE, request.url));
  }

  return response;
}

export const config = {
  // Exclusions are anchored to genuine static asset locations: the `_next/`
  // build output and single-segment files at the root, which is exactly where
  // `public/` assets are served from. An unanchored `.*\.png$` style exclusion
  // would let an application route such as `/board/abc.png` bypass the proxy —
  // and with deny-by-default protection, bypassing the proxy means bypassing
  // authentication.
  matcher: [
    '/((?!_next/|favicon\\.ico$|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
