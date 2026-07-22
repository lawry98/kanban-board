import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Static placeholder shapes — named keys rather than array indices, see board loading.tsx.
const AVATAR_PLACEHOLDERS = ['avatar-a', 'avatar-b', 'avatar-c'];
const CARD_PLACEHOLDERS = Array.from({ length: 8 }, (_, i) => `board-card-${i}`);

function BoardCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex -space-x-2">
            {AVATAR_PLACEHOLDERS.map((key) => (
              <Skeleton key={key} className="ring-background h-6 w-6 rounded-full ring-2" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BoardsLoading() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CARD_PLACEHOLDERS.map((key) => (
          <BoardCardSkeleton key={key} />
        ))}
      </div>
    </div>
  );
}
