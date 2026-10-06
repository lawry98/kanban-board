import type * as Sentry from '@sentry/nextjs';

type SentryInitOptions = Parameters<typeof Sentry.init>[0];

/**
 * Options shared by the server, edge and client `Sentry.init` calls; each call adds only its DSN.
 *
 * SDK v11 collects user info, cookies, headers, request/response bodies and database query data
 * by default. Here the Supabase session lives in `sb-*-auth-token` cookies and board content
 * travels in Server Action bodies, so each category is switched off or narrowed. The SDK also
 * masks keys that look like tokens, keys or sessions; the deny-lists add what it does not catch:
 * client IP headers (`userInfo: false` stops IP inference, not the raw headers) and the one-time
 * auth `code` query parameter. No Session Replay.
 */
export const SENTRY_SHARED_OPTIONS: SentryInitOptions = {
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
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
          'forwarded',
          'x-real-ip',
          'x-vercel-ip',
          'cf-connecting-ip',
          'true-client-ip',
        ],
      },
      response: { deny: ['set-cookie'] },
    },
    urlQueryParams: { deny: ['code'] },
  },
};
