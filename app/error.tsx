'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
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
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/boards">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
