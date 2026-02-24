import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, MousePointer2, Users, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';
import { DotPattern } from '@/components/ui/dot-pattern';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

// ─── Mock board data ──────────────────────────────────────────────────────────

interface MockLabel {
  text: string;
  className: string;
}

interface MockTask {
  title: string;
  priority: 'high' | 'medium' | 'low';
  labels: MockLabel[];
  avatar: { initials: string; color: string };
  due?: string;
}

interface MockColumn {
  title: string;
  dotColor: string;
  tasks: MockTask[];
}

const PRIORITY_COLORS = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-sky-400',
} as const;

const MOCK_BOARD: MockColumn[] = [
  {
    title: 'Backlog',
    dotColor: 'bg-muted-foreground/50',
    tasks: [
      {
        title: 'Design system tokens',
        priority: 'medium',
        labels: [
          {
            text: 'Design',
            className:
              'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
          },
        ],
        avatar: { initials: 'SM', color: 'bg-purple-500' },
        due: 'Mar 15',
      },
      {
        title: 'Mobile navigation',
        priority: 'low',
        labels: [
          {
            text: 'Frontend',
            className:
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
          },
        ],
        avatar: { initials: 'JD', color: 'bg-blue-500' },
      },
      {
        title: 'Onboarding flow',
        priority: 'high',
        labels: [
          {
            text: 'Design',
            className:
              'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
          },
          {
            text: 'UX',
            className:
              'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
          },
        ],
        avatar: { initials: 'MA', color: 'bg-orange-500' },
      },
    ],
  },
  {
    title: 'In Progress',
    dotColor: 'bg-blue-500',
    tasks: [
      {
        title: 'Auth & permissions',
        priority: 'high',
        labels: [
          {
            text: 'Backend',
            className:
              'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
          },
        ],
        avatar: { initials: 'JD', color: 'bg-blue-500' },
        due: 'Feb 28',
      },
      {
        title: 'Dashboard redesign',
        priority: 'medium',
        labels: [
          {
            text: 'Frontend',
            className:
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
          },
        ],
        avatar: { initials: 'SM', color: 'bg-purple-500' },
        due: 'Mar 2',
      },
    ],
  },
  {
    title: 'Review',
    dotColor: 'bg-amber-500',
    tasks: [
      {
        title: 'Landing page v2',
        priority: 'medium',
        labels: [
          {
            text: 'Frontend',
            className:
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
          },
        ],
        avatar: { initials: 'SM', color: 'bg-purple-500' },
      },
      {
        title: 'API documentation',
        priority: 'low',
        labels: [
          {
            text: 'Docs',
            className:
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
          },
        ],
        avatar: { initials: 'TK', color: 'bg-teal-500' },
      },
    ],
  },
  {
    title: 'Done',
    dotColor: 'bg-emerald-500',
    tasks: [
      {
        title: 'Database schema',
        priority: 'high',
        labels: [
          {
            text: 'Backend',
            className:
              'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
          },
        ],
        avatar: { initials: 'TK', color: 'bg-teal-500' },
      },
      {
        title: 'CI/CD pipeline',
        priority: 'medium',
        labels: [
          {
            text: 'DevOps',
            className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
          },
        ],
        avatar: { initials: 'MA', color: 'bg-orange-500' },
      },
    ],
  },
];

// ─── Mock board sub-components ────────────────────────────────────────────────

function MockLabel({ label }: { label: MockLabel }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        label.className,
      )}
    >
      {label.text}
    </span>
  );
}

function MockTaskCard({ task }: { task: MockTask }) {
  return (
    <div className="rounded-md border bg-background p-2.5 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug">{task.title}</span>
        <div
          className={cn(
            'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
            PRIORITY_COLORS[task.priority],
          )}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {task.labels.map((label) => (
          <MockLabel key={label.text} label={label} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white',
            task.avatar.color,
          )}
        >
          {task.avatar.initials}
        </div>
        {task.due && (
          <span className="text-[10px] text-muted-foreground">{task.due}</span>
        )}
      </div>
    </div>
  );
}

function MockBoardColumn({ column }: { column: MockColumn }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', column.dotColor)} />
          <span className="text-xs font-medium text-foreground/80">{column.title}</span>
        </div>
        <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
          {column.tasks.length}
        </span>
      </div>
      {column.tasks.map((task) => (
        <MockTaskCard key={task.title} task={task} />
      ))}
    </div>
  );
}

// ─── Static data ──────────────────────────────────────────────────────────────

const TECH_STACK = [
  { name: 'Next.js', detail: 'App Router' },
  { name: 'Supabase', detail: 'Auth + Realtime' },
  { name: 'Prisma', detail: 'Type-safe ORM' },
  { name: 'shadcn/ui', detail: 'UI components' },
  { name: 'TypeScript', detail: 'Strict mode' },
  { name: 'Tailwind CSS', detail: 'Styling' },
] as const;

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

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Create a board',
    description:
      'Name your project and define columns to match your workflow — from Backlog to Done.',
  },
  {
    step: '02',
    title: 'Add tasks',
    description:
      'Break work into cards. Add labels, due dates, assignees, and priority markers.',
  },
  {
    step: '03',
    title: 'Drag & organize',
    description:
      'Move tasks across columns as work progresses. Reorder cards with a simple drag.',
  },
  {
    step: '04',
    title: 'Collaborate live',
    description:
      'Watch updates appear instantly as your team works. Zero conflicts, zero refreshing.',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/boards');

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Background dot pattern — fades from top center */}
      <DotPattern
        className={cn(
          'absolute inset-0 fill-neutral-300/40 dark:fill-neutral-700/25',
          '[mask-image:radial-gradient(ellipse_80%_55%_at_50%_0%,white,transparent)]',
        )}
      />

      {/* ── Sticky nav ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background text-xs font-bold">
              K
            </div>
            <span className="text-sm font-semibold tracking-tight">KanbanFlow</span>
          </Link>
          <nav className="hidden items-center gap-5 sm:flex" aria-label="Main navigation">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              How it works
            </a>
          </nav>
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

      <main className="relative z-10 flex-1">
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center px-4 pb-14 pt-24 text-center">
          <BlurFade delay={0.1}>
            <div className="mb-4 inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              Real-time collaborative project management
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Ship faster,{' '}
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 bg-clip-text text-transparent">
                together
              </span>
            </h1>
          </BlurFade>

          <BlurFade delay={0.3}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-300 sm:text-lg sm:leading-8">
              Organize tasks in boards, move cards with drag-and-drop, and stay in sync with your
              team in real time — so nothing falls through the cracks.
            </p>
          </BlurFade>

          <BlurFade delay={0.4}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" className="h-11 px-7" asChild>
                <Link href="/register">Get started for free</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-7" asChild>
                {/* Plain <a> for in-page anchor — no Next.js routing needed */}
                <a href="#preview">See it in action</a>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Free to use · No credit card required
            </p>
          </BlurFade>
        </section>

        {/* ── Product preview ───────────────────────────────────────────────── */}
        <section id="preview" className="px-4 pb-20">
          <div className="mx-auto max-w-5xl">
            <BlurFade delay={0.5}>
              <p className="mb-5 text-center text-sm text-muted-foreground">
                A real kanban board — drag, drop, collaborate in real time
              </p>

              {/* Outer wrapper handles horizontal overflow on small screens */}
              <div className="overflow-x-auto">
                <div className="relative min-w-[680px] rounded-xl border bg-background shadow-2xl shadow-black/5 dark:shadow-black/20">
                  {/* Animated border beam */}
                  <BorderBeam
                    size={280}
                    duration={10}
                    colorFrom="#6366f1"
                    colorTo="#8b5cf6"
                    borderWidth={1.5}
                  />

                  {/* Window chrome */}
                  <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                      <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Q1 2025 Roadmap
                      </span>
                    </div>
                    {/* Online presence indicators */}
                    <div className="flex items-center">
                      {(
                        [
                          { initials: 'JD', color: 'bg-blue-500' },
                          { initials: 'SM', color: 'bg-purple-500' },
                          { initials: 'TK', color: 'bg-teal-500' },
                        ] as const
                      ).map((a) => (
                        <div
                          key={a.initials}
                          className={cn(
                            '-ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-background first:ml-0',
                            a.color,
                          )}
                        >
                          {a.initials}
                        </div>
                      ))}
                      <span className="ml-2 text-[10px] text-muted-foreground">3 online</span>
                    </div>
                  </div>

                  {/* Board columns */}
                  <div className="grid grid-cols-4 gap-3 bg-muted/5 p-4">
                    {MOCK_BOARD.map((column) => (
                      <MockBoardColumn key={column.title} column={column} />
                    ))}
                  </div>
                </div>
              </div>
            </BlurFade>
          </div>
        </section>

        {/* ── Tech stack strip ──────────────────────────────────────────────── */}
        <section className="border-y px-4 py-8">
          <div className="mx-auto max-w-4xl">
            <BlurFade delay={0.1} inView>
              <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Built with
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                {TECH_STACK.map((tech) => (
                  <div key={tech.name} className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-semibold text-foreground/80">{tech.name}</span>
                    <span className="text-[10px] text-muted-foreground">{tech.detail}</span>
                  </div>
                ))}
              </div>
            </BlurFade>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────────── */}
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

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-t px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <BlurFade delay={0.1} inView>
              <div className="mb-12 text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Up and running in minutes
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
                  No complex setup. Create a board, add tasks, invite your team, and ship.
                </p>
              </div>
            </BlurFade>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map((item, index) => (
                <BlurFade key={item.step} delay={0.2 + index * 0.1} inView>
                  <div className="flex flex-col gap-3">
                    <div className="text-3xl font-bold tabular-nums text-muted-foreground/25">
                      {item.step}
                    </div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </BlurFade>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────────── */}
        <section className="border-t px-4 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <BlurFade delay={0.1} inView>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to ship faster?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
                Create your first board in seconds. Free to use, no credit card required.
              </p>
              <div className="mt-8">
                <Button size="lg" className="h-11 px-8" asChild>
                  <Link href="/register">
                    Get started for free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </BlurFade>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-background text-[10px] font-bold">
              K
            </div>
            <span className="text-sm font-semibold">KanbanFlow</span>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="text-xs text-muted-foreground">Real-time collaborative boards</span>
          </div>
          <nav
            className="flex items-center gap-5"
            aria-label="Footer navigation"
          >
            <a
              href="#features"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              How it works
            </a>
            <Link
              href="/register"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2025 KanbanFlow · Built with Next.js, Supabase, and shadcn/ui
        </p>
      </footer>
    </div>
  );
}
