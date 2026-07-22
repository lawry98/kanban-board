'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import {
  EDITOR_ROLES,
  logActivity,
  requireBoardAccess,
  requireBoardMemberExists,
  requireColumnAccess,
  requireColumnOnBoard,
  requireTaskAccess,
  toActionError,
} from '@/lib/auth/require-access';
import { createTaskSchema, moveTaskSchema, updateTaskSchema } from '@/lib/validations/task';
import { uuidSchema } from '@/lib/validations/board';
import { PUBLIC_PROFILE_SELECT } from '@/types/board';
import type { ActionResult } from '@/lib/auth/require-access';
import type { TaskWithAssignee } from '@/types';
import type { ActivityLog, Profile } from '@prisma/client';

/**
 * Fractional (sparse) ordering invariant
 * --------------------------------------
 * `position` is a Float, not a dense 0..n index. Tasks are ordered by `position ASC`;
 * the only requirement is that positions are strictly increasing within a column.
 * New rows are appended at `max + POSITION_STEP`, and a move writes the midpoint of its
 * two new neighbours, so a move is ONE row update instead of rewriting the whole column.
 * That removes both the O(n) write amplification and the lost-update race where two
 * concurrent moves each renumbered a column from a stale read.
 *
 * Limit: repeatedly bisecting the same gap halves it each time, and after ~50 splits it
 * hits float precision (neighbours compare equal). A rebalance — rewriting one column's
 * positions to `(index + 1) * POSITION_STEP` inside a transaction — is the fix, and would
 * be triggered when a computed gap falls below MIN_POSITION_GAP. Not implemented here
 * because the condition is unreachable in normal use; if it is ever hit, ordering degrades
 * to "ties broken arbitrarily", not data loss.
 */
const POSITION_STEP = 1000;

interface Positioned {
  id: string;
  position: number;
}

/** Midpoint between the neighbours that would surround `index` in `siblings`. */
function positionForIndex(siblings: Positioned[], index: number): number {
  const clamped = Math.max(0, Math.min(index, siblings.length));
  const prev = clamped > 0 ? siblings[clamped - 1] : undefined;
  const next = clamped < siblings.length ? siblings[clamped] : undefined;

  if (!prev && !next) return POSITION_STEP;
  if (!prev && next) return next.position - POSITION_STEP;
  if (prev && !next) return prev.position + POSITION_STEP;
  return ((prev as Positioned).position + (next as Positioned).position) / 2;
}

const TASK_INCLUDE = {
  assignee: { select: PUBLIC_PROFILE_SELECT },
  creator: { select: PUBLIC_PROFILE_SELECT },
} as const;

export async function createTask(input: unknown): Promise<ActionResult<TaskWithAssignee>> {
  try {
    const data = createTaskSchema.parse(input);

    // The board is derived from the column being written to. There is no client-supplied
    // boardId to disagree with it, so a column on someone else's board simply fails authz.
    const { user, boardId } = await requireColumnAccess(data.columnId, EDITOR_ROLES);

    if (data.assigneeId) await requireBoardMemberExists(boardId, data.assigneeId);

    const maxPosition = await prisma.task.aggregate({
      where: { columnId: data.columnId },
      _max: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        columnId: data.columnId,
        boardId,
        title: data.title,
        description: data.description,
        priority: data.priority ?? 'NONE',
        labels: data.labels ?? [],
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeId: data.assigneeId ?? null,
        position: (maxPosition._max.position ?? 0) + POSITION_STEP,
        createdBy: user.id,
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'TASK_CREATED',
      entityType: 'task',
      entityId: task.id,
      metadata: { title: task.title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: task };
  } catch (error) {
    return toActionError('createTask', error, 'Failed to create task');
  }
}

export async function updateTask(
  taskId: string,
  input: unknown,
): Promise<ActionResult<TaskWithAssignee>> {
  try {
    const id = uuidSchema.parse(taskId);
    const { user, boardId } = await requireTaskAccess(id, EDITOR_ROLES);
    const data = updateTaskSchema.parse(input);

    // A column id in the payload is a second client-supplied id: prove it is on the same
    // board before it can be written.
    let position: number | undefined;
    if (data.columnId !== undefined) {
      await requireColumnOnBoard(data.columnId, boardId);
      const maxPosition = await prisma.task.aggregate({
        where: { columnId: data.columnId },
        _max: { position: true },
      });
      position = (maxPosition._max.position ?? 0) + POSITION_STEP;
    }

    if (data.assigneeId) await requireBoardMemberExists(boardId, data.assigneeId);

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.labels !== undefined && { labels: data.labels }),
        ...(data.dueDate !== undefined && {
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.columnId !== undefined && { columnId: data.columnId, position }),
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'TASK_UPDATED',
      entityType: 'task',
      entityId: id,
      // Whitelisted: never persist the raw client payload into activity_logs.metadata.
      metadata: { fields: Object.keys(data), taskTitle: task.title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: task };
  } catch (error) {
    return toActionError('updateTask', error, 'Failed to update task');
  }
}

export async function moveTask(input: unknown): Promise<ActionResult<true>> {
  try {
    const { taskId, targetColumnId, targetIndex } = moveTaskSchema.parse(input);
    const { user, boardId, task } = await requireTaskAccess(taskId, EDITOR_ROLES);

    // The destination column must live on the task's own board.
    const targetColumn = await requireColumnOnBoard(targetColumnId, boardId);

    const siblings = await prisma.task.findMany({
      where: { columnId: targetColumnId, id: { not: taskId } },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });

    const position = positionForIndex(siblings, targetIndex);

    // Single row touched — no transaction needed and no cross-task write amplification.
    await prisma.task.update({
      where: { id: taskId },
      data: { columnId: targetColumnId, position },
    });

    const sourceColumn =
      task.columnId === targetColumnId
        ? targetColumn
        : await prisma.column.findUnique({
            where: { id: task.columnId },
            select: { title: true },
          });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'TASK_MOVED',
      entityType: 'task',
      entityId: taskId,
      metadata: {
        taskTitle: task.title,
        fromColumn: sourceColumn?.title ?? 'Unknown',
        toColumn: targetColumn.title,
      },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    return toActionError('moveTask', error, 'Failed to move task');
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult<true>> {
  try {
    const id = uuidSchema.parse(taskId);
    const { user, boardId, task } = await requireTaskAccess(id, EDITOR_ROLES);

    // Sparse positions mean the surviving rows need no renumbering after a delete.
    await prisma.task.delete({ where: { id } });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'TASK_DELETED',
      entityType: 'task',
      entityId: id,
      metadata: { title: task.title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    return toActionError('deleteTask', error, 'Failed to delete task');
  }
}

const MAX_ACTIVITY_LOG_LIMIT = 100;

export type ActivityLogWithProfile = ActivityLog & {
  profile: Pick<Profile, 'id' | 'fullName' | 'avatarUrl'> | null;
};

export async function getActivityLogs(
  boardId: string,
  limit = 50,
): Promise<ActionResult<ActivityLogWithProfile[]>> {
  try {
    const id = uuidSchema.parse(boardId);
    await requireBoardAccess(id);

    // Clamped: `limit` reached `take` unbounded, so a client could request 1,000,000 rows.
    const take = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), MAX_ACTIVITY_LOG_LIMIT)
      : 50;

    const logs = await prisma.activityLog.findMany({
      where: { boardId: id },
      include: { profile: { select: PUBLIC_PROFILE_SELECT } },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return { data: logs };
  } catch (error) {
    return toActionError('getActivityLogs', error, 'Failed to fetch activity logs');
  }
}
