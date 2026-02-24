'use client';

import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { getActivityLogs } from '@/app/actions/task-actions';
import type { Action } from '@prisma/client';
import type { Profile } from '@prisma/client';

interface ActivityLog {
  id: string;
  action: Action;
  entityType: string;
  metadata: unknown;
  createdAt: Date;
  profile: Profile;
}

const ACTION_DESCRIPTIONS: Record<Action, (meta: Record<string, string>, taskTitle?: string) => string> = {
  TASK_CREATED: (meta) => `created task "${meta.title ?? 'Untitled'}"`,
  TASK_MOVED: (meta) =>
    `moved "${meta.taskTitle ?? 'a task'}" from ${meta.fromColumn ?? '?'} to ${meta.toColumn ?? '?'}`,
  TASK_UPDATED: (_meta) => `updated a task`,
  TASK_DELETED: (meta) => `deleted task "${meta.title ?? 'Untitled'}"`,
  COLUMN_CREATED: (meta) => `created column "${meta.title ?? meta.boardTitle ?? 'Untitled'}"`,
  COLUMN_UPDATED: (_meta) => `updated a column`,
  COLUMN_DELETED: (meta) => `deleted column "${meta.title ?? 'Untitled'}"`,
  MEMBER_ADDED: (meta) => `added ${meta.email ?? 'a member'} as ${meta.role?.toLowerCase() ?? 'member'}`,
  MEMBER_REMOVED: (_meta) => `removed a member`,
};

interface ActivityFeedProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityFeed({ boardId, open, onOpenChange }: ActivityFeedProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    const result = await getActivityLogs(boardId);
    setIsLoading(false);
    if (result.data) {
      setLogs(result.data as unknown as ActivityLog[]);
    }
  }, [boardId]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (nextOpen) fetchLogs();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Activity</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />
        <ScrollArea className="h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="space-y-4 pr-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-4 pr-4">
              {logs.map((log) => {
                const name = log.profile.fullName ?? log.profile.email;
                const initials = name.slice(0, 2).toUpperCase();
                const meta = (typeof log.metadata === 'object' && log.metadata !== null)
                  ? (log.metadata as Record<string, string>)
                  : {};
                const description = ACTION_DESCRIPTIONS[log.action]?.(meta) ?? 'did something';

                return (
                  <div key={log.id} className="flex gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      {log.profile.avatarUrl && (
                        <AvatarImage src={log.profile.avatarUrl} alt={name} />
                      )}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{name}</span>{' '}
                        <span className="text-muted-foreground">{description}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={fetchLogs}
              >
                Refresh
              </Button>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
