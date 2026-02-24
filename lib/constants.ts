import type { Priority } from '@prisma/client';

export const PRIORITY_COLORS: Record<Priority, string> = {
  NONE: '',
  LOW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
} as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  NONE: 'No priority',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
} as const;

export const DEFAULT_COLUMNS = [
  { title: 'To Do', color: '#6366f1' },
  { title: 'In Progress', color: '#f59e0b' },
  { title: 'Review', color: '#8b5cf6' },
  { title: 'Done', color: '#10b981' },
] as const;

export const MAX_COLUMNS = 8;
export const MAX_BOARD_TITLE_LENGTH = 50;
