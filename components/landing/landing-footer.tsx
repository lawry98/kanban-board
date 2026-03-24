import Link from 'next/link';

import { Separator } from '@/components/ui/separator';

export function LandingFooter() {
  return (
    <footer className="relative z-10 border-t px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-background text-[10px] font-bold">
            K
          </div>
          <span className="text-sm font-semibold">KanbanFlow</span>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="text-xs text-muted-foreground">Real-time collaborative boards</span>
        </div>
        <nav
          className="flex items-center gap-5"
          aria-label="Footer navigation"
        >
          <a
            href="#features"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <Link
            href="/register"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        © 2025 KanbanFlow · Built with Next.js, Supabase, and shadcn/ui
      </p>
    </footer>
  );
}
