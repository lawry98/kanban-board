import { describe, expect, it } from 'vitest';

import { boardReducer } from '@/contexts/board-context';

import type { BoardState, ColumnWithTasks, TaskWithAssignee } from '@/types';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

/**
 * Minimal structural fixtures. The reducer only reads `id`, `columnId`, `tasks`,
 * `position` and `updatedAt`, so the remaining Prisma relation fields are cast
 * rather than fully built.
 */
function makeTask(id: string, columnId: string, position: number): TaskWithAssignee {
  return {
    id,
    columnId,
    boardId: 'board-1',
    title: `Task ${id}`,
    description: null,
    position,
    priority: 'NONE',
    labels: [],
    dueDate: null,
    assigneeId: null,
    createdBy: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    assignee: null,
    creator: null,
  } as unknown as TaskWithAssignee;
}

function makeColumn(id: string, taskIds: string[]): ColumnWithTasks {
  return {
    id,
    boardId: 'board-1',
    title: `Column ${id}`,
    color: null,
    position: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: taskIds.map((taskId, i) => makeTask(taskId, id, i)),
  } as unknown as ColumnWithTasks;
}

function makeState(): BoardState {
  return {
    columns: [makeColumn('todo', ['t1', 't2', 't3']), makeColumn('done', ['d1'])],
    members: [],
  };
}

/** Order of task ids per column — the reducer's meaningful output. */
function layout(state: BoardState): Record<string, string[]> {
  return Object.fromEntries(state.columns.map((c) => [c.id, c.tasks.map((t) => t.id)]));
}

describe('boardReducer', () => {
  it('SYNC_STATE adopts the server snapshot', () => {
    const next: BoardState = { columns: [makeColumn('only', ['x1'])], members: [] };

    const result = boardReducer(makeState(), { type: 'SYNC_STATE', payload: next });

    expect(layout(result)).toEqual({ only: ['x1'] });
  });

  it('SYNC_STATE with an identical snapshot keeps the previous state reference', () => {
    const state = makeState();

    // A realtime refetch deserializes a fresh object tree; reconciliation must
    // not invalidate memoized cards when nothing materially changed.
    const result = boardReducer(state, { type: 'SYNC_STATE', payload: makeState() });

    expect(result).toBe(state);
  });

  it('ADD_TASK appends to the target column and leaves other columns untouched', () => {
    const state = makeState();

    const result = boardReducer(state, {
      type: 'ADD_TASK',
      payload: makeTask('t4', 'todo', 3),
    });

    expect(layout(result)).toEqual({ todo: ['t1', 't2', 't3', 't4'], done: ['d1'] });
    expect(layout(state)).toEqual({ todo: ['t1', 't2', 't3'], done: ['d1'] });
  });

  it('DELETE_TASK removes the task from the named column only', () => {
    const result = boardReducer(makeState(), {
      type: 'DELETE_TASK',
      payload: { taskId: 't2', columnId: 'todo' },
    });

    expect(layout(result)).toEqual({ todo: ['t1', 't3'], done: ['d1'] });
  });

  it('MOVE_TASK reorders within a single column', () => {
    const result = boardReducer(makeState(), {
      type: 'MOVE_TASK',
      payload: {
        taskId: 't3',
        fromColumnId: 'todo',
        toColumnId: 'todo',
        fromIndex: 2,
        toIndex: 0,
      },
    });

    expect(layout(result)).toEqual({ todo: ['t3', 't1', 't2'], done: ['d1'] });
  });

  it('MOVE_TASK across columns relocates the task and rewrites its columnId', () => {
    const state = makeState();

    const result = boardReducer(state, {
      type: 'MOVE_TASK',
      payload: {
        taskId: 't1',
        fromColumnId: 'todo',
        toColumnId: 'done',
        fromIndex: 0,
        toIndex: 0,
      },
    });

    expect(layout(result)).toEqual({ todo: ['t2', 't3'], done: ['t1', 'd1'] });

    const moved = result.columns.find((c) => c.id === 'done')?.tasks.find((t) => t.id === 't1');
    expect(moved?.columnId).toBe('done');

    // Input state must not be mutated — the reducer feeds optimistic rollback.
    expect(layout(state)).toEqual({ todo: ['t1', 't2', 't3'], done: ['d1'] });
  });

  it('MOVE_TASK is a no-op when the task is not in the source column', () => {
    const state = makeState();

    const result = boardReducer(state, {
      type: 'MOVE_TASK',
      payload: {
        taskId: 'nope',
        fromColumnId: 'todo',
        toColumnId: 'done',
        fromIndex: 0,
        toIndex: 0,
      },
    });

    expect(result).toBe(state);
  });

  it('ADD_COLUMN and DELETE_COLUMN add and remove columns', () => {
    const added = boardReducer(makeState(), {
      type: 'ADD_COLUMN',
      payload: makeColumn('review', []),
    });
    expect(added.columns.map((c) => c.id)).toEqual(['todo', 'done', 'review']);

    const removed = boardReducer(added, {
      type: 'DELETE_COLUMN',
      payload: { columnId: 'done' },
    });
    expect(removed.columns.map((c) => c.id)).toEqual(['todo', 'review']);
  });
});
