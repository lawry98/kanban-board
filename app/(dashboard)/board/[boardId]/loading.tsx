import { Skeleton } from '@/components/ui/skeleton';

// Static placeholder shapes. Named rather than index-generated so the keys are stable
// identifiers instead of positions — these lists never reorder, but index keys here
// trained us to ignore the lint rule that catches the cases where it does matter.
const MEMBER_PLACEHOLDERS = ['member-a', 'member-b', 'member-c'];
const COLUMN_PLACEHOLDERS = [
  { id: 'col-a', cards: ['card-a1'] },
  { id: 'col-b', cards: ['card-b1', 'card-b2'] },
  { id: 'col-c', cards: ['card-c1', 'card-c2', 'card-c3'] },
  { id: 'col-d', cards: ['card-d1', 'card-d2', 'card-d3', 'card-d4'] },
];

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
            {MEMBER_PLACEHOLDERS.map((key) => (
              <Skeleton key={key} className="ring-background h-7 w-7 rounded-full ring-2" />
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
        {COLUMN_PLACEHOLDERS.map((column) => (
          <div key={column.id} className="flex w-72 shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6 rounded" />
            </div>
            <div className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-2">
              {column.cards.map((cardKey) => (
                <div key={cardKey} className="bg-background space-y-2 rounded-md border p-2.5">
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
