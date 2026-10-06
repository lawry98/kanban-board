/**
 * Per-request Content-Security-Policy, set by proxy.ts. Next reads the nonce from the
 * CSP *request* header and stamps it on its own scripts; `x-nonce` is for app code
 * (the root layout hands it to next-themes' inline script).
 */
export const NONCE_HEADER = 'x-nonce';

/**
 * Enforced. Swap for 'Content-Security-Policy-Report-Only' to observe without
 * blocking; Next extracts the nonce from either.
 */
export const CSP_HEADER = 'Content-Security-Policy';

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

interface CspOptions {
  nonce: string;
  supabaseUrl: string;
  isDev: boolean;
}

export function buildContentSecurityPolicy({ nonce, supabaseUrl, isDev }: CspOptions): string {
  const supabase = new URL(supabaseUrl).origin;
  const supabaseSocket = supabase.replace(/^http/, 'ws');

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
    // Supabase REST/Auth over https; Realtime over wss.
    ['connect-src', "'self'", supabase, supabaseSocket],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];

  const policy = directives.map((d) => d.join(' '));
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
