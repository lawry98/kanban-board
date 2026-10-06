'use client';

import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TaskDueDate } from '@/components/board/task-due-date';
import { taskCardId } from '@/lib/dom-ids';
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
  const assigneeName = task.assignee?.fullName ?? undefined;
  const assigneeInitials = assigneeName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const titleId = `task-${task.id}-title`;
  // The card's accessible description is built from the sections it actually renders, in
  // visual order (never the title, which is its name), so only existing ids are referenced.
  const priorityId = `task-${task.id}-priority`;
  const labelsId = `task-${task.id}-labels`;
  const footerId = `task-${task.id}-footer`;
  const hiddenLabelCount = task.labels.length - 3;
  const hasFooter = Boolean(task.dueDate || task.assignee);

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canEdit}>
      {(provided, snapshot) => {
        const dragHandle = provided.dragHandleProps;
        // dnd's usage-instructions id comes last: details first, then how to drag.
        const describedBy = [
          task.priority !== 'NONE' && priorityId,
          task.labels.length > 0 && labelsId,
          hasFooter && footerId,
          dragHandle?.['aria-describedby'],
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...dragHandle}
            id={taskCardId(task.id)}
            // dnd only gives a draggable card its handle props (role, tabIndex, its usage
            // instructions); a viewer's card must still be reachable and openable.
            role="button"
            tabIndex={0}
            aria-labelledby={titleId}
            aria-describedby={describedBy || undefined}
            onClick={() => onClick(task)}
            onKeyDown={(e) => {
              // Enter opens. Space opens only a viewer's card: on an editor's it is dnd's
              // lift key. Skip keys dnd already consumed (it preventDefaults Enter mid-drag)
              // and keys bubbling up through a portal (React events do).
              const opens = e.key === 'Enter' || (e.key === ' ' && !dragHandle);
              if (!opens || e.defaultPrevented || e.target !== e.currentTarget) return;
              e.preventDefault();
              onClick(task);
            }}
            className={cn(
              'group bg-card rounded-md border p-3 text-sm shadow-sm',
              'transition-shadow hover:shadow-md',
              'focus-visible:ring-ring outline-none focus-visible:ring-2',
              canEdit ? 'cursor-pointer' : 'cursor-default',
              snapshot.isDragging && 'ring-primary/20 rotate-1 shadow-lg ring-1',
            )}
          >
            {/* Priority badge */}
            {task.priority !== 'NONE' && (
              <div id={priorityId} className="mb-2">
                <Badge
                  variant="outline"
                  className={cn('px-1.5 py-0 text-xs', PRIORITY_COLORS[task.priority])}
                >
                  {PRIORITY_LABELS[task.priority]}
                </Badge>
              </div>
            )}

            {/* Title */}
            <p id={titleId} className="mb-2 line-clamp-3 leading-snug font-medium">
              {task.title}
            </p>

            {/* Labels */}
            {task.labels.length > 0 && (
              <div id={labelsId} className="mb-2 flex flex-wrap gap-1">
                {task.labels.slice(0, 3).map((label) => (
                  <Badge key={label} variant="secondary" className="px-1.5 py-0 text-xs">
                    {label}
                  </Badge>
                ))}
                {hiddenLabelCount > 0 && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                    +{hiddenLabelCount}
                    <span className="sr-only"> more label{hiddenLabelCount === 1 ? '' : 's'}</span>
                  </Badge>
                )}
              </div>
            )}

            {/* Footer: due date + assignee */}
            {hasFooter && (
              <div id={footerId} className="mt-2 flex items-center justify-between border-t pt-2">
                {task.dueDate ? <TaskDueDate dueDate={task.dueDate} /> : <span />}

                {task.assignee && (
                  <>
                    <Avatar className="h-5 w-5" aria-hidden="true">
                      {task.assignee.avatarUrl && (
                        <AvatarImage src={task.assignee.avatarUrl} alt={assigneeName ?? ''} />
                      )}
                      <AvatarFallback className="text-[10px]">{assigneeInitials}</AvatarFallback>
                    </Avatar>
                    <span className="sr-only">Assigned to {assigneeName ?? 'a member'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      }}
    </Draggable>
  );
});
