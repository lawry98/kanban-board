import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    board: { findUnique: vi.fn() },
    boardMember: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
// The page's client component drags in dnd, Realtime and the whole board UI; metadata
// never renders it.
vi.mock('@/app/(dashboard)/board/[boardId]/board-view', () => ({ BoardView: () => null }));

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { generateMetadata } from '@/app/(dashboard)/board/[boardId]/page';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SECRET_TITLE = 'Q3 layoffs — confidential';

const db = prisma as unknown as {
  board: { findUnique: Mock };
  boardMember: { findFirst: Mock };
};
const mockedCreateClient = createClient as unknown as Mock;

function signInAs(user: { id: string } | null): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  });
}

function metadataFor(boardId = BOARD_ID) {
  return generateMetadata({ params: Promise.resolve({ boardId }) });
}

describe('board page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.board.findUnique.mockResolvedValue({ title: SECRET_TITLE });
  });

  // Next streams the page's metadata even when the page itself calls notFound(), so
  // without a membership check the 404 response carries the board's real title.
  it('does not reveal the title to a signed-in non-member', async () => {
    signInAs({ id: USER_ID });
    db.boardMember.findFirst.mockResolvedValue(null);

    const metadata = await metadataFor();

    expect(metadata.title).toBe('Board');
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it('does not reveal the title to a signed-out visitor', async () => {
    signInAs(null);

    const metadata = await metadataFor();

    expect(metadata.title).toBe('Board');
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it('checks membership against the requested board for the signed-in user', async () => {
    signInAs({ id: USER_ID });
    db.boardMember.findFirst.mockResolvedValue(null);

    await metadataFor();

    expect(db.boardMember.findFirst).toHaveBeenCalledWith({
      where: { boardId: BOARD_ID, userId: USER_ID },
    });
  });

  it('uses the board title for a member', async () => {
    signInAs({ id: USER_ID });
    db.boardMember.findFirst.mockResolvedValue({ boardId: BOARD_ID, userId: USER_ID });

    const metadata = await metadataFor();

    expect(metadata.title).toBe(SECRET_TITLE);
  });

  it('falls back to the generic title when a member finds no board', async () => {
    signInAs({ id: USER_ID });
    db.boardMember.findFirst.mockResolvedValue({ boardId: BOARD_ID, userId: USER_ID });
    db.board.findUnique.mockResolvedValue(null);

    const metadata = await metadataFor();

    expect(metadata.title).toBe('Board');
  });

  it('propagates unexpected failures instead of masking them as a missing board', async () => {
    signInAs({ id: USER_ID });
    db.boardMember.findFirst.mockRejectedValue(new Error('connection reset'));

    await expect(metadataFor()).rejects.toThrow('connection reset');
  });
});
