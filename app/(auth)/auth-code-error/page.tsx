'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    <Suspense fallback={<Card className="h-64 animate-pulse" />}>
      <AuthCodeError />
    </Suspense>
  );
}

function AuthCodeError() {
  const searchParams = useSearchParams();
  // The catcher and the callback both forward the failure as an `error_code`
  // query param before routing here, so the query string is the single source.
  const errorCode = searchParams.get('error_code');
  const message = (errorCode && ERROR_MESSAGES[errorCode]) || DEFAULT_MESSAGE;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Link expired or invalid</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
