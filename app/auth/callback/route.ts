import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

import type { NextRequest } from 'next/server';

const DEFAULT_REDIRECT = '/boards';

/**
 * Only same-origin relative paths are allowed as a post-login destination.
 *
 * A raw `${origin}${next}` concatenation is an open redirect: `?next=@evil.com`
 * yields `https://app.example.com@evil.com`, a valid absolute URL whose host is
 * the attacker's. Protocol-relative (`//evil.com`) and backslash (`/\evil.com`)
 * forms are rejected for the same reason.
 */
export function sanitizeNext(next: string | null): string {
  if (!next) return DEFAULT_REDIRECT;
  if (!next.startsWith('/')) return DEFAULT_REDIRECT;
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_REDIRECT;
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }

    // Log server-side only; the raw provider error can disclose token details.
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
