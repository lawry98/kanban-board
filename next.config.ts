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
  // TODO: add a Content-Security-Policy. Next injects inline bootstrap scripts, so a
  // useful CSP needs a per-request nonce generated in `proxy.ts` and propagated to the
  // header. Shipping a CSP without that breaks the app in production, so it is
  // deliberately left as a follow-up rather than set here.
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16: top-level option (moved out of `experimental` in v15.5+).
  typedRoutes: true,
  images: {
    remotePatterns: [
      // Supabase Storage public objects (avatars, attachments).
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      // OAuth provider avatars.
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
