import { Skeleton } from '@/components/ui/skeleton';

export default function BoardLoading() {
  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      {/* Matches BoardHeader layout */}
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex items-center gap-3">
          {/* Member avatars */}
          <div className="flex -space-x-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-full ring-2 ring-background" />
            ))}
          </div>
          {/* Invite button */}
          <Skeleton className="h-8 w-20 rounded-md" />
          {/* Activity button */}
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6 rounded" />
            </div>
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
              {Array.from({ length: i + 1 }).map((_, j) => (
                <div key={j} className="rounded-md border bg-background p-2.5 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-12 rounded" />
                    <Skeleton className="h-4 w-14 rounded" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
