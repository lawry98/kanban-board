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

/** Parse base for `sanitizeNext`; `.invalid` can never resolve. */
const SENTINEL_ORIGIN = 'http://n.invalid';

/**
 * Only same-origin relative paths are allowed as a post-login destination.
 *
 * A raw `${origin}${next}` concatenation is an open redirect: `?next=@evil.com`
 * yields `https://app.example.com@evil.com`, a valid absolute URL whose host is
 * the attacker's. Protocol-relative (`//evil.com`) and backslash (`/\evil.com`)
 * forms are rejected for the same reason.
 *
 * Prefix checks alone are not enough, because the destination is later resolved
 * by the WHATWG URL parser, which strips tab/CR/LF anywhere in the input: a
 * `/\t/evil.com` passes a `startsWith('//')` test yet parses as `//evil.com`.
 * So every C0 control, DEL and backslash is rejected outright, and the value is
 * then normalised through the parser itself: a result that leaves the sentinel
 * origin, or whose normalised path starts with `//` (`/..//x`, `/.//x`), falls
 * back to the default. The returned string is the parser's normalised
 * path + query + hash, so what is validated is what is used.
 *
 * Shared by the proxy, the OAuth callback, and the login/register pages so the guard
 * is defined once and cannot drift between call sites. The join page doesn't call it:
 * it only builds `?next=/join/<token>` links, which those auth pages re-check.
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return DEFAULT_REDIRECT;
  // The URL parser silently strips tab/CR/LF, so '/\t/evil.com' would become
  // '//evil.com'. Reject every C0 control, DEL and backslash outright.
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return DEFAULT_REDIRECT;

  let url: URL;
  try {
    url = new URL(next, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (url.origin !== SENTINEL_ORIGIN) return DEFAULT_REDIRECT;

  const normalized = url.pathname + url.search + url.hash;
  // '/..//x' and '/.//x' normalize to '//x', protocol-relative if reused as a path.
  return normalized.startsWith('//') ? DEFAULT_REDIRECT : normalized;
}
