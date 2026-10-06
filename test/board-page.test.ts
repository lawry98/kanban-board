import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import BoardPage, { generateMetadata } from '@/app/(dashboard)/board/[boardId]/page';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const db = prisma as unknown as { board: { findUnique: Mock }; boardMember: { findFirst: Mock } };
const props = { params: Promise.resolve({ boardId: BOARD_ID }) };

function signInAs(user: { id: string } | null): void {
  (createClient as unknown as Mock).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('board page generateMetadata', () => {
  it("uses the board's title for a member", async () => {
    signInAs({ id: 'u1' });
    db.boardMember.findFirst.mockResolvedValue({ id: 'm1', role: 'VIEWER' });
    db.board.findUnique.mockResolvedValue({ id: BOARD_ID, title: 'Secret roadmap' });
    expect(await generateMetadata(props)).toEqual({ title: 'Secret roadmap' });
  });

  it("returns 'Board' to a non-member without ever loading the board", async () => {
    signInAs({ id: 'intruder' });
    db.boardMember.findFirst.mockResolvedValue(null);
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it("returns 'Board' when signed out", async () => {
    signInAs(null);
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it("returns 'Board' when the lookup fails", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    signInAs({ id: 'u1' });
    db.boardMember.findFirst.mockRejectedValue(new Error('db down'));
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
  });
});

describe('board page', () => {
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
