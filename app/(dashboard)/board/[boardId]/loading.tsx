import { Skeleton } from '@/components/ui/skeleton';

export default function BoardLoading() {
  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex gap-3">
          <div className="flex -space-x-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      {/* Columns skeleton */}
      <div className="flex gap-4 overflow-x-auto p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="rounded-lg border bg-muted/30 p-2 space-y-2">
              {Array.from({ length: i + 1 }).map((_, j) => (
                <Skeleton key={j} className="h-20 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
