import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    column: { findUnique: vi.fn() },
    task: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
    boardMember: { findFirst: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { createTask, updateTask } from '@/app/actions/task-actions';

import { TIME_ZONES, pinTimeZone } from './time-zone';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const COLUMN_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const db = prisma as unknown as {
  column: { findUnique: Mock };
  task: { findUnique: Mock; aggregate: Mock; create: Mock; update: Mock };
  boardMember: { findFirst: Mock };
  activityLog: { create: Mock };
};

describe.each(TIME_ZONES)('task actions persist due dates as calendar days in %s', (timeZone) => {
  pinTimeZone(timeZone);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (createClient as unknown as Mock).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
      },
    });
    db.boardMember.findFirst.mockResolvedValue({ id: 'm1', boardId: BOARD_ID, userId: USER_ID });
    db.column.findUnique.mockResolvedValue({ id: COLUMN_ID, boardId: BOARD_ID, title: 'To do' });
    db.task.findUnique.mockResolvedValue({ id: TASK_ID, boardId: BOARD_ID, columnId: COLUMN_ID });
    db.task.aggregate.mockResolvedValue({ _max: { position: 1000 } });
    db.task.create.mockImplementation(({ data }) => Promise.resolve({ id: TASK_ID, ...data }));
    db.task.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: TASK_ID, title: 'T', ...data }),
    );
  });

  it('createTask writes the picked day as UTC midnight of that day', async () => {
    const result = await createTask({ columnId: COLUMN_ID, title: 'Ship', dueDate: '2026-10-02' });

    expect(result.error).toBeUndefined();
    const { data } = db.task.create.mock.calls[0][0];
    expect(data.dueDate.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('updateTask writes only the due date it was given, as that day', async () => {
    const result = await updateTask(TASK_ID, { dueDate: '2026-10-02' });

    expect(result.error).toBeUndefined();
    const { data } = db.task.update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['dueDate']);
    expect(data.dueDate.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('updateTask clears the due date on null', async () => {
    await updateTask(TASK_ID, { dueDate: null });

    expect(db.task.update.mock.calls[0][0].data).toEqual({ dueDate: null });
  });

  it('updateTask rejects a datetime without writing anything', async () => {
    const result = await updateTask(TASK_ID, { dueDate: '2026-10-02T23:00:00-04:00' });

    expect(result).toEqual({ error: 'Enter a valid date' });
    expect(db.task.update).not.toHaveBeenCalled();
  });
});
