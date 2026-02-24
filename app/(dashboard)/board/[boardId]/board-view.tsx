'use client';

import { useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
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
  const { state, dispatch, board, canEdit } = useBoardContext();
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignee | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  useRealtime(board.id, dispatch);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

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
    const result2 = await moveTask(draggableId, destination.droppableId, destination.index);
    if (result2.error) {
      toast.error('Failed to move task');
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
