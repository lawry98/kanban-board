import type { Metadata } from 'next';
import Link from 'next/link';

import { DotPattern } from '@/components/ui/dot-pattern';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Sign In',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <DotPattern
        className={cn(
          'fill-neutral-300/60 dark:fill-neutral-700/40',
          '[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]',
        )}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 px-4 py-12">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background text-sm font-bold">
            K
          </div>
          <span className="text-xl font-semibold tracking-tight">KanbanFlow</span>
        </Link>
        <div className="w-full">{children}</div>
        <p className="text-xs text-muted-foreground">Built with Next.js &amp; Supabase</p>
      </div>
    </div>
  );
}
