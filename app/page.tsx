import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Zap, Users, MousePointer2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { DotPattern } from '@/components/ui/dot-pattern';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/boards');

  const features = [
    {
      icon: Zap,
      title: 'Real-time sync',
      description:
        'See changes instantly as your teammates work. No page refreshes needed.',
    },
    {
      icon: MousePointer2,
      title: 'Drag & drop',
      description:
        'Move tasks between columns with a simple drag. Reorganize your workflow effortlessly.',
    },
    {
      icon: Users,
      title: 'Team collaboration',
      description:
        'Invite your team, assign tasks, and track progress together — all in one place.',
    },
  ] as const;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <DotPattern
        className={cn(
          'fill-neutral-300/50 dark:fill-neutral-700/30',
          '[mask-image:radial-gradient(800px_circle_at_center,white,transparent)]',
        )}
      />

      {/* Navbar */}
      <header className="relative z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background text-xs font-bold">
            K
          </div>
          <span className="text-sm font-semibold">KanbanFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <BlurFade delay={0.1}>
          <div className="mb-3 inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            Real-time collaborative project management
          </div>
        </BlurFade>

        <BlurFade delay={0.2}>
          <h1 className="mx-auto max-w-2xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Ship faster,{' '}
            <span className="text-foreground/60">together</span>
          </h1>
        </BlurFade>

        <BlurFade delay={0.3}>
          <p className="mx-auto mt-6 max-w-lg text-base text-muted-foreground sm:text-lg">
            KanbanFlow brings your team&apos;s work into one place. Drag, drop, and
            collaborate in real time — so nothing falls through the cracks.
          </p>
        </BlurFade>

        <BlurFade delay={0.4}>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">Get started for free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </BlurFade>

        {/* Feature cards */}
        <div className="mt-20 grid gap-6 sm:grid-cols-3 max-w-3xl mx-auto">
          {features.map((feature, index) => (
            <BlurFade key={feature.title} delay={0.5 + index * 0.1} inView>
              <div className="rounded-lg border bg-background/80 p-6 text-left backdrop-blur">
                <feature.icon className="h-6 w-6 mb-3 text-foreground/70" />
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </main>
    </div>
  );
}
