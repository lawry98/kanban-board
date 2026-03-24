import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background text-xs font-bold">
            K
          </div>
          <span className="text-sm font-semibold tracking-tight">KanbanFlow</span>
        </Link>
        <nav className="hidden items-center gap-5 sm:flex" aria-label="Main navigation">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <AnimatedThemeToggler className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/register">Get started</Link>
        </Button>
      </div>
    </header>
  );
}
