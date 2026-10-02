import { format } from 'date-fns';

/**
 * Due dates are calendar days ("2026-10-02"), not instants.
 *
 * Clients send them as `YYYY-MM-DD` strings — what `<input type="date">` emits — and they
 * are stored in a Postgres DATE column. Prisma models DATE as a JS `Date` pinned to UTC
 * midnight of that day, which is what the server hands back, so the `Date` is only ever
 * read through its UTC fields here. Formatting it in local time (date-fns `format(date)`,
 * `toLocaleDateString()`) shows the previous day everywhere behind UTC; that is the bug
 * these helpers exist to prevent.
 */

/** `YYYY-MM-DD` → the UTC-midnight `Date` Prisma expects for a DATE column. */
export function parseCalendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  // A round trip rejects every other shape, and the ISO parser rolling 2026-02-30 over to
  // March 2.
  if (Number.isNaN(date.getTime()) || formatCalendarDate(date) !== value) {
    throw new RangeError(`Not a calendar date: ${value}`);
  }
  return date;
}

/** A stored due date → its `YYYY-MM-DD` day, regardless of the viewer's time zone. */
export function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The local calendar day of `now`, as `YYYY-MM-DD` — the viewer's "today" in the browser. */
export function localToday(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/** Overdue means the due day is before the viewer's today; a task due today is not overdue. */
export function isOverdue(dueDate: Date, today: string): boolean {
  // Zero-padded YYYY-MM-DD strings sort chronologically.
  return formatCalendarDate(dueDate) < today;
}

// `timeZone: 'UTC'` reads the stored day itself, not the viewer's local view of UTC midnight.
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const DAY_AND_YEAR_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Oct 2", or "Jan 5, 2027" outside the viewer's current year (`today` is null until known). */
export function formatDueDate(dueDate: Date, today: string | null): string {
  const sameYear = today === null || today.slice(0, 4) === formatCalendarDate(dueDate).slice(0, 4);
  return (sameYear ? DAY_FORMAT : DAY_AND_YEAR_FORMAT).format(dueDate);
}
