import { MousePointer2, Users, Zap } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time sync',
    description: 'See changes instantly as teammates work. No page refreshes.',
    detail: 'Live updates via Supabase Realtime WebSockets — dispatched directly into board state.',
  },
  {
    icon: MousePointer2,
    title: 'Drag & drop',
    description: 'Move tasks across columns and reorder cards effortlessly.',
    detail:
      'Column and card reordering with optimistic UI — actions feel instant, server catches up silently.',
  },
  {
    icon: Users,
    title: 'Team collaboration',
    description: 'Invite your team, assign tasks, and track progress together.',
    detail: 'Assignees, labels, due dates, and full activity history — everything in one place.',
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="features" className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your team needs
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
              Designed for fast-moving teams who care about clarity, speed, and real
              collaboration.
            </p>
          </div>
        </BlurFade>

        <div className="grid gap-5 sm:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <BlurFade key={feature.title} delay={0.2 + index * 0.1} inView>
              <div className="group rounded-xl border bg-background/80 p-6 backdrop-blur transition-all hover:border-foreground/20 hover:shadow-md">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted">
                  <feature.icon className="h-4 w-4 text-foreground/70" />
                </div>
                <h3 className="mb-1 text-base font-semibold">{feature.title}</h3>
                <p className="mb-3 text-sm text-muted-foreground">{feature.description}</p>
                <p className="border-t pt-3 text-xs text-muted-foreground/80">{feature.detail}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
