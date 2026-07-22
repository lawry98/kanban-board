/**
 * Canonical app route paths. Centralised so redirect targets stay in sync across
 * the proxy, the auth callback, the client error catcher, and the auth pages —
 * the same "defined once, cannot drift between call sites" rule the sanitiser below
 * follows. `as const` preserves the literal types Next's typed `Route` links expect.
 */
export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  authCodeError: '/auth-code-error',
  authCallback: '/auth/callback',
  boards: '/boards',
} as const;

/**
 * `?error=` codes the app sets on its OWN auth redirects — distinct from GoTrue's
 * `error_code` on a failed email link. The login page maps these to friendly copy.
 */
export const AUTH_ERROR = {
  callbackFailed: 'auth_callback_failed',
} as const;

/** Login URL carrying one of the app's own error codes for the login page to show. */
export function loginWithError(code: string): string {
  return `${ROUTES.login}?error=${code}`;
}

/** Where an authenticated user lands when no explicit destination is given. */
export const DEFAULT_REDIRECT = ROUTES.boards;

/**
 * Only same-origin relative paths are allowed as a post-login destination.
 *
 * A raw `${origin}${next}` concatenation is an open redirect: `?next=@evil.com`
 * yields `https://app.example.com@evil.com`, a valid absolute URL whose host is
 * the attacker's. Protocol-relative (`//evil.com`) and backslash (`/\evil.com`)
 * forms are rejected for the same reason.
 *
 * Shared by the OAuth callback, the login/register pages, and the join flow so
 * the guard is defined once and cannot drift between call sites.
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_REDIRECT;
  if (!next.startsWith('/')) return DEFAULT_REDIRECT;
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_REDIRECT;
  return next;
}
