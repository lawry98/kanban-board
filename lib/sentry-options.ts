import type * as Sentry from '@sentry/nextjs';

type SentryInitOptions = Parameters<typeof Sentry.init>[0];

/**
 * `/join/<token>` with the separators raw (`/`) or percent-encoded once or more (`%2F`, `%252F`),
 * so it also matches inside an encoded `?next=` value. Tokens are base64url
 * (app/actions/invitation-actions.ts), so the match stops at the first character outside that
 * alphabet and never swallows a following delimiter or punctuation.
 */
const INVITE_TOKEN_PATH = /(\/|%(?:25)*2F)join(\/|%(?:25)*2F)[A-Za-z0-9_-]+/gi;

/**
 * Invite tokens are reusable secrets (app/actions/invitation-actions.ts) and sit in the
 * `/join/<token>` path and in `?next=%2Fjoin%2F<token>`. The SDK does not filter URL paths, so
 * this rewrites the token to `[token]` wherever it appears in a string.
 */
export function redactInviteTokens(value: string): string {
  return value.replace(INVITE_TOKEN_PATH, '$1join$2[token]');
}

/**
 * Returns a copy of a payload with `redactInviteTokens` applied to every string. Only plain objects
 * and arrays are walked; anything else (class instances, Errors) is passed through as is. The input
 * is never mutated, because console breadcrumbs carry the app's live values. `copies` maps each
 * original to its copy, so shared and circular references resolve to the scrubbed copy.
 */
function scrubInviteTokens<T>(value: T, copies = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') return redactInviteTokens(value) as T;
  if (typeof value !== 'object' || value === null) return value;
  if (copies.has(value)) return copies.get(value) as T;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) copy.push(scrubInviteTokens(item, copies));
    return copy as T;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = scrubInviteTokens(item, copies);
  return copy as T;
}

/**
 * Options shared by the server, edge and client `Sentry.init` calls; each call adds only its DSN.
 *
 * SDK v11 collects user info, cookies, headers, request/response bodies and database query data
 * by default. Here the Supabase session lives in `sb-*-auth-token` cookies and board content
 * travels in Server Action bodies, so each category is switched off or narrowed. The SDK also
 * masks keys that look like tokens, keys or sessions. The deny-lists add what it misses:
 *  - IP headers. `userInfo: false` strips the standard IP headers from error events only. Span
 *    header attributes keep them, and the `x-vercel-ip-*` geo headers are never stripped.
 *  - Request headers that can carry an invite token: `referer` (an invite path) and
 *    `next-router-*` (`Next-Router-State-Tree` holds the token as an encoded route param, with
 *    no `/join/` prefix for the scrubber to match). Entries match as case-insensitive substrings.
 *  - The `next` query parameter (an encoded invite path) and the one-time auth `code`.
 * The scrubber hooks rewrite `/join/<token>` in every string of an error event, span or
 * breadcrumb: URLs, transaction and span names, span attributes, breadcrumb data and the
 * `nextjs.request_path` context. They cannot see a token outside that path shape, which is why
 * the header deny-list is needed too. No Session Replay.
 */
export const SENTRY_SHARED_OPTIONS: SentryInitOptions = {
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  // Pinned: `beforeSendSpan` is ignored under 'static', which SENTRY_TRACE_LIFECYCLE can select.
  traceLifecycle: 'stream',
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    databaseQueryData: false,
    httpHeaders: {
      request: {
        deny: [
          'authorization',
          'cookie',
          'referer',
          'next-router',
          'forwarded',
          'x-real-ip',
          'x-vercel-ip',
          'cf-connecting-ip',
          'true-client-ip',
        ],
      },
      response: { deny: ['set-cookie'] },
    },
    urlQueryParams: { deny: ['code', 'next'] },
  },
  beforeSend: (event) => scrubInviteTokens(event),
  beforeSendSpan: (span) => scrubInviteTokens(span),
  beforeBreadcrumb: (breadcrumb) => scrubInviteTokens(breadcrumb),
};
