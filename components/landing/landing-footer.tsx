import Link from 'next/link';

import { Separator } from '@/components/ui/separator';

export function LandingFooter() {
  return (
    <footer className="relative z-10 border-t px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="bg-foreground text-background flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold">
            K
          </div>
          <span className="text-sm font-semibold">KanbanFlow</span>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="text-muted-foreground text-xs">Real-time collaborative boards</span>
        </div>
        <nav className="flex items-center gap-5" aria-label="Footer navigation">
          <a
            href="#features"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            How it works
          </a>
          <Link
            href="/register"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </div>
      <p className="text-muted-foreground mt-6 text-center text-xs">
        © 2025 KanbanFlow · Built with Next.js, Supabase, and shadcn/ui
      </p>
    </footer>
  );
}
