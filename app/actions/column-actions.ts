'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { UpdateColumnInput } from '@/lib/validations/column';

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

export async function createColumn(boardId: string, title: string) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER', 'EDITOR']);

    const maxPosition = await prisma.column.aggregate({
      where: { boardId },
      _max: { position: true },
    });
    const position = (maxPosition._max.position ?? -1) + 1;

    const column = await prisma.column.create({
      data: { boardId, title, position },
      include: { tasks: { include: { assignee: true, creator: true } } },
    });

    await prisma.activityLog.create({
      data: {
        boardId,
        userId: user.id,
        action: 'COLUMN_CREATED',
        entityType: 'column',
        entityId: column.id,
        metadata: { title },
      },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: column };
  } catch (error) {
    console.error('createColumn error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to create column' };
  }
}

export async function updateColumn(columnId: string, data: UpdateColumnInput) {
  try {
    const user = await requireAuth();
    const existing = await prisma.column.findUniqueOrThrow({ where: { id: columnId } });
    await requireBoardMember(existing.boardId, user.id, ['OWNER', 'EDITOR']);

    const column = await prisma.column.update({
      where: { id: columnId },
      data,
    });

    await prisma.activityLog.create({
      data: {
        boardId: existing.boardId,
        userId: user.id,
        action: 'COLUMN_UPDATED',
        entityType: 'column',
        entityId: columnId,
        metadata: JSON.parse(JSON.stringify(data)),
      },
    });

    revalidatePath(`/board/${existing.boardId}`);
    return { data: column };
  } catch (error) {
    console.error('updateColumn error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to update column' };
  }
}

export async function deleteColumn(columnId: string) {
  try {
    const user = await requireAuth();
    const existing = await prisma.column.findUniqueOrThrow({ where: { id: columnId } });
    await requireBoardMember(existing.boardId, user.id, ['OWNER', 'EDITOR']);

    await prisma.column.delete({ where: { id: columnId } });

    // Reorder remaining columns
    const remaining = await prisma.column.findMany({
      where: { boardId: existing.boardId },
      orderBy: { position: 'asc' },
    });
    await Promise.all(
      remaining.map((col, index) =>
        prisma.column.update({ where: { id: col.id }, data: { position: index } }),
      ),
    );

    await prisma.activityLog.create({
      data: {
        boardId: existing.boardId,
        userId: user.id,
        action: 'COLUMN_DELETED',
        entityType: 'column',
        entityId: columnId,
        metadata: { title: existing.title },
      },
    });

    revalidatePath(`/board/${existing.boardId}`);
    return { data: true };
  } catch (error) {
    console.error('deleteColumn error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to delete column' };
  }
}

export async function reorderColumns(boardId: string, columnIds: string[]) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER', 'EDITOR']);

    await Promise.all(
      columnIds.map((id, index) =>
        prisma.column.update({ where: { id }, data: { position: index } }),
      ),
    );

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    console.error('reorderColumns error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to reorder columns' };
  }
}
