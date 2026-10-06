/**
 * Per-request Content-Security-Policy, set by proxy.ts. Next reads the nonce from the
 * CSP *request* header and stamps it on its own scripts; `x-nonce` is for app code
 * (the root layout hands it to next-themes' inline script).
 */
export const NONCE_HEADER = 'x-nonce';

/**
 * Ships Report-Only until a browser pass confirms no violations on every flow
 * (auth, OAuth, board, drag-and-drop, Realtime, avatars). Flip to `false` to enforce.
 * Next extracts the nonce from either header (app-render.js), so nothing else changes.
 */
export const CSP_REPORT_ONLY = true;

/** The response header carrying the policy, and the request header Next reads the nonce from. */
export const CSP_HEADER = CSP_REPORT_ONLY
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy';

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

interface CspOptions {
  nonce: string;
  supabaseUrl: string;
  isDev: boolean;
  /** Browsers ignore `upgrade-insecure-requests` in a report-only policy and warn, so omit it. */
  reportOnly: boolean;
  /** `NEXT_PUBLIC_SENTRY_DSN`. Only its origin is allowed in `connect-src`; unusable values are ignored. */
  sentryDsn?: string;
}

/** A plain http(s) origin: no `null` (opaque origin), `;` or whitespace that could alter the header. */
const SAFE_ORIGIN = /^https?:\/\/[\w.-]+(?::\d+)?$/;

/**
 * The browser SDK POSTs events straight to the DSN's ingest host (`withSentryConfig` sets no
 * tunnel route), so that origin must be in `connect-src`. The DSN carries a public key and a
 * project path, neither of which belongs in a policy header. Never throws: this runs on every
 * request in `proxy.ts`, and an operator typo in the DSN must not take the whole app down.
 */
function sentryOrigin(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  const origin = URL.parse(dsn)?.origin;
  return origin && SAFE_ORIGIN.test(origin) ? origin : undefined;
}

export function buildContentSecurityPolicy({
  nonce,
  supabaseUrl,
  isDev,
  reportOnly,
  sentryDsn,
}: CspOptions): string {
  const supabase = new URL(supabaseUrl).origin;
  const supabaseSocket = supabase.replace(/^http/, 'ws');
  const sentry = sentryOrigin(sentryDsn);

  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // 'strict-dynamic' lets nonce-trusted Next chunks load the rest. React needs eval in dev only.
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // No nonce here on purpose (it would void 'unsafe-inline'): sonner, Radix and
    // @hello-pangea/dnd inject un-nonced <style> tags, and SSR style attributes can't carry one.
    ['style-src', "'self'", "'unsafe-inline'"],
    // Avatars are raw <img> (Radix AvatarImage), not next/image.
    [
      'img-src',
      "'self'",
      'blob:',
      'data:',
      'https://avatars.githubusercontent.com',
      'https://lh3.googleusercontent.com',
      `${supabase}/storage/v1/object/public/`,
    ],
    ['font-src', "'self'"],
    // Supabase REST/Auth over https; Realtime over wss; Sentry ingest when a DSN is set.
    ['connect-src', "'self'", supabase, supabaseSocket, ...(sentry ? [sentry] : [])],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];

  const policy = directives.map((d) => d.join(' '));
  if (!isDev && !reportOnly) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
