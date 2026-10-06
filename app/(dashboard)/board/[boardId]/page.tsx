import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { MEMBER_PROFILE_INCLUDE, PUBLIC_PROFILE_SELECT } from '@/types/board';
import { BoardView } from './board-view';

import type { Role } from '@prisma/client';
import type { BoardWithDetails } from '@/types';

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
}

type BoardForViewer =
  | { status: 'ok'; userId: string; role: Role; board: BoardWithDetails }
  | { status: 'unauthenticated' }
  | { status: 'not-found' };

/**
 * The board as the signed-in viewer may see it, or why they can't. `cache()` makes
 * generateMetadata and the page share one authorization per request, so a
 * non-member gets neither the board nor its title.
 */
const loadBoardForViewer = cache(async (boardId: string): Promise<BoardForViewer> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'unauthenticated' };

  const membership = await prisma.boardMember.findFirst({
    where: { boardId, userId: user.id },
  });
  if (!membership) return { status: 'not-found' };

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      columns: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { position: 'asc' },
            include: {
              assignee: { select: PUBLIC_PROFILE_SELECT },
              creator: { select: PUBLIC_PROFILE_SELECT },
            },
          },
        },
      },
      members: {
        include: MEMBER_PROFILE_INCLUDE,
      },
      creator: { select: PUBLIC_PROFILE_SELECT },
    },
  });
  if (!board) return { status: 'not-found' };

  return { status: 'ok', userId: user.id, role: membership.role, board };
});

export async function generateMetadata({ params }: BoardPageProps): Promise<Metadata> {
  const { boardId } = await params;
  try {
    const result = await loadBoardForViewer(boardId);
    return { title: result.status === 'ok' ? result.board.title : 'Board' };
  } catch (error) {
    // The page renders the real failure; the tab title just stays generic.
    console.error('board generateMetadata error:', error);
    return { title: 'Board' };
  }
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;
  const result = await loadBoardForViewer(boardId);

  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status === 'not-found') notFound();

  return <BoardView board={result.board} currentUserId={result.userId} userRole={result.role} />;
}
