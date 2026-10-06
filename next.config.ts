import { withSentryConfig } from '@sentry/nextjs/config';

import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Only honoured over HTTPS; Vercel serves production over HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // No Content-Security-Policy here on purpose: it is set per request in `proxy.ts`
  // (nonce-based, built in `lib/csp.ts`). A static header has no nonce, and two CSP
  // headers are both enforced, so adding one here would break the app.
];

// The image optimizer may fetch Storage objects from THIS project only: a `*.supabase.co`
// wildcard lets anyone feed `/_next/image` arbitrary bytes from a bucket they control.
// Read from `process.env` directly — `lib/env.ts` throws on import, and the config must
// still load without it. Unset or unparseable → no Supabase pattern (fail closed).
const supabaseHost = URL.parse(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.hostname;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16: top-level option (moved out of `experimental` in v15.5+).
  typedRoutes: true,
  // Next 16.3+: otherwise `next dev` upserts a generated block into CLAUDE.md whenever it
  // detects an AI agent. CLAUDE.md is hand-maintained (see its header), so opt out.
  agentRules: false,
  images: {
    remotePatterns: [
      // Supabase Storage public objects (avatars, attachments).
      ...(supabaseHost
        ? [
            {
              protocol: 'https',
              hostname: supabaseHost,
              pathname: '/storage/v1/object/public/**',
            } as const,
          ]
        : []),
      // OAuth provider avatars.
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Build-time Sentry options, all optional. Without SENTRY_AUTH_TOKEN no browser source maps are
// generated and nothing is uploaded; the SDKs stay inert until a DSN is set (lib/env.ts).
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  authToken: sentryAuthToken,
  sourcemaps: { disable: !sentryAuthToken, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
  // A Sentry outage or a bad token must not block a deploy: report and continue.
  errorHandler: (err) => {
    console.warn('Sentry build step failed (continuing):', err.message);
  },
});
