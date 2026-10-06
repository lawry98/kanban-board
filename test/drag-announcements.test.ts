import { describe, expect, it } from 'vitest';
import type { DragStart, DragUpdate, DropResult } from '@hello-pangea/dnd';

import {
  DRAG_HANDLE_INSTRUCTIONS,
  announceDragEnd,
  announceDragStart,
  announceDragUpdate,
} from '@/lib/drag-announcements';
import type { ColumnWithTasks, TaskWithAssignee } from '@/types';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

function task(id: string, columnId: string, title: string): TaskWithAssignee {
  return {
    id,
    columnId,
    boardId: 'b',
    title,
    description: null,
    position: 1000,
    priority: 'NONE',
    labels: [],
    dueDate: null,
    assigneeId: null,
    createdBy: 'u',
    createdAt: EPOCH,
    updatedAt: EPOCH,
    assignee: null,
    creator: null,
  };
}

const COLUMNS: ColumnWithTasks[] = [
  {
    id: 'todo',
    boardId: 'b',
    title: 'To do',
    color: null,
    position: 1,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: [task('t1', 'todo', 'Write launch post'), task('t2', 'todo', 'Book venue')],
  },
  {
    id: 'done',
    boardId: 'b',
    title: 'Done',
    color: null,
    position: 2,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: [task('t3', 'done', 'Pick date')],
  },
];

const base = {
  draggableId: 't1',
  type: 'DEFAULT',
  mode: 'SNAP',
  source: { droppableId: 'todo', index: 0 },
} as const;

describe('drag announcements', () => {
  it('names the task, column and position on pick-up', () => {
    expect(announceDragStart(base as DragStart, COLUMNS)).toBe(
      'Picked up Write launch post. It is at position 1 of 2 in the To do column.',
    );
  });

  it('counts the extra slot when moving into another column', () => {
    const update = {
      ...base,
      destination: { droppableId: 'done', index: 1 },
      combine: null,
    } as DragUpdate;
    expect(announceDragUpdate(update, COLUMNS)).toBe(
      'Moved to position 2 of 2 in the Done column.',
    );
  });

  it('does not count an extra slot within the same column', () => {
    const update = {
      ...base,
      destination: { droppableId: 'todo', index: 1 },
      combine: null,
    } as DragUpdate;
    expect(announceDragUpdate(update, COLUMNS)).toBe(
      'Moved to position 2 of 2 in the To do column.',
    );
  });

  it('says when the card is not over a column', () => {
    const update = { ...base, destination: null, combine: null } as DragUpdate;
    expect(announceDragUpdate(update, COLUMNS)).toBe('Write launch post is not over a column.');
  });

  it('confirms the drop', () => {
    const result = {
      ...base,
      destination: { droppableId: 'done', index: 0 },
      combine: null,
      reason: 'DROP',
    } as DropResult;
    expect(announceDragEnd(result, COLUMNS)).toBe(
      'Dropped Write launch post at position 1 of 2 in the Done column.',
    );
  });

  it('says where a cancelled card went back to', () => {
    const result = { ...base, destination: null, combine: null, reason: 'CANCEL' } as DropResult;
    expect(announceDragEnd(result, COLUMNS)).toBe(
      'Movement cancelled. Write launch post is back at position 1 of 2 in the To do column.',
    );
  });

  it('says a card dropped outside every column went back', () => {
    const result = { ...base, destination: null, combine: null, reason: 'DROP' } as DropResult;
    expect(announceDragEnd(result, COLUMNS)).toBe(
      'Write launch post was dropped outside a column. It is back at position 1 of 2 in the To do column.',
    );
  });

  it('never reads out ids', () => {
    const update = {
      ...base,
      destination: { droppableId: 'done', index: 0 },
      combine: null,
    } as DragUpdate;
    for (const message of [
      announceDragStart(base as DragStart, COLUMNS),
      announceDragUpdate(update, COLUMNS),
    ]) {
      expect(message).not.toMatch(/\b(todo|done|t1)\b/);
    }
  });

  it('tells keyboard users Enter opens and Space drags', () => {
    expect(DRAG_HANDLE_INSTRUCTIONS).toMatch(/Enter to open/);
    expect(DRAG_HANDLE_INSTRUCTIONS).toMatch(/space bar/i);
  });
});
