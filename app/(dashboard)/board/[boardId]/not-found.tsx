import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function BoardNotFound() {
  return (
    <div className="flex h-[calc(100vh-56px)] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <AlertTriangle className="text-muted-foreground/50 h-12 w-12" />
        <h1 className="text-xl font-semibold">Board not found</h1>
        <p className="text-muted-foreground text-sm">
          This board doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild>
          <Link href="/boards">Go to boards</Link>
        </Button>
      </div>
    </div>
  );
}
