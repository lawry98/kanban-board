// @vitest-environment node
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_COLUMNS } from '@/lib/constants';
import { parseCalendarDate } from '@/lib/dates';
import { createBoardSchema } from '@/lib/validations/board';
import { createTaskSchema } from '@/lib/validations/task';

import {
  DEMO_BOARD_DESCRIPTION,
  DEMO_BOARD_TITLE,
  DEMO_COLUMNS,
  addCalendarDays,
} from '../scripts/seed/demo-board';
import {
  SEED_OPT_IN_ENV,
  SeedError,
  assertSeedOptIn,
  parseSeedArgs,
  seedDemoBoard,
} from '../scripts/seed/seed-demo-board';

const TODAY = '2026-10-06';
const PROFILE_ID = '4b0c1f57-3f7e-4c1a-9c5d-0f2a8e6d9b11';
const BOARD_ID = '9d3a52e0-6b1c-4f7a-8e44-1a2b3c4d5e6f';

/**
 * Wraps `target` so any member that is not explicitly provided throws. The seed must only
 * ever INSERT: reaching `update`, `upsert`, `delete*` or any other member fails the test.
 */
function strict<T extends object>(name: string, target: T): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'symbol' || prop === 'then' || prop in obj) {
        return Reflect.get(obj, prop, receiver);
      }
      throw new Error(`forbidden: ${name}.${prop}`);
    },
  });
}

interface FakeOptions {
  profile?: { id: string } | null;
  existingBoard?: { id: string } | null;
}

function createFakeDb({ profile = { id: PROFILE_ID }, existingBoard = null }: FakeOptions = {}) {
  let columnSeq = 0;
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    board: strict('tx.board', {
      findFirst: vi.fn(async () => existingBoard),
      create: vi.fn(async () => ({ id: BOARD_ID })),
    }),
    column: strict('tx.column', {
      create: vi.fn(async () => ({ id: `column-${++columnSeq}` })),
    }),
    task: strict('tx.task', {
      createManyAndReturn: vi.fn(async ({ data }: { data: { title: string }[] }) =>
        data.map((row, i) => ({ id: `task-${i + 1}`, title: row.title })),
      ),
    }),
    activityLog: strict('tx.activityLog', {
      createMany: vi.fn(async () => ({ count: 0 })),
    }),
  };
  const strictTx = strict('tx', tx);

  const db = {
    profile: strict('db.profile', {
      findUnique: vi.fn(async () => profile),
      findFirst: vi.fn(async () => profile),
    }),
    $transaction: vi.fn(async (fn: (client: typeof strictTx) => Promise<unknown>) => fn(strictTx)),
  };

  return { db: strict('db', db) as unknown as PrismaClient, mocks: db, tx };
}

describe('assertSeedOptIn', () => {
  it.each([[{}], [{ [SEED_OPT_IN_ENV]: '0' }], [{ [SEED_OPT_IN_ENV]: 'true' }]])(
    'refuses %j',
    (env) => {
      expect(() => assertSeedOptIn(env)).toThrow(SeedError);
      expect(() => assertSeedOptIn(env)).toThrow(/ALLOW_DEMO_SEED/);
    },
  );

  it('accepts exactly ALLOW_DEMO_SEED=1', () => {
    expect(() => assertSeedOptIn({ ALLOW_DEMO_SEED: '1' })).not.toThrow();
  });
});

describe('parseSeedArgs', () => {
  it('trims and lowercases --email', () => {
    expect(parseSeedArgs(['--email', ' Alice@Example.com '])).toEqual({
      email: 'alice@example.com',
    });
  });

  it('accepts a valid --user-id', () => {
    expect(parseSeedArgs(['--user-id', PROFILE_ID])).toEqual({ userId: PROFILE_ID });
  });

  it('drops a leading -- token (pnpm db:seed -- --email x)', () => {
    expect(parseSeedArgs(['--', '--email', 'a@b.co'])).toEqual({ email: 'a@b.co' });
  });

  it.each([
    ['both flags', ['--email', 'a@b.co', '--user-id', PROFILE_ID]],
    ['neither flag', []],
    ['a malformed email', ['--email', 'not-an-email']],
    ['a malformed user id', ['--user-id', '123']],
    ['an unknown flag', ['--force']],
  ])('rejects %s with a SeedError', (_label, argv) => {
    expect(() => parseSeedArgs(argv)).toThrow(SeedError);
  });
});

describe('demo data', () => {
  const tasks = DEMO_COLUMNS.flatMap((column) => column.tasks);

  it('has a valid board title and description', () => {
    expect(
      createBoardSchema.safeParse({
        title: DEMO_BOARD_TITLE,
        description: DEMO_BOARD_DESCRIPTION,
      }).success,
    ).toBe(true);
  });

  it('has tasks that pass createTaskSchema', () => {
    for (const task of tasks) {
      const result = createTaskSchema.safeParse({
        columnId: crypto.randomUUID(),
        title: task.title,
        description: task.description,
        priority: task.priority,
        labels: [...task.labels],
        dueDate: task.dueInDays === undefined ? undefined : addCalendarDays(TODAY, task.dueInDays),
      });
      expect(result.success, task.title).toBe(true);
    }
  });

  it('lays out 12 tasks over the four default columns', () => {
    expect(tasks).toHaveLength(12);
    expect(DEMO_COLUMNS.map(({ title, color }) => ({ title, color }))).toEqual(
      DEFAULT_COLUMNS.map(({ title, color }) => ({ title, color })),
    );
  });

  it('covers every priority, assigned and unassigned, overdue and upcoming, all labelled', () => {
    expect(new Set(tasks.map((t) => t.priority))).toEqual(
      new Set(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    );
    expect(tasks.some((t) => t.assignToOwner)).toBe(true);
    expect(tasks.some((t) => !t.assignToOwner)).toBe(true);
    expect(tasks.some((t) => (t.dueInDays ?? 0) < 0)).toBe(true);
    expect(tasks.some((t) => (t.dueInDays ?? 0) > 0)).toBe(true);
    expect(tasks.every((t) => t.labels.length >= 1)).toBe(true);
  });
});

describe('addCalendarDays', () => {
  it.each([
    ['2026-10-06', -7, '2026-09-29'],
    ['2026-12-28', 5, '2027-01-02'],
    ['2026-03-07', 1, '2026-03-08'], // US DST weekend
  ])('%s + %i days = %s', (day, days, expected) => {
    expect(addCalendarDays(day, days)).toBe(expected);
  });
});

describe('seedDemoBoard', () => {
  it('rejects with a SeedError, before any transaction, when the profile is missing', async () => {
    const { db, mocks } = createFakeDb({ profile: null });

    await expect(seedDemoBoard(db, { email: 'ghost@example.com' }, TODAY)).rejects.toThrow(
      SeedError,
    );
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing, and locks first, when the demo board already exists', async () => {
    const { db, tx } = createFakeDb({ existingBoard: { id: 'existing-board' } });

    const result = await seedDemoBoard(db, { userId: PROFILE_ID }, TODAY);

    expect(result).toEqual({ status: 'exists', boardId: 'existing-board' });
    expect(tx.board.create).not.toHaveBeenCalled();
    expect(tx.column.create).not.toHaveBeenCalled();
    expect(tx.task.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.activityLog.createMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.board.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.board.findFirst).toHaveBeenCalledWith({
      where: { createdBy: PROFILE_ID, title: DEMO_BOARD_TITLE },
      select: { id: true },
    });
  });

  it('looks the profile up by id, or case-insensitively by email', async () => {
    const byId = createFakeDb();
    await seedDemoBoard(byId.db, { userId: PROFILE_ID }, TODAY);
    expect(byId.mocks.profile.findUnique).toHaveBeenCalledWith({
      where: { id: PROFILE_ID },
      select: { id: true },
    });

    const byEmail = createFakeDb();
    await seedDemoBoard(byEmail.db, { email: 'alice@example.com' }, TODAY);
    expect(byEmail.mocks.profile.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'alice@example.com', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('creates the board, columns, tasks and activity for a fresh user', async () => {
    const { db, tx } = createFakeDb();

    const result = await seedDemoBoard(db, { email: 'alice@example.com' }, TODAY);

    expect(result).toEqual({ status: 'created', boardId: BOARD_ID, columnCount: 4, taskCount: 12 });

    expect(tx.board.create).toHaveBeenCalledOnce();
    expect(tx.board.create).toHaveBeenCalledWith({
      data: {
        title: DEMO_BOARD_TITLE,
        description: DEMO_BOARD_DESCRIPTION,
        createdBy: PROFILE_ID,
        members: { create: { userId: PROFILE_ID, role: 'OWNER' } },
      },
      select: { id: true },
    });

    expect(tx.column.create).toHaveBeenCalledTimes(4);
    const columnCalls = tx.column.create.mock.calls as unknown as [
      { data: { boardId: string; title: string; color: string; position: number } },
    ][];
    expect(columnCalls.map(([arg]) => arg.data)).toEqual(
      DEFAULT_COLUMNS.map(({ title, color }, i) => ({
        boardId: BOARD_ID,
        title,
        color,
        position: (i + 1) * 1000,
      })),
    );

    expect(tx.task.createManyAndReturn).toHaveBeenCalledOnce();
    const taskArg = (
      tx.task.createManyAndReturn.mock.calls as unknown as [
        { data: Record<string, unknown>[]; select: unknown },
      ][]
    )[0][0];
    expect(taskArg.select).toEqual({ id: true, title: true });
    expect(taskArg.data).toHaveLength(12);

    const specs = DEMO_COLUMNS.flatMap((column, columnIndex) =>
      column.tasks.map((spec, indexInColumn) => ({ spec, columnIndex, indexInColumn })),
    );
    specs.forEach(({ spec, columnIndex, indexInColumn }, i) => {
      expect(taskArg.data[i]).toEqual({
        columnId: `column-${columnIndex + 1}`,
        boardId: BOARD_ID,
        title: spec.title,
        description: spec.description ?? null,
        priority: spec.priority,
        labels: [...spec.labels],
        position: (indexInColumn + 1) * 1000,
        dueDate:
          spec.dueInDays === undefined
            ? null
            : parseCalendarDate(addCalendarDays(TODAY, spec.dueInDays)),
        assigneeId: spec.assignToOwner ? PROFILE_ID : null,
        createdBy: PROFILE_ID,
      });
    });

    const pricing = taskArg.data.find((row) => row.title === 'Build pricing page');
    expect(pricing?.dueDate).toEqual(parseCalendarDate('2026-10-05'));

    expect(tx.activityLog.createMany).toHaveBeenCalledOnce();
    const { data: logs } = (
      tx.activityLog.createMany.mock.calls as unknown as [
        { data: { action: string; entityType: string; entityId: string; userId: string }[] },
      ][]
    )[0][0] as { data: Record<string, unknown>[] };
    expect(logs).toHaveLength(13);
    expect(logs[0]).toEqual({
      boardId: BOARD_ID,
      userId: PROFILE_ID,
      action: 'BOARD_CREATED',
      entityType: 'board',
      entityId: BOARD_ID,
      metadata: { title: DEMO_BOARD_TITLE },
    });
    const taskLogs = logs.slice(1);
    expect(taskLogs.every((log) => log.action === 'TASK_CREATED')).toBe(true);
    expect(taskLogs.every((log) => log.userId === PROFILE_ID)).toBe(true);
    expect(taskLogs.every((log) => log.entityType === 'task')).toBe(true);
    expect(taskLogs.map((log) => log.entityId)).toEqual(specs.map((_, i) => `task-${i + 1}`));
    expect(taskLogs.map((log) => (log.metadata as { title: string }).title)).toEqual(
      specs.map(({ spec }) => spec.title),
    );
  });
});
