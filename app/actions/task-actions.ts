'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { UpdateTaskInput } from '@/lib/validations/task';

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

export async function createTask(
  columnId: string,
  boardId: string,
  data: { title: string; position?: number },
) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id, ['OWNER', 'EDITOR']);

    const maxPosition = await prisma.task.aggregate({
      where: { columnId },
      _max: { position: true },
    });
    const position = data.position ?? (maxPosition._max.position ?? -1) + 1;

    const task = await prisma.task.create({
      data: {
        columnId,
        boardId,
        title: data.title,
        position,
        createdBy: user.id,
      },
      include: { assignee: true, creator: true },
    });

    await prisma.activityLog.create({
      data: {
        boardId,
        userId: user.id,
        action: 'TASK_CREATED',
        entityType: 'task',
        entityId: task.id,
        metadata: { title: data.title },
      },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: task };
  } catch (error) {
    console.error('createTask error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to create task' };
  }
}

export async function updateTask(taskId: string, data: UpdateTaskInput) {
  try {
    const user = await requireAuth();
    const existing = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await requireBoardMember(existing.boardId, user.id, ['OWNER', 'EDITOR']);

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.labels !== undefined && { labels: data.labels }),
        ...(data.dueDate !== undefined && {
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.columnId !== undefined && { columnId: data.columnId }),
      },
      include: { assignee: true, creator: true },
    });

    await prisma.activityLog.create({
      data: {
        boardId: existing.boardId,
        userId: user.id,
        action: 'TASK_UPDATED',
        entityType: 'task',
        entityId: taskId,
        metadata: JSON.parse(JSON.stringify(data)),
      },
    });

    revalidatePath(`/board/${existing.boardId}`);
    return { data: task };
  } catch (error) {
    console.error('updateTask error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to update task' };
  }
}

export async function moveTask(taskId: string, targetColumnId: string, newPosition: number) {
  try {
    const user = await requireAuth();
    const existing = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await requireBoardMember(existing.boardId, user.id, ['OWNER', 'EDITOR']);

    const sourceColumnId = existing.columnId;
    const sourcePosition = existing.position;

    // Get column titles for activity log
    const [sourceCol, targetCol] = await Promise.all([
      prisma.column.findUnique({ where: { id: sourceColumnId }, select: { title: true } }),
      prisma.column.findUnique({ where: { id: targetColumnId }, select: { title: true } }),
    ]);

    if (sourceColumnId === targetColumnId) {
      // Same column reorder
      const tasks = await prisma.task.findMany({
        where: { columnId: sourceColumnId },
        orderBy: { position: 'asc' },
      });

      const reordered = tasks.filter((t) => t.id !== taskId);
      reordered.splice(newPosition, 0, { ...existing });

      await Promise.all(
        reordered.map((t, index) =>
          prisma.task.update({ where: { id: t.id }, data: { position: index } }),
        ),
      );
    } else {
      // Cross-column move: remove from source, insert into target
      const [sourceTasks, targetTasks] = await Promise.all([
        prisma.task.findMany({
          where: { columnId: sourceColumnId, id: { not: taskId } },
          orderBy: { position: 'asc' },
        }),
        prisma.task.findMany({
          where: { columnId: targetColumnId },
          orderBy: { position: 'asc' },
        }),
      ]);

      // Reorder source column
      await Promise.all(
        sourceTasks.map((t, index) =>
          prisma.task.update({ where: { id: t.id }, data: { position: index } }),
        ),
      );

      // Insert task into target column at newPosition
      const updatedTargetTasks = [...targetTasks];
      updatedTargetTasks.splice(newPosition, 0, { ...existing, columnId: targetColumnId });

      await Promise.all(
        updatedTargetTasks.map((t, index) =>
          prisma.task.update({
            where: { id: t.id },
            data: { position: index, columnId: targetColumnId },
          }),
        ),
      );
    }

    await prisma.activityLog.create({
      data: {
        boardId: existing.boardId,
        userId: user.id,
        action: 'TASK_MOVED',
        entityType: 'task',
        entityId: taskId,
        metadata: {
          fromColumn: sourceCol?.title ?? sourceColumnId,
          toColumn: targetCol?.title ?? targetColumnId,
          fromPosition: sourcePosition,
          toPosition: newPosition,
        },
      },
    });

    revalidatePath(`/board/${existing.boardId}`);
    return { data: true };
  } catch (error) {
    console.error('moveTask error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to move task' };
  }
}

export async function deleteTask(taskId: string) {
  try {
    const user = await requireAuth();
    const existing = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await requireBoardMember(existing.boardId, user.id, ['OWNER', 'EDITOR']);

    await prisma.task.delete({ where: { id: taskId } });

    // Reorder remaining tasks in column
    const remaining = await prisma.task.findMany({
      where: { columnId: existing.columnId },
      orderBy: { position: 'asc' },
    });
    await Promise.all(
      remaining.map((t, index) =>
        prisma.task.update({ where: { id: t.id }, data: { position: index } }),
      ),
    );

    await prisma.activityLog.create({
      data: {
        boardId: existing.boardId,
        userId: user.id,
        action: 'TASK_DELETED',
        entityType: 'task',
        entityId: taskId,
        metadata: { title: existing.title },
      },
    });

    revalidatePath(`/board/${existing.boardId}`);
    return { data: true };
  } catch (error) {
    console.error('deleteTask error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to delete task' };
  }
}

export async function getActivityLogs(boardId: string, limit = 50) {
  try {
    const user = await requireAuth();
    await requireBoardMember(boardId, user.id);

    const logs = await prisma.activityLog.findMany({
      where: { boardId },
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return { data: logs };
  } catch (error) {
    console.error('getActivityLogs error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to fetch activity logs' };
  }
}
