/** Where an authenticated user lands when no explicit destination is given. */
export const DEFAULT_REDIRECT = '/boards';

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
