import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function BoardNotFound() {
  return (
    <div className="flex h-[calc(100vh-56px)] items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-xl font-semibold">Board not found</h1>
        <p className="text-sm text-muted-foreground">
          This board doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild>
          <Link href="/boards">Go to boards</Link>
        </Button>
      </div>
    </div>
  );
}
