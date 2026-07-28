import { NextResponse } from 'next/server';

import { trackEvent } from '@/lib/analytics/track';
import { signedUpKey } from '@/lib/analytics/events';
import { createClient } from '@/lib/supabase/server';
import { AUTH_ERROR, loginWithError, ROUTES, sanitizeNext } from '@/lib/auth/redirects';

import type { NextRequest } from 'next/server';

/**
 * How recently `auth.users.created_at` must be for this callback to count as a
 * signup rather than a returning sign-in. Read from the exchange result that is
 * already in hand, so this costs no extra query.
 */
const SIGNUP_FRESHNESS_MS = 60_000;

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const user = data.user;
      if (user && Date.now() - new Date(user.created_at).getTime() < SIGNUP_FRESHNESS_MS) {
        // GitHub users never touch the register page's session branch, so this is
        // their only signup emission site. The freshness window keeps returning
        // sign-ins (and recovery-link exchanges) out of the funnel top, and the
        // shared `signed_up:<userId>` dedupe key makes a race with the register
        // page's emission a no-op.
        await trackEvent({
          name: 'signed_up',
          userId: user.id,
          boardId: null,
          dedupeKey: signedUpKey(user.id),
          properties: {
            method: user.app_metadata?.provider === 'github' ? 'github' : 'password',
            fromInvite: next.startsWith('/join/'),
          },
        });
      }
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
