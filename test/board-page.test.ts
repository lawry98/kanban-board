import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { board: { findUnique: vi.fn() }, boardMember: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
// The client view is irrelevant here and drags in dnd/realtime.
vi.mock('@/app/(dashboard)/board/[boardId]/board-view', () => ({ BoardView: () => null }));

import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import BoardPage from '@/app/(dashboard)/board/[boardId]/page';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const db = prisma as unknown as { board: { findUnique: Mock }; boardMember: { findFirst: Mock } };
const props = { params: Promise.resolve({ boardId: BOARD_ID }) };

function signInAs(user: { id: string } | null): void {
  (createClient as unknown as Mock).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  });
}

beforeEach(() => {
  // Back to each mock's factory implementation (notFound/redirect still throw); drops any
  // prisma/createClient implementation a previous test set.
  vi.resetAllMocks();
});

describe('board page', () => {
  it('renders the board for a member with their user id and role', async () => {
    const board = { id: BOARD_ID, title: 'Roadmap', columns: [], members: [] };
    signInAs({ id: 'u1' });
    db.boardMember.findFirst.mockResolvedValue({ id: 'm1', role: 'EDITOR' });
    db.board.findUnique.mockResolvedValue(board);

    const element = (await BoardPage(props)) as ReactElement;

    expect(element.props).toEqual({ board, currentUserId: 'u1', userRole: 'EDITOR' });
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('404s a non-member', async () => {
    signInAs({ id: 'intruder' });
    db.boardMember.findFirst.mockResolvedValue(null);
    await expect(BoardPage(props)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('sends a signed-out visitor to /login', async () => {
    signInAs(null);
    await expect(BoardPage(props)).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
