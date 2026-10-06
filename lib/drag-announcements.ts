import type { DragStart, DragUpdate, DraggableLocation, DropResult } from '@hello-pangea/dnd';

import type { ColumnWithTasks } from '@/types';

/** Read (via aria-describedby) when an editor focuses a card. Pure: no I/O. */
export const DRAG_HANDLE_INSTRUCTIONS =
  'Press Enter to open the task. Press space bar to pick it up, use the arrow keys to move it ' +
  'within or between columns, then space bar to drop it or Escape to cancel. Some screen ' +
  'readers may require you to be in focus mode or to use your pass through key.';

// dnd's default messages read out droppable ids — column UUIDs here.

function columnTitle(columns: ColumnWithTasks[], columnId: string): string {
  return columns.find((column) => column.id === columnId)?.title ?? 'unknown';
}

function taskTitle(columns: ColumnWithTasks[], taskId: string): string {
  for (const column of columns) {
    const task = column.tasks.find((t) => t.id === taskId);
    if (task) return task.title;
  }
  return 'The task';
}

/** `columns` is pre-move state: a card arriving from another column adds a slot. */
function place(
  columns: ColumnWithTasks[],
  source: DraggableLocation,
  destination: DraggableLocation,
): string {
  const length = columns.find((c) => c.id === destination.droppableId)?.tasks.length ?? 0;
  const slots = source.droppableId === destination.droppableId ? length : length + 1;
  return `position ${destination.index + 1} of ${slots} in the ${columnTitle(columns, destination.droppableId)} column`;
}

export function announceDragStart(start: DragStart, columns: ColumnWithTasks[]): string {
  return `Picked up ${taskTitle(columns, start.draggableId)}. It is at ${place(columns, start.source, start.source)}.`;
}

export function announceDragUpdate(update: DragUpdate, columns: ColumnWithTasks[]): string {
  if (!update.destination) return `${taskTitle(columns, update.draggableId)} is not over a column.`;
  return `Moved to ${place(columns, update.source, update.destination)}.`;
}

export function announceDragEnd(result: DropResult, columns: ColumnWithTasks[]): string {
  const title = taskTitle(columns, result.draggableId);
  const origin = place(columns, result.source, result.source);
  if (result.reason === 'CANCEL') return `Movement cancelled. ${title} is back at ${origin}.`;
  if (!result.destination) return `${title} was dropped outside a column. It is back at ${origin}.`;
  return `Dropped ${title} at ${place(columns, result.source, result.destination)}.`;
}
