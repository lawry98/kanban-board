import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

export function LandingHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-50 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-foreground text-background flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
            K
          </div>
          <span className="text-sm font-semibold tracking-tight">KanbanFlow</span>
        </Link>
        <nav className="hidden items-center gap-5 sm:flex" aria-label="Main navigation">
          <a
            href="#features"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            How it works
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <AnimatedThemeToggler className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors" />
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
