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

// UUID-shaped, as in the real app: a leak of any of them is unmistakable.
const TODO = '11111111-1111-4111-8111-111111111111';
const DONE = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333331';
const T2 = '33333333-3333-4333-8333-333333333332';
const T3 = '33333333-3333-4333-8333-333333333333';

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
    id: TODO,
    boardId: 'b',
    title: 'To do',
    color: null,
    position: 1,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: [task(T1, TODO, 'Write launch post'), task(T2, TODO, 'Book venue')],
  },
  {
    id: DONE,
    boardId: 'b',
    title: 'Done',
    color: null,
    position: 2,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: [task(T3, DONE, 'Pick date')],
  },
];

const base = {
  draggableId: T1,
  type: 'DEFAULT',
  mode: 'SNAP',
  source: { droppableId: TODO, index: 0 },
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
      destination: { droppableId: DONE, index: 1 },
      combine: null,
    } as DragUpdate;
    expect(announceDragUpdate(update, COLUMNS)).toBe(
      'Moved to position 2 of 2 in the Done column.',
    );
  });

  it('does not count an extra slot within the same column', () => {
    const update = {
      ...base,
      destination: { droppableId: TODO, index: 1 },
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
      destination: { droppableId: DONE, index: 0 },
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
    const moved = {
      ...base,
      destination: { droppableId: DONE, index: 0 },
      combine: null,
    } as DragUpdate;
    const messages = [
      announceDragStart(base as DragStart, COLUMNS),
      announceDragUpdate(moved, COLUMNS),
      announceDragUpdate({ ...moved, destination: null }, COLUMNS),
      announceDragEnd({ ...moved, reason: 'DROP' } as DropResult, COLUMNS),
      announceDragEnd({ ...moved, destination: null, reason: 'CANCEL' } as DropResult, COLUMNS),
      announceDragEnd({ ...moved, destination: null, reason: 'DROP' } as DropResult, COLUMNS),
    ];
    for (const message of messages) {
      for (const id of [TODO, DONE, T1, T2, T3]) expect(message).not.toContain(id);
    }
  });

  it('falls back to neutral wording when the task or column is gone', () => {
    const gone = { ...base, draggableId: 'removed-task' } as DragStart;
    expect(announceDragStart(gone, COLUMNS)).toBe(
      'Picked up the task. It is at position 1 of 2 in the To do column.',
    );
    const update = {
      ...base,
      destination: { droppableId: 'removed-column', index: 0 },
      combine: null,
    } as DragUpdate;
    expect(announceDragUpdate(update, COLUMNS)).toBe(
      'Moved to position 1 of 1 in the unknown column.',
    );
  });

  it('tells keyboard users Enter opens and Space drags', () => {
    expect(DRAG_HANDLE_INSTRUCTIONS).toMatch(/Enter to open/);
    expect(DRAG_HANDLE_INSTRUCTIONS).toMatch(/space bar/i);
  });
});
