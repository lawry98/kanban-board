'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Next 16.3 docs: prefer `retry` (re-fetches, then re-renders) over `reset` (re-renders only).
interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
    // Errors caught by an error boundary never reach Sentry's global handler.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <AlertCircle className="text-destructive/70 h-12 w-12" />
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/boards">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
