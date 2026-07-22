'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import {
  EDITOR_ROLES,
  PublicError,
  logActivity,
  requireBoardAccess,
  requireBoardMember,
  requireColumnAccess,
  requireAuth,
  toActionError,
} from '@/lib/auth/require-access';
import { MAX_COLUMNS } from '@/lib/constants';
import {
  createColumnSchema,
  reorderColumnsSchema,
  updateColumnSchema,
} from '@/lib/validations/column';
import { uuidSchema } from '@/lib/validations/board';
import { PUBLIC_PROFILE_SELECT } from '@/types/board';
import type { ActionResult } from '@/lib/auth/require-access';
import type { ColumnWithTasks } from '@/types';
import type { Column } from '@prisma/client';

/** Gap between adjacent positions; see the fractional-ordering note in task-actions.ts. */
const POSITION_STEP = 1000;

export async function createColumn(input: unknown): Promise<ActionResult<ColumnWithTasks>> {
  try {
    const { boardId, title, color } = createColumnSchema.parse(input);
    const { user } = await requireBoardAccess(boardId, EDITOR_ROLES);

    const [count, maxPosition] = await Promise.all([
      prisma.column.count({ where: { boardId } }),
      prisma.column.aggregate({ where: { boardId }, _max: { position: true } }),
    ]);
    if (count >= MAX_COLUMNS) {
      throw new PublicError(`A board can have at most ${MAX_COLUMNS} columns`);
    }

    const position = (maxPosition._max.position ?? 0) + POSITION_STEP;

    const column = await prisma.column.create({
      data: { boardId, title, color, position },
      include: {
        tasks: {
          orderBy: { position: 'asc' },
          include: {
            assignee: { select: PUBLIC_PROFILE_SELECT },
            creator: { select: PUBLIC_PROFILE_SELECT },
          },
        },
      },
    });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'COLUMN_CREATED',
      entityType: 'column',
      entityId: column.id,
      metadata: { title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: column };
  } catch (error) {
    return toActionError('createColumn', error, 'Failed to create column');
  }
}

export async function updateColumn(
  columnId: string,
  input: unknown,
): Promise<ActionResult<Column>> {
  try {
    const id = uuidSchema.parse(columnId);
    // Board is derived from the column row — never from the payload.
    const { user, boardId } = await requireColumnAccess(id, EDITOR_ROLES);
    const data = updateColumnSchema.parse(input);

    const column = await prisma.column.update({
      where: { id },
      // Fields are copied one by one: spreading the payload would reach
      // `ColumnUncheckedUpdateInput`, which accepts `boardId`.
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.color !== undefined && { color: data.color }),
      },
    });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'COLUMN_UPDATED',
      entityType: 'column',
      entityId: id,
      metadata: { fields: Object.keys(data), title: column.title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: column };
  } catch (error) {
    return toActionError('updateColumn', error, 'Failed to update column');
  }
}

export async function deleteColumn(columnId: string): Promise<ActionResult<true>> {
  try {
    const id = uuidSchema.parse(columnId);
    const { user, boardId, column } = await requireColumnAccess(id, EDITOR_ROLES);

    await prisma.column.delete({ where: { id } });

    await logActivity({
      boardId,
      userId: user.id,
      action: 'COLUMN_DELETED',
      entityType: 'column',
      entityId: id,
      metadata: { title: column.title },
    });

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    return toActionError('deleteColumn', error, 'Failed to delete column');
  }
}

export async function reorderColumns(input: unknown): Promise<ActionResult<true>> {
  try {
    const user = await requireAuth();
    const { columnIds } = reorderColumnsSchema.parse(input);

    const unique = new Set(columnIds);
    if (unique.size !== columnIds.length) throw new PublicError('Duplicate column ids');

    // Derive the board from the rows, then require that the payload is exactly the set of
    // columns on that board. A column id belonging to someone else's board can therefore
    // never be written: it either fails the board match or the completeness check.
    const columns = await prisma.column.findMany({
      where: { id: { in: columnIds } },
      select: { id: true, boardId: true },
    });
    if (columns.length !== columnIds.length) throw new PublicError('Column not found');

    const boardId = columns[0]?.boardId;
    if (!boardId || columns.some((col) => col.boardId !== boardId)) {
      throw new PublicError('Columns must belong to the same board');
    }

    await requireBoardMember(boardId, user.id, EDITOR_ROLES);

    const boardColumnCount = await prisma.column.count({ where: { boardId } });
    if (boardColumnCount !== columnIds.length) {
      throw new PublicError('Reorder must include every column on the board');
    }

    await prisma.$transaction(
      columnIds.map((id, index) =>
        prisma.column.update({ where: { id }, data: { position: (index + 1) * POSITION_STEP } }),
      ),
    );

    revalidatePath(`/board/${boardId}`);
    return { data: true };
  } catch (error) {
    return toActionError('reorderColumns', error, 'Failed to reorder columns');
  }
}
