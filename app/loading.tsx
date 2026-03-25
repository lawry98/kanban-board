import { Skeleton } from '@/components/ui/skeleton';

export default function LandingLoading() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-6 w-28 rounded" />
          <div className="hidden items-center gap-5 sm:flex">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="flex flex-col items-center px-4 pb-14 pt-24">
          <Skeleton className="mb-4 h-7 w-64 rounded-full" />
          <Skeleton className="h-16 w-full max-w-xl rounded-lg sm:h-20" />
          <Skeleton className="mt-3 h-14 w-full max-w-xl rounded-lg" />
          <Skeleton className="mx-auto mt-6 h-14 w-full max-w-lg rounded-lg" />
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Skeleton className="h-11 w-48 rounded-md" />
            <Skeleton className="h-11 w-36 rounded-md" />
          </div>
          <Skeleton className="mt-3 h-4 w-44" />
        </section>

        {/* Preview board */}
        <section className="px-4 pb-20">
          <div className="mx-auto max-w-5xl">
            <Skeleton className="mb-5 mx-auto h-4 w-72" />
            <Skeleton className="h-[360px] w-full rounded-xl" />
          </div>
        </section>
      </main>
    </div>
  );
}
