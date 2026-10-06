import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    board: { create: vi.fn(), update: vi.fn() },
    boardMember: { findFirst: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { createBoard, updateBoard } from '@/app/actions/board-actions';

// Valid UUIDs — the actions `uuidSchema.parse()` every client-supplied id.
const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';

// The real Prisma return types are structurally huge and irrelevant here, so drive the
// mocks through a permissive handle.
const db = prisma as unknown as {
  board: { create: Mock; update: Mock };
  boardMember: { findFirst: Mock };
  activityLog: { create: Mock };
};

function signInAs(id = USER_ID): void {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id, email: 'me@example.com' } },
        error: null,
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

/** The `data` of the only activity row the action wrote. */
function loggedActivity(): Record<string, unknown> {
  expect(db.activityLog.create).toHaveBeenCalledTimes(1);
  return db.activityLog.create.mock.calls[0]![0].data;
}

beforeEach(() => {
  vi.resetAllMocks();
  signInAs();
  db.boardMember.findFirst.mockResolvedValue({ id: 'member-1', boardId: BOARD_ID, role: 'OWNER' });
});

describe('board activity metadata', () => {
  it('createBoard logs the board title under `title`', async () => {
    db.board.create.mockResolvedValue({ id: BOARD_ID, title: 'Roadmap' });

    const result = await createBoard({ title: 'Roadmap' });

    expect(result.error).toBeUndefined();
    expect(loggedActivity()).toMatchObject({
      boardId: BOARD_ID,
      action: 'BOARD_CREATED',
      metadata: { title: 'Roadmap' },
    });
    expect(loggedActivity().metadata).not.toHaveProperty('boardTitle');
  });

  it('updateBoard logs the touched fields and the resulting title under `title`', async () => {
    db.board.update.mockResolvedValue({ id: BOARD_ID, title: 'Renamed' });

    const result = await updateBoard(BOARD_ID, { title: 'Renamed' });

    expect(result.error).toBeUndefined();
    expect(loggedActivity()).toMatchObject({
      boardId: BOARD_ID,
      action: 'BOARD_UPDATED',
      metadata: { fields: ['title'], title: 'Renamed' },
    });
    expect(loggedActivity().metadata).not.toHaveProperty('boardTitle');
  });

  it('updateBoard records a description-only edit as such, keeping the unchanged title', async () => {
    db.board.update.mockResolvedValue({ id: BOARD_ID, title: 'Roadmap' });

    await updateBoard(BOARD_ID, { description: 'Q4 plan' });

    expect(loggedActivity()).toMatchObject({
      metadata: { fields: ['description'], title: 'Roadmap' },
    });
  });
});
