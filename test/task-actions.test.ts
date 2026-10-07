import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type * as RateLimitModule from '@/lib/rate-limit';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    column: { findUnique: vi.fn() },
    boardMember: { findFirst: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  enforceRateLimit: vi.fn(async () => {}),
}));

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { RateLimitError, enforceRateLimit } from '@/lib/rate-limit';
import { createTask, moveTask, updateTask } from '@/app/actions/task-actions';

// Valid UUIDs — the action `uuidSchema.parse()`s every client-supplied id.
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const TODO_COLUMN = '55555555-5555-4555-8555-555555555555';
const DONE_COLUMN = '66666666-6666-4666-8666-666666666666';
const FOREIGN_COLUMN = '77777777-7777-4777-8777-777777777777';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

// The real Prisma return types are structurally huge and irrelevant to these
// authorization/positioning tests, so drive the mocks through a permissive handle.
const db = prisma as unknown as {
  task: { findUnique: Mock; findMany: Mock; aggregate: Mock; create: Mock; update: Mock };
  column: { findUnique: Mock };
  boardMember: { findFirst: Mock };
  activityLog: { create: Mock };
};
const mockedCreateClient = createClient as unknown as Mock;

function signInAs(id = USER_ID): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id, email: 'me@example.com' } },
        error: null,
      }),
    },
  });
}

/** Task A: the first card in To Do on board A. */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    columnId: TODO_COLUMN,
    boardId: BOARD_A,
    title: 'Task A',
    description: null,
    position: 1000,
    priority: 'NONE',
    labels: [],
    dueDate: null,
    assigneeId: null,
    createdBy: USER_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeColumn(overrides: Record<string, unknown> = {}) {
  return {
    id: DONE_COLUMN,
    boardId: BOARD_A,
    title: 'Done',
    position: 2000,
    color: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    boardId: BOARD_A,
    userId: USER_ID,
    role: 'EDITOR',
    joinedAt: CREATED_AT,
    ...overrides,
  };
}

/** The `data` argument of the single `prisma.task.update` call the action made. */
function writtenData(): Record<string, unknown> {
  expect(db.task.update).toHaveBeenCalledTimes(1);
  return db.task.update.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs();
  db.task.findUnique.mockResolvedValue(makeTask());
  db.boardMember.findFirst.mockResolvedValue(makeMember());
  db.task.update.mockResolvedValue({
    ...makeTask(),
    assignee: null,
    creator: { id: USER_ID, fullName: 'Me', avatarUrl: null },
  });
  db.activityLog.create.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateTask', () => {
  it('keeps the task in place when an edit re-sends its current column', async () => {
    // To Do holds A (1000) then B (2000); the edit must not sink A below B.
    db.column.findUnique.mockResolvedValue(makeColumn({ id: TODO_COLUMN, title: 'To Do' }));
    db.task.aggregate.mockResolvedValue({ _max: { position: 2000 } });

    // The task dialog sends `columnId` on every save, including plain content edits.
    const result = await updateTask(TASK_ID, {
      title: 'Task A',
      description: 'Updated notes',
      priority: 'HIGH',
      labels: ['bug'],
      columnId: TODO_COLUMN,
    });

    expect(result.error).toBeUndefined();
    // No `position` (and no redundant `columnId`) in the write: the row keeps its slot.
    expect(writtenData()).toEqual({
      title: 'Task A',
      description: 'Updated notes',
      priority: 'HIGH',
      labels: ['bug'],
    });
    expect(db.task.aggregate).not.toHaveBeenCalled();
    // Nothing to prove about a column the task is already in: requireColumnOnBoard is skipped.
    expect(db.column.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'after the last card', maxPosition: 3000, expected: 4000 },
    { label: 'as the first card of an empty column', maxPosition: null, expected: 1000 },
  ])('appends a task moved to another column $label', async ({ maxPosition, expected }) => {
    db.column.findUnique.mockResolvedValue(makeColumn({ id: DONE_COLUMN, boardId: BOARD_A }));
    db.task.aggregate.mockResolvedValue({ _max: { position: maxPosition } });

    const result = await updateTask(TASK_ID, { title: 'Task A', columnId: DONE_COLUMN });

    expect(result.error).toBeUndefined();
    // requireColumnOnBoard looked up the destination before anything was written.
    expect(db.column.findUnique).toHaveBeenCalledWith({ where: { id: DONE_COLUMN } });
    expect(db.task.aggregate).toHaveBeenCalledWith({
      where: { columnId: DONE_COLUMN },
      _max: { position: true },
    });
    expect(writtenData()).toEqual({ title: 'Task A', columnId: DONE_COLUMN, position: expected });
  });

  it.each([
    {
      label: 'lives on another board',
      column: makeColumn({ id: FOREIGN_COLUMN, boardId: BOARD_B }),
    },
    { label: 'does not exist', column: null },
  ])('rejects a destination column that $label', async ({ column }) => {
    db.column.findUnique.mockResolvedValue(column);
    // toActionError logs the real error server-side; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateTask(TASK_ID, { title: 'Task A', columnId: FOREIGN_COLUMN });

    // Same sanitized message either way, so the response is not an existence oracle
    // for another board's column ids.
    expect(result).toEqual({ error: 'Column not found' });
    expect(db.task.aggregate).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  const mockedEnforce = vi.mocked(enforceRateLimit);

  const MOVE_INPUT = { taskId: TASK_ID, targetColumnId: DONE_COLUMN, targetIndex: 0 };
  const CREATE_INPUT = { columnId: TODO_COLUMN, title: 'New task' };

  beforeEach(() => {
    // toActionError logs the real error server-side; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.column.findUnique.mockResolvedValue(makeColumn());
    db.task.findMany.mockResolvedValue([]);
    db.task.aggregate.mockResolvedValue({ _max: { position: 1000 } });
    db.task.create.mockResolvedValue({ ...makeTask(), assignee: null, creator: null });
  });

  it("moveTask counts one call against the user's mutation bucket", async () => {
    const result = await moveTask(MOVE_INPUT);

    expect(result.error).toBeUndefined();
    expect(mockedEnforce).toHaveBeenCalledTimes(1);
    expect(mockedEnforce).toHaveBeenCalledWith(USER_ID, 'mutation');
    expect(db.task.update).toHaveBeenCalledTimes(1);
  });

  it('moveTask returns the limiter message and writes nothing when over the limit', async () => {
    mockedEnforce.mockRejectedValueOnce(new RateLimitError(10));

    const result = await moveTask(MOVE_INPUT);

    expect(result).toEqual({ error: 'Too many requests, try again in 10s' });
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.activityLog.create).not.toHaveBeenCalled();
  });

  it("createTask counts one call against the user's mutation bucket", async () => {
    const result = await createTask(CREATE_INPUT);

    expect(result.error).toBeUndefined();
    expect(mockedEnforce).toHaveBeenCalledTimes(1);
    expect(mockedEnforce).toHaveBeenCalledWith(USER_ID, 'mutation');
    expect(db.task.create).toHaveBeenCalledTimes(1);
  });

  it('createTask returns the limiter message and writes nothing when over the limit', async () => {
    mockedEnforce.mockRejectedValueOnce(new RateLimitError(10));

    const result = await createTask(CREATE_INPUT);

    expect(result).toEqual({ error: 'Too many requests, try again in 10s' });
    expect(db.task.create).not.toHaveBeenCalled();
    expect(db.activityLog.create).not.toHaveBeenCalled();
  });

  it('does not touch the limiter when the caller is signed out', async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    expect(await moveTask(MOVE_INPUT)).toEqual({ error: 'Unauthorized' });
    expect(await createTask(CREATE_INPUT)).toEqual({ error: 'Unauthorized' });
    expect(mockedEnforce).not.toHaveBeenCalled();
  });
});
