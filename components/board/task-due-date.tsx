'use client';

import { AlertCircle, Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCalendarDate, formatDueDate, isOverdue } from '@/lib/dates';
import { useToday } from '@/hooks/use-today';

interface TaskDueDateProps {
  dueDate: Date;
}

export function TaskDueDate({ dueDate }: TaskDueDateProps) {
  const today = useToday();
  // `today` is unknown until hydration; never claim overdue on the server's guess.
  const overdue = today !== null && isOverdue(dueDate, today);
  const Icon = overdue ? AlertCircle : Clock;

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs',
        overdue ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="sr-only">{overdue ? 'Overdue: ' : 'Due '}</span>
      <time dateTime={formatCalendarDate(dueDate)}>{formatDueDate(dueDate, today)}</time>
    </div>
  );
}
