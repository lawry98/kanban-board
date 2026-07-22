import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/redirects';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));
  // Present instead of `code` when an email link (recovery/confirmation) is
  // invalid or expired, or a provider denies the request.
  const errorCode = searchParams.get('error_code');
  const providerError = searchParams.get('error');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }

    // Log server-side only; the raw provider error can disclose token details.
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
  }

  // A failed/expired link comes back with an error and no code — surface it on a
  // dedicated page that offers a fresh link, not a bare sign-in screen.
  if (errorCode || providerError) {
    const params = new URLSearchParams();
    if (errorCode) params.set('error_code', errorCode);
    return NextResponse.redirect(new URL(`/auth-code-error?${params.toString()}`, origin));
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
