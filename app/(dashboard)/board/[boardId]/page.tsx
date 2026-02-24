import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { BoardView } from './board-view';

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
}

export async function generateMetadata({ params }: BoardPageProps): Promise<Metadata> {
  const { boardId } = await params;
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { title: true },
  });
  return { title: board?.title ?? 'Board' };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const membership = await prisma.boardMember.findFirst({
    where: { boardId, userId: user.id },
  });

  if (!membership) notFound();

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      columns: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { position: 'asc' },
            include: { assignee: true, creator: true },
          },
        },
      },
      members: {
        include: { profile: true },
      },
      creator: true,
    },
  });

  if (!board) notFound();

  return (
    <BoardView
      board={board}
      currentUserId={user.id}
      userRole={membership.role}
    />
  );
}
