import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { AUTH_ERROR, loginWithError, ROUTES, sanitizeNext } from '@/lib/auth/redirects';

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

    // A recovery link (next=/reset-password) that fails to exchange is almost always
    // a dead/expired code or a cross-device open — the PKCE verifier lives in the
    // browser that requested the reset, so opening the email elsewhere always fails.
    // Send those to the link-error page that offers a fresh link, not a sign-in
    // screen that explains nothing and loops from the wrong device.
    if (next === ROUTES.resetPassword) {
      return NextResponse.redirect(new URL(ROUTES.authCodeError, origin));
    }
    return NextResponse.redirect(new URL(loginWithError(AUTH_ERROR.callbackFailed), origin));
  }

  // A failed/expired link comes back with an error and no code — surface it on a
  // dedicated page that offers a fresh link, not a bare sign-in screen.
  if (errorCode || providerError) {
    console.error('[auth/callback] auth link error:', errorCode ?? providerError);
    const params = new URLSearchParams();
    if (errorCode) params.set('error_code', errorCode);
    // Forward `error` too: GoTrue reports expired links as
    // `error=access_denied&error_code=otp_expired`, so the error page needs both to
    // pick the right message.
    if (providerError) params.set('error', providerError);
    return NextResponse.redirect(new URL(`${ROUTES.authCodeError}?${params.toString()}`, origin));
  }

  return NextResponse.redirect(new URL(loginWithError(AUTH_ERROR.callbackFailed), origin));
}
