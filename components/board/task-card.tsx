'use client';

import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { formatDistanceToNow } from 'date-fns';
import { Clock, AlertCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants';
import { useBoardContext } from '@/contexts/board-context';
import type { TaskWithAssignee } from '@/types';

interface TaskCardProps {
  task: TaskWithAssignee;
  index: number;
  onClick: (task: TaskWithAssignee) => void;
}

export const TaskCard = memo(function TaskCard({ task, index, onClick }: TaskCardProps) {
  // Viewers can open a card (read-only) but not drag it. `canEdit` is reactive to
  // live membership, so a demotion disables dragging without a reload. Consuming
  // context here bypasses React.memo for role changes, which is what we want.
  const { canEdit } = useBoardContext();
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const assigneeName = task.assignee?.fullName ?? undefined;
  const assigneeInitials = assigneeName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canEdit}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(task)}
          className={cn(
            'group bg-card rounded-md border p-3 text-sm shadow-sm',
            'transition-shadow hover:shadow-md',
            canEdit ? 'cursor-pointer' : 'cursor-default',
            snapshot.isDragging && 'ring-primary/20 rotate-1 shadow-lg ring-1',
          )}
        >
          {/* Priority badge */}
          {task.priority !== 'NONE' && (
            <div className="mb-2">
              <Badge
                variant="outline"
                className={cn('px-1.5 py-0 text-xs', PRIORITY_COLORS[task.priority])}
              >
                {PRIORITY_LABELS[task.priority]}
              </Badge>
            </div>
          )}

          {/* Title */}
          <p className="mb-2 line-clamp-3 leading-snug font-medium">{task.title}</p>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {task.labels.slice(0, 3).map((label) => (
                <Badge key={label} variant="secondary" className="px-1.5 py-0 text-xs">
                  {label}
                </Badge>
              ))}
              {task.labels.length > 3 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                  +{task.labels.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Footer: due date + assignee */}
          {(task.dueDate || task.assignee) && (
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              {task.dueDate ? (
                <div
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    isOverdue ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  <span>{formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}</span>
                </div>
              ) : (
                <span />
              )}

              {task.assignee && (
                <Avatar className="h-5 w-5">
                  {task.assignee.avatarUrl && (
                    <AvatarImage src={task.assignee.avatarUrl} alt={assigneeName ?? ''} />
                  )}
                  <AvatarFallback className="text-[10px]">{assigneeInitials}</AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
});
