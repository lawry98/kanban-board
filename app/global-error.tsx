'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

import './globals.css';

// Next 16.3 documents `retry` (re-fetches, then resets) as the stable recovery prop and
// `reset` as the no-refetch variant. Re-rendering a root layout that just threw needs the
// re-fetch, so this boundary uses `retry`.
interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        {/* Client file: no `metadata` export, so React 19 hoists this into <head>. */}
        <title>Something went wrong | KanbanFlow</title>
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
      </body>
    </html>
  );
}
