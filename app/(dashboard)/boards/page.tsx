import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { BoardsClient } from './boards-client';

export const metadata: Metadata = { title: 'Boards' };

export default async function BoardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const memberships = await prisma.boardMember.findMany({
    where: { userId: user.id },
    include: {
      board: {
        include: {
          members: { include: { profile: true } },
          _count: { select: { columns: true, tasks: true } },
        },
      },
    },
    orderBy: { board: { updatedAt: 'desc' } },
  });

  const boards = memberships.map((m) => ({
    ...m.board,
    role: m.role,
    updatedAtRelative: formatDistanceToNow(m.board.updatedAt, { addSuffix: true }),
  }));

  return <BoardsClient boards={boards} />;
}
