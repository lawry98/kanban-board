'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { getActivityLogs } from '@/app/actions/task-actions';
import type { ActivityLogWithProfile } from '@/app/actions/task-actions';
import type { Action, Prisma } from '@prisma/client';

interface ActivityMeta {
  /** Scalar metadata values, stringified. */
  values: Record<string, string>;
  /** `fields` written by *_UPDATED actions: which inputs the edit touched. */
  fields: string[];
}

/** Board writers used `boardTitle` before they switched to `title`; rows of both shapes exist. */
function boardTitle({ values }: ActivityMeta): string | undefined {
  return values.title ?? values.boardTitle;
}

const ACTION_DESCRIPTIONS: Record<Action, (meta: ActivityMeta) => string> = {
  BOARD_CREATED: (meta) => `created board "${boardTitle(meta) ?? 'Untitled'}"`,
  // `updateBoard` always logs the board's current title, so only `fields` says what changed.
  BOARD_UPDATED: (meta) => {
    const title = boardTitle(meta);
    if (title && meta.fields.includes('title')) return `renamed the board to "${title}"`;
    if (meta.fields.includes('description')) return 'updated the board description';
    return 'updated the board';
  },
  BOARD_DELETED: (meta) => `deleted board "${boardTitle(meta) ?? 'Untitled'}"`,
  TASK_CREATED: ({ values }) => `created task "${values.title ?? 'Untitled'}"`,
  TASK_MOVED: ({ values }) =>
    `moved "${values.taskTitle ?? 'a task'}" from ${values.fromColumn ?? '?'} to ${values.toColumn ?? '?'}`,
  TASK_UPDATED: () => 'updated a task',
  TASK_DELETED: ({ values }) => `deleted task "${values.title ?? 'Untitled'}"`,
  COLUMN_CREATED: ({ values }) =>
    // Before BOARD_CREATED existed, board creation was logged as COLUMN_CREATED { boardTitle }.
    values.title === undefined && values.boardTitle !== undefined
      ? `created board "${values.boardTitle}"`
      : `created column "${values.title ?? 'Untitled'}"`,
  COLUMN_UPDATED: () => 'updated a column',
  COLUMN_DELETED: ({ values }) => `deleted column "${values.title ?? 'Untitled'}"`,
  MEMBER_ADDED: ({ values }) =>
    `added ${values.email ?? 'a member'} as ${values.role?.toLowerCase() ?? 'member'}`,
  MEMBER_REMOVED: () => 'removed a member',
  MEMBER_ROLE_CHANGED: ({ values }) =>
    `changed ${values.email ?? 'a member'}'s role to ${values.role?.toLowerCase() ?? 'member'}`,
};

/**
 * `metadata` is `Json`, so nothing guarantees its shape. Flatten the scalar
 * entries to strings, keep the string entries of an array `fields`, and drop
 * everything else instead of casting blindly.
 */
function toActivityMeta(metadata: Prisma.JsonValue): ActivityMeta {
  const meta: ActivityMeta = { values: {}, fields: [] };
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return meta;
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') meta.values[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') {
      meta.values[key] = String(value);
    } else if (key === 'fields' && Array.isArray(value)) {
      meta.fields = value.filter((field): field is string => typeof field === 'string');
    }
  }
  return meta;
}

// Static loading placeholders — named keys rather than array indices.
const LOG_PLACEHOLDERS = ['log-a', 'log-b', 'log-c', 'log-d', 'log-e'];

interface ActivityFeedProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityFeed({ boardId, open, onOpenChange }: ActivityFeedProps) {
  // `null` means "not loaded yet", which is what drives the skeleton. Keeping it in the
  // data state rather than a separate `isLoading` flag means the fetch performs no
  // synchronous setState, so it is safe to kick off from an effect.
  // `null` means "not loaded yet", which drives the skeleton.
  const [logs, setLogs] = useState<ActivityLogWithProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-runs the load effect — that is how the Refresh/Retry button re-fetches
  // without a second fetch code path (all state updates stay inside the effect's promise).
  const [reloadKey, setReloadKey] = useState(0);
  // The sheet opens from the parent's state, not a SheetTrigger, so Radix has no trigger to
  // refocus on close and drops focus to <body>. Focus goes back to whatever opened it instead.
  const openerRef = useRef<HTMLElement | null>(null);

  const isLoading = logs === null && error === null;

  const refresh = useCallback(() => {
    setLogs(null);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // The sheet is opened by the parent (BoardHeader → setActivityOpen(true)), and Radix's
  // onOpenChange only fires for *internally* initiated changes, so the fetch keys off the
  // `open` prop itself. `cancelled` drops a stale response when the board changes or the
  // sheet closes mid-flight — the state updates all land in the .then() continuation, never
  // synchronously in the effect body.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getActivityLogs(boardId).then((result) => {
      if (cancelled) return;
      if ('error' in result && result.error) {
        // A failed load must not be indistinguishable from an empty feed.
        setError(result.error);
        return;
      }
      setError(null);
      setLogs('data' in result && result.data ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, boardId, reloadKey]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-80 sm:w-96"
        onOpenAutoFocus={() => {
          // Runs before Radix moves focus into the sheet, so this is still the opener.
          openerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Activity</SheetTitle>
          <SheetDescription className="sr-only">Recent changes to this board.</SheetDescription>
        </SheetHeader>
        <Separator className="my-4" />
        <ScrollArea className="h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="space-y-4 pr-4">
              {LOG_PLACEHOLDERS.map((key) => (
                <div key={key} className="flex gap-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full motion-reduce:animate-none" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full motion-reduce:animate-none" />
                    <Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 pr-4">
              {error !== null && (
                <p className="text-destructive py-6 text-center text-sm">{error}</p>
              )}

              {error === null && logs?.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No activity yet</p>
              )}

              {logs?.map((log) => {
                const name = log.profile?.fullName ?? 'Unknown user';
                const initials = name.slice(0, 2).toUpperCase();
                const meta = toActivityMeta(log.metadata);
                const description = ACTION_DESCRIPTIONS[log.action]?.(meta) ?? 'did something';

                return (
                  <div key={log.id} className="flex gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      {log.profile?.avatarUrl && (
                        <AvatarImage src={log.profile.avatarUrl} alt={name} />
                      )}
                      <AvatarFallback className="text-foreground text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{name}</span>{' '}
                        <span className="text-muted-foreground">{description}</span>
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Always reachable — previously nested inside `logs.length > 0`,
                  so a feed that failed to load could never be retried. */}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground w-full"
                onClick={refresh}
              >
                {error !== null ? 'Retry' : 'Refresh'}
              </Button>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
