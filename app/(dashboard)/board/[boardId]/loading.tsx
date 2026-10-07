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

// Skeleton always pulses and components/ui is generated, so each placeholder opts out
// of the pulse with motion-reduce:animate-none.
export default function BoardLoading() {
  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col overflow-hidden">
      {/* Matches BoardHeader: stacked below sm, one row from sm. Line boxes and the
          32px buttons are sized to the real ones so nothing jumps when the board loads. */}
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* Title (text-xl line) */}
          <Skeleton className="h-7 w-48 max-w-full motion-reduce:animate-none" />
          {/* "N columns · N tasks · <status>" (text-xs line) */}
          <div className="flex h-4 items-center gap-2">
            <Skeleton className="h-3 w-28 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-16 motion-reduce:animate-none" />
          </div>
        </div>
        {/* An owner's actions: icon buttons below sm, labelled from sm. */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Member avatars */}
          <div className="flex -space-x-2">
            {MEMBER_PLACEHOLDERS.map((key) => (
              <Skeleton
                key={key}
                className="ring-background h-7 w-7 rounded-full ring-2 motion-reduce:animate-none"
              />
            ))}
          </div>
          {/* Share */}
          <Skeleton className="size-8 rounded-md motion-reduce:animate-none sm:w-20" />
          {/* Activity */}
          <Skeleton className="size-8 rounded-md motion-reduce:animate-none sm:w-24" />
          {/* Board actions */}
          <Skeleton className="size-8 rounded-md motion-reduce:animate-none" />
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto p-4 sm:p-6">
        {COLUMN_PLACEHOLDERS.map((column) => (
          <div key={column.id} className="flex w-72 shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-6 rounded motion-reduce:animate-none" />
            </div>
            <div className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-2">
              {column.cards.map((cardKey) => (
                <div key={cardKey} className="bg-background space-y-2 rounded-md border p-2.5">
                  <Skeleton className="h-4 w-full motion-reduce:animate-none" />
                  <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-12 rounded motion-reduce:animate-none" />
                    <Skeleton className="h-4 w-14 rounded motion-reduce:animate-none" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-5 rounded-full motion-reduce:animate-none" />
                    <Skeleton className="h-3 w-10 motion-reduce:animate-none" />
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
