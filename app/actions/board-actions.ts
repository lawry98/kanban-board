'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { createBoardSchema, updateBoardSchema } from '@/lib/validations/board';
import { DEFAULT_COLUMNS } from '@/lib/constants';
import type { CreateBoardInput, UpdateBoardInput } from '@/lib/validations/board';

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

async function requireBoardMember(boardId: string, userId: string, roles?: string[]) {
  const member = await prisma.boardMember.findFirst({
    where: {
      boardId,
      userId,
      ...(roles ? { role: { in: roles as ('OWNER' | 'EDITOR' | 'VIEWER')[] } } : {}),
    },
  });
  if (!member) throw new Error('Forbidden');
  return member;
}

export async function createBoard(data: CreateBoardInput) {
  try {
    const user = await requireAuth();
    const validated = createBoardSchema.parse(data);

    const board = await prisma.board.create({
      data: {
        title: validated.title,
        description: validated.description,
        createdBy: user.id,
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
        columns: {
          create: DEFAULT_COLUMNS.map((col, index) => ({
            title: col.title,
            color: col.color,
            position: index,
          })),
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        boardId: board.id,
        userId: user.id,
        action: 'COLUMN_CREATED',
        entityType: 'board',
        entityId: board.id,
        metadata: { boardTitle: board.title },
      },
    });

    revalidatePath('/boards');
    return { data: board };
  } catch (error) {
    console.error('createBoard error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to create board' };
  }
}

export async function updateBoard(boardId: string, data: UpdateBoardInput) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER', 'EDITOR']);
    const validated = updateBoardSchema.parse(data);

    const board = await prisma.board.update({
      where: { id: boardId },
      data: validated,
    });

    await prisma.activityLog.create({
      data: {
        boardId,
        userId: user.id,
        action: 'COLUMN_UPDATED',
        entityType: 'board',
        entityId: boardId,
        metadata: validated,
      },
    });

    revalidatePath(`/board/${boardId}`);
    revalidatePath('/boards');
    return { data: board };
  } catch (error) {
    console.error('updateBoard error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to update board' };
  }
}

export async function deleteBoard(boardId: string) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER']);

    await prisma.board.delete({ where: { id: boardId } });

    revalidatePath('/boards');
    redirect('/boards');
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error;
    console.error('deleteBoard error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to delete board' };
  }
}

export async function addBoardMember(boardId: string, email: string, role: 'EDITOR' | 'VIEWER') {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER']);

    const targetProfile = await prisma.profile.findUnique({ where: { email } });
    if (!targetProfile) return { error: 'User not found' };

    const existing = await prisma.boardMember.findFirst({
      where: { boardId, userId: targetProfile.id },
    });
    if (existing) return { error: 'User is already a member' };

    const member = await prisma.boardMember.create({
      data: { boardId, userId: targetProfile.id, role },
    });

    await prisma.activityLog.create({
      data: {
        boardId,
        userId: user.id,
        action: 'MEMBER_ADDED',
        entityType: 'member',
        entityId: member.id,
        metadata: { email, role },
      },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: member };
  } catch (error) {
    console.error('addBoardMember error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to add member' };
  }
}

export async function removeBoardMember(boardId: string, userId: string) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER']);

    await prisma.boardMember.deleteMany({ where: { boardId, userId } });

    await prisma.activityLog.create({
      data: {
        boardId,
        userId: user.id,
        action: 'MEMBER_REMOVED',
        entityType: 'member',
        entityId: userId,
        metadata: { removedUserId: userId },
      },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    console.error('removeBoardMember error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to remove member' };
  }
}

export async function getBoardData(boardId: string) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                assignee: true,
                creator: true,
              },
            },
          },
        },
        members: {
          include: { profile: true },
        },
        creator: true,
      },
    });

    return { data: board };
  } catch (error) {
    console.error('getBoardData error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to fetch board' };
  }
}
