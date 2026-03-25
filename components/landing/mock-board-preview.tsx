import { cn } from '@/lib/utils';

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

function MockLabelBadge({ label }: { label: MockLabel }) {
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
          <MockLabelBadge key={label.text} label={label} />
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

export function MockBoardPreview() {
  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[680px] rounded-xl border bg-background shadow-2xl shadow-black/5 dark:shadow-black/20">
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
  );
}
