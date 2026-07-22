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
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-14 w-full items-center border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <Link href="/boards" className="flex items-center gap-2">
            <div className="bg-foreground text-background flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
              K
            </div>
            <span className="text-sm font-semibold">KanbanFlow</span>
          </Link>

          {/* Breadcrumb */}
          {breadcrumb && (
            <>
              <ChevronRight className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground text-sm">Boards</span>
              <ChevronRight className="text-muted-foreground h-4 w-4" />
              <span className="max-w-[200px] truncate text-sm font-medium">
                {breadcrumb.boardTitle}
              </span>
            </>
          )}
        </div>

        {/* Right: Theme toggle + User menu */}
        <div className="flex items-center gap-1">
          <AnimatedThemeToggler className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors" />
          <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
        </div>
      </div>
    </header>
  );
}
