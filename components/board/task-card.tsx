'use client';

import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { formatDistanceToNow } from 'date-fns';
import { Clock, AlertCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants';
import type { TaskWithAssignee } from '@/types';

interface TaskCardProps {
  task: TaskWithAssignee;
  index: number;
  onClick: (task: TaskWithAssignee) => void;
}

export const TaskCard = memo(function TaskCard({ task, index, onClick }: TaskCardProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const assigneeName = task.assignee?.fullName ?? task.assignee?.email;
  const assigneeInitials = assigneeName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(task)}
          className={cn(
            'group rounded-md border bg-card p-3 text-sm shadow-sm cursor-pointer',
            'transition-shadow hover:shadow-md',
            snapshot.isDragging && 'rotate-1 shadow-lg ring-1 ring-primary/20',
          )}
        >
          {/* Priority badge */}
          {task.priority !== 'NONE' && (
            <div className="mb-2">
              <Badge
                variant="outline"
                className={cn('text-xs py-0 px-1.5', PRIORITY_COLORS[task.priority])}
              >
                {PRIORITY_LABELS[task.priority]}
              </Badge>
            </div>
          )}

          {/* Title */}
          <p className="font-medium leading-snug line-clamp-3 mb-2">{task.title}</p>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.labels.slice(0, 3).map((label) => (
                <Badge key={label} variant="secondary" className="text-xs py-0 px-1.5">
                  {label}
                </Badge>
              ))}
              {task.labels.length > 3 && (
                <Badge variant="secondary" className="text-xs py-0 px-1.5">
                  +{task.labels.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Footer: due date + assignee */}
          {(task.dueDate || task.assignee) && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              {task.dueDate ? (
                <div
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    isOverdue ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {isOverdue ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
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
