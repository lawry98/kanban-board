'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { getActivityLogs } from '@/app/actions/task-actions';
import type { ActivityLogWithProfile } from '@/app/actions/task-actions';
import type { Action, Prisma } from '@prisma/client';

const ACTION_DESCRIPTIONS: Record<Action, (meta: Record<string, string>) => string> = {
  BOARD_CREATED: (meta) => `created board "${meta.title ?? 'Untitled'}"`,
  BOARD_UPDATED: (meta) =>
    meta.title ? `renamed the board to "${meta.title}"` : 'updated the board',
  BOARD_DELETED: (meta) => `deleted board "${meta.title ?? 'Untitled'}"`,
  TASK_CREATED: (meta) => `created task "${meta.title ?? 'Untitled'}"`,
  TASK_MOVED: (meta) =>
    `moved "${meta.taskTitle ?? 'a task'}" from ${meta.fromColumn ?? '?'} to ${meta.toColumn ?? '?'}`,
  TASK_UPDATED: () => 'updated a task',
  TASK_DELETED: (meta) => `deleted task "${meta.title ?? 'Untitled'}"`,
  // Note: this previously fell back to `meta.boardTitle`, a key no writer ever
  // emits. Board-level events now have their own BOARD_* actions.
  COLUMN_CREATED: (meta) => `created column "${meta.title ?? 'Untitled'}"`,
  COLUMN_UPDATED: () => 'updated a column',
  COLUMN_DELETED: (meta) => `deleted column "${meta.title ?? 'Untitled'}"`,
  MEMBER_ADDED: (meta) =>
    `added ${meta.email ?? 'a member'} as ${meta.role?.toLowerCase() ?? 'member'}`,
  MEMBER_REMOVED: () => 'removed a member',
};

/**
 * `metadata` is `Json`, so nothing guarantees its shape. Flatten the scalar
 * entries to strings and drop everything else instead of casting blindly.
 */
function toMetaRecord(metadata: Prisma.JsonValue): Record<string, string> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') record[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') record[key] = String(value);
  }
  return record;
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
      <SheetContent className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Activity</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />
        <ScrollArea className="h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="space-y-4 pr-4">
              {LOG_PLACEHOLDERS.map((key) => (
                <div key={key} className="flex gap-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
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
                const meta = toMetaRecord(log.metadata);
                const description = ACTION_DESCRIPTIONS[log.action]?.(meta) ?? 'did something';

                return (
                  <div key={log.id} className="flex gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      {log.profile?.avatarUrl && (
                        <AvatarImage src={log.profile.avatarUrl} alt={name} />
                      )}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
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
