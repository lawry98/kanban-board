'use client';

import { useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { AddColumnButton } from '@/components/board/add-column-button';
import { ActivityFeed } from '@/components/board/activity-feed';
import { BoardHeader } from '@/components/board/board-header';
import { Column } from '@/components/board/column';
import { TaskDetailDialog } from '@/components/board/task-detail-dialog';
import { BoardProvider, useBoardContext } from '@/contexts/board-context';
import { useRealtime } from '@/hooks/use-realtime';
import { moveTask } from '@/app/actions/task-actions';
import type { BoardWithDetails, TaskWithAssignee } from '@/types';

interface BoardViewProps {
  board: BoardWithDetails;
  currentUserId: string;
  userRole: 'OWNER' | 'EDITOR' | 'VIEWER';
}

function BoardContent() {
  const { state, dispatch, board, canEdit, isOwner } = useBoardContext();
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignee | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  // Drives the first-run coaching hint: a board with columns but no tasks yet.
  const taskCount = state.columns.reduce((sum, col) => sum + col.tasks.length, 0);

  useRealtime(board.id, dispatch);

  async function handleDragEnd(result: DropResult) {
    // Cards are isDragDisabled for viewers, so this shouldn't fire for them —
    // but guard anyway: a role change mid-drag must never optimistically move a
    // card only for the server to reject it.
    if (!canEdit) return;

    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index)
      return;

    // Optimistic update
    dispatch({
      type: 'MOVE_TASK',
      payload: {
        taskId: draggableId,
        fromColumnId: source.droppableId,
        toColumnId: destination.droppableId,
        fromIndex: source.index,
        toIndex: destination.index,
      },
    });

    // Server sync
    const result2 = await moveTask({
      taskId: draggableId,
      targetColumnId: destination.droppableId,
      targetIndex: destination.index,
    });
    if (result2.error) {
      // 'Forbidden' means the caller lost edit rights (e.g. demoted to viewer
      // between render and drop) — say so rather than a generic failure.
      toast.error(
        result2.error === 'Forbidden'
          ? "You're a viewer — you can't move tasks on this board"
          : 'Failed to move task',
      );
      // Revert by re-dispatching the original position
      dispatch({
        type: 'MOVE_TASK',
        payload: {
          taskId: draggableId,
          fromColumnId: destination.droppableId,
          toColumnId: source.droppableId,
          fromIndex: destination.index,
          toIndex: source.index,
        },
      });
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <BoardHeader onOpenActivity={() => setActivityOpen(true)} />

      {/* First-run coaching: only while the board has columns but no tasks, and only
          for members who can act on it (viewers cannot add tasks). Stateless — it
          disappears as soon as the first task exists. */}
      {canEdit && state.columns.length > 0 && taskCount === 0 && (
        <div className="bg-muted/40 border-b px-4 py-2.5 sm:px-6">
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Your board is ready — add your first task with{' '}
              <span className="text-foreground font-medium">Add task</span> in any column
              {isOwner && (
                <>
                  , or <span className="text-foreground font-medium">Share</span> it to collaborate
                  in real time
                </>
              )}
              .
            </span>
          </p>
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex h-full items-start gap-4 p-4 sm:p-6">
            {state.columns.map((column) => (
              <Column key={column.id} column={column} onTaskClick={setSelectedTask} />
            ))}
            {canEdit && <AddColumnButton />}
          </div>
        </DragDropContext>
      </div>

      <TaskDetailDialog task={selectedTask} onClose={() => setSelectedTask(null)} />
      <ActivityFeed boardId={board.id} open={activityOpen} onOpenChange={setActivityOpen} />
    </div>
  );
}

export function BoardView({ board, currentUserId, userRole }: BoardViewProps) {
  return (
    <BoardProvider board={board} currentUserId={currentUserId} userRole={userRole}>
      <BoardContent />
    </BoardProvider>
  );
}
