'use client';

import { useState, useMemo } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const isFiltered = searchQuery.trim() !== '' || priorityFilter !== 'ALL';

  const filteredColumns = useMemo(() => {
    if (!isFiltered) return state.columns;

    const query = searchQuery.toLowerCase().trim();
    return state.columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) => {
        const matchesSearch =
          !query ||
          task.title.toLowerCase().includes(query) ||
          (task.description?.toLowerCase().includes(query) ?? false) ||
          task.labels.some((l) => l.toLowerCase().includes(query)) ||
          (task.assignee?.fullName?.toLowerCase().includes(query) ?? false) ||
          (task.assignee?.email?.toLowerCase().includes(query) ?? false);
        const matchesPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
        return matchesSearch && matchesPriority;
      }),
    }));
  }, [state.columns, searchQuery, priorityFilter, isFiltered]);

  useRealtime(board.id, dispatch);

  function handleDragStart() {
    setIsDragging(true);
  }

  async function handleDragEnd(result: DropResult) {
    setIsDragging(false);
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Disable drag when filters are active to avoid index mismatch.
    // TODO: Implement ID-based position resolution to allow drag during filtering.
    if (isFiltered) return;

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
      <BoardHeader
        onOpenActivity={() => setActivityOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
      />

      {isFiltered && (
        <div className="px-4 sm:px-6 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b flex items-center gap-2">
          <span>
            Showing filtered results.{' '}
            {canEdit && 'Drag-and-drop is disabled while filters are active.'}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex h-full items-start gap-4 p-4 sm:p-6">
            {filteredColumns.map((column) => (
              <Column key={column.id} column={column} onTaskClick={setSelectedTask} isDragging={isDragging} />
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
