'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { AuthMessageCard } from '@/components/auth/auth-message-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/auth/redirects';

// Friendly copy for the auth-link failures Supabase reports. Unknown codes fall
// back to the generic message.
const ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    'This link has expired. Reset and confirmation links are only valid for a short time.',
  access_denied: 'This link is invalid or has already been used.',
};

const DEFAULT_MESSAGE = 'This link is invalid or has expired.';

export default function AuthCodeErrorPage() {
  // useSearchParams must sit under a Suspense boundary; the auth layout provides none.
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse motion-reduce:animate-none" />}>
      <AuthCodeError />
    </Suspense>
  );
}

function AuthCodeError() {
  const searchParams = useSearchParams();
  // The catcher and the callback forward the failure here as query params. GoTrue
  // reports an expired link as `error=access_denied&error_code=otp_expired`, so we
  // key on the specific `error_code` first, then fall back to the broader `error`.
  const errorCode = searchParams.get('error_code');
  const error = searchParams.get('error');
  const message =
    (errorCode && ERROR_MESSAGES[errorCode]) ||
    (error && ERROR_MESSAGES[error]) ||
    DEFAULT_MESSAGE;

  return (
    <AuthMessageCard title="Link expired or invalid" description={message}>
      {/* This page catches both reset AND confirmation link failures, so the primary
          action is the neutral "sign in" — a password-reset link is a dead end for an
          unconfirmed account. Requesting a fresh reset link is the secondary path. */}
      <Button asChild className="w-full">
        <Link href={ROUTES.login}>Back to sign in</Link>
      </Button>
      <Button asChild variant="outline" className="w-full">
        <Link href={ROUTES.forgotPassword}>Request a new reset link</Link>
      </Button>
    </AuthMessageCard>
  );
}
