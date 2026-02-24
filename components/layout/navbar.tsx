import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { UserMenu } from '@/components/layout/user-menu';

interface NavbarProps {
  user: {
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  breadcrumb?: {
    boardTitle: string;
    boardId: string;
  } | null;
}

export function Navbar({ user, breadcrumb }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 flex h-14 w-full items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <Link href="/boards" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background text-xs font-bold">
              K
            </div>
            <span className="text-sm font-semibold">KanbanFlow</span>
          </Link>

          {/* Breadcrumb */}
          {breadcrumb && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Boards</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {breadcrumb.boardTitle}
              </span>
            </>
          )}
        </div>

        {/* Right: Theme toggle + User menu */}
        <div className="flex items-center gap-1">
          <AnimatedThemeToggler className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
          <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
        </div>
      </div>
    </header>
  );
}
