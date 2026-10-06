import { describe, expect, it } from 'vitest';

import { boardReducer } from '@/contexts/board-context';

import type {
  BoardMemberWithProfile,
  BoardState,
  ColumnWithTasks,
  TaskWithAssignee,
} from '@/types';
import type { Role } from '@prisma/client';

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
    meta: { title: 'Board', description: null },
    columns: [makeColumn('todo', ['t1', 't2', 't3']), makeColumn('done', ['d1'])],
    members: [],
  };
}

function makeMember(id: string, userId: string, role: Role): BoardMemberWithProfile {
  return {
    id,
    boardId: 'board-1',
    userId,
    role,
    joinedAt: EPOCH,
    profile: {
      id: userId,
      email: `${userId}@example.com`,
      fullName: `User ${userId}`,
      avatarUrl: null,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
  };
}

function makeMemberState(): BoardState {
  return {
    ...makeState(),
    members: [makeMember('m1', 'u1', 'OWNER'), makeMember('m2', 'u2', 'EDITOR')],
  };
}

/** Order of task ids per column — the reducer's meaningful output. */
function layout(state: BoardState): Record<string, string[]> {
  return Object.fromEntries(state.columns.map((c) => [c.id, c.tasks.map((t) => t.id)]));
}

describe('boardReducer', () => {
  it('SYNC_STATE adopts the server snapshot', () => {
    const next: BoardState = { ...makeState(), columns: [makeColumn('only', ['x1'])] };

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

  it("SYNC_STATE adopts a renamed board's metadata", () => {
    const state = makeState();

    const result = boardReducer(state, {
      type: 'SYNC_STATE',
      payload: { ...makeState(), meta: { title: 'Renamed', description: null } },
    });

    expect(result.meta.title).toBe('Renamed');
    // Only the metadata moved; the memoized columns keep their identity.
    expect(result.columns).toBe(state.columns);
    expect(result.members).toBe(state.members);
  });

  it('SYNC_STATE keeps the meta reference when title and description are unchanged', () => {
    const state = makeState();

    const result = boardReducer(state, {
      type: 'SYNC_STATE',
      payload: { ...makeState(), meta: { title: 'Board', description: null } },
    });

    expect(result.meta).toBe(state.meta);
    expect(result).toBe(state);
  });

  it('UPDATE_BOARD merges a title change and leaves columns and members untouched', () => {
    const state = makeState();

    const result = boardReducer(state, { type: 'UPDATE_BOARD', payload: { title: 'Roadmap' } });

    expect(result.meta).toEqual({ title: 'Roadmap', description: null });
    expect(result.columns).toBe(state.columns);
    expect(result.members).toBe(state.members);
    expect(state.meta.title).toBe('Board');
  });

  it('UPDATE_BOARD is a no-op when nothing changes', () => {
    const state = makeState();

    expect(boardReducer(state, { type: 'UPDATE_BOARD', payload: { title: 'Board' } })).toBe(state);
    expect(boardReducer(state, { type: 'UPDATE_BOARD', payload: {} })).toBe(state);
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

  it('ADD_TASK is a no-op when a sync already holds the task, even in another column', () => {
    // A collaborator moved the new task to `done` before the creator's ADD_TASK landed.
    const synced = boardReducer(makeState(), {
      type: 'SYNC_STATE',
      payload: {
        ...makeState(),
        columns: [makeColumn('todo', ['t1', 't2', 't3']), makeColumn('done', ['d1', 't4'])],
      },
    });

    const added = boardReducer(synced, { type: 'ADD_TASK', payload: makeTask('t4', 'todo', 3) });

    expect(layout(added)).toEqual({ todo: ['t1', 't2', 't3'], done: ['d1', 't4'] });
    expect(added).toBe(synced);
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

  it('ADD_COLUMN followed by its realtime echo leaves exactly one copy', () => {
    const added = boardReducer(makeState(), {
      type: 'ADD_COLUMN',
      payload: makeColumn('review', []),
    });
    const echo: BoardState = {
      ...makeState(),
      columns: [
        makeColumn('todo', ['t1', 't2', 't3']),
        makeColumn('done', ['d1']),
        makeColumn('review', []),
      ],
    };

    const synced = boardReducer(added, { type: 'SYNC_STATE', payload: echo });

    expect(synced.columns.map((c) => c.id)).toEqual(['todo', 'done', 'review']);
    // Reconciliation keeps the locally added column, so the echo does not re-render.
    expect(synced).toBe(added);
  });

  it('ADD_COLUMN is a no-op when a sync already holds the column', () => {
    const synced = boardReducer(makeState(), {
      type: 'SYNC_STATE',
      payload: {
        ...makeState(),
        columns: [
          makeColumn('todo', ['t1', 't2', 't3']),
          makeColumn('done', ['d1']),
          makeColumn('review', []),
        ],
      },
    });

    const added = boardReducer(synced, { type: 'ADD_COLUMN', payload: makeColumn('review', []) });

    expect(added.columns.map((c) => c.id)).toEqual(['todo', 'done', 'review']);
    expect(added).toBe(synced);
  });

  describe('members', () => {
    it('ADD_MEMBER appends the member without mutating the input', () => {
      const state = makeMemberState();

      const result = boardReducer(state, {
        type: 'ADD_MEMBER',
        payload: makeMember('m3', 'u3', 'VIEWER'),
      });

      expect(result.members.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      expect(state.members.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('UPDATE_MEMBER replaces that member and keeps every other member reference', () => {
      const state = makeMemberState();

      const result = boardReducer(state, {
        type: 'UPDATE_MEMBER',
        payload: makeMember('m2', 'u2', 'VIEWER'),
      });

      expect(result.members.map((m) => [m.id, m.role])).toEqual([
        ['m1', 'OWNER'],
        ['m2', 'VIEWER'],
      ]);
      expect(result.members[0]).toBe(state.members[0]);
    });

    it('REMOVE_MEMBER removes the member with that id', () => {
      const result = boardReducer(makeMemberState(), {
        type: 'REMOVE_MEMBER',
        payload: { memberId: 'm2' },
      });

      expect(result.members.map((m) => m.id)).toEqual(['m1']);
    });

    it('ADD_MEMBER is a no-op when a sync already holds the member', () => {
      const synced = boardReducer(makeMemberState(), {
        type: 'SYNC_STATE',
        payload: {
          ...makeState(),
          members: [
            makeMember('m1', 'u1', 'OWNER'),
            makeMember('m2', 'u2', 'EDITOR'),
            makeMember('m3', 'u3', 'VIEWER'),
          ],
        },
      });

      const added = boardReducer(synced, {
        type: 'ADD_MEMBER',
        payload: makeMember('m3', 'u3', 'VIEWER'),
      });

      expect(added.members.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      expect(added).toBe(synced);
    });

    it('ADD_MEMBER followed by its realtime echo leaves exactly one copy', () => {
      const added = boardReducer(makeMemberState(), {
        type: 'ADD_MEMBER',
        payload: makeMember('m3', 'u3', 'VIEWER'),
      });
      const echo: BoardState = {
        ...makeState(),
        members: [
          makeMember('m1', 'u1', 'OWNER'),
          makeMember('m2', 'u2', 'EDITOR'),
          makeMember('m3', 'u3', 'VIEWER'),
        ],
      };

      const synced = boardReducer(added, { type: 'SYNC_STATE', payload: echo });

      expect(synced.members.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      expect(synced.members).toBe(added.members);
    });

    it('UPDATE_MEMBER does not resurrect a member a sync already removed', () => {
      const state = makeMemberState();

      const result = boardReducer(state, {
        type: 'UPDATE_MEMBER',
        payload: makeMember('m3', 'u3', 'VIEWER'),
      });

      expect(result).toBe(state);
    });

    it('UPDATE_MEMBER keeps the state reference when the echo already applied it', () => {
      const state = makeMemberState();

      // A fresh but identical row, as a resync that beat the action's response delivers.
      const result = boardReducer(state, {
        type: 'UPDATE_MEMBER',
        payload: makeMember('m2', 'u2', 'EDITOR'),
      });

      expect(result).toBe(state);
    });

    it('REMOVE_MEMBER is a no-op when the member is already gone', () => {
      const state = makeMemberState();

      const result = boardReducer(state, {
        type: 'REMOVE_MEMBER',
        payload: { memberId: 'm3' },
      });

      expect(result).toBe(state);
    });
  });
});
