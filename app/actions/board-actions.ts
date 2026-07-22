'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import {
  EDITOR_ROLES,
  OWNER_ROLES,
  PublicError,
  logActivity,
  requireAuth,
  requireBoardAccess,
  requireBoardMember,
  toActionError,
} from '@/lib/auth/require-access';
import { DEFAULT_COLUMNS } from '@/lib/constants';
import {
  addBoardMemberSchema,
  changeMemberRoleSchema,
  createBoardSchema,
  updateBoardSchema,
  uuidSchema,
} from '@/lib/validations/board';
import { PUBLIC_PROFILE_SELECT } from '@/types/board';
import type { ActionResult } from '@/lib/auth/require-access';
import type { BoardWithDetails } from '@/types';
import type { Board, BoardMember } from '@prisma/client';

/** Gap between adjacent positions; see the fractional-ordering note in task-actions.ts. */
const POSITION_STEP = 1000;

export async function createBoard(input: unknown): Promise<ActionResult<Board>> {
  try {
    const user = await requireAuth();
    const data = createBoardSchema.parse(input);

    const board = await prisma.board.create({
      data: {
        title: data.title,
        description: data.description,
        createdBy: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
        columns: {
          create: DEFAULT_COLUMNS.map((col, index) => ({
            title: col.title,
            color: col.color,
            position: (index + 1) * POSITION_STEP,
          })),
        },
      },
    });

    await logActivity({
      boardId: board.id,
      userId: user.id,
      action: 'BOARD_CREATED',
      entityType: 'board',
      entityId: board.id,
      metadata: { boardTitle: board.title },
    });

    revalidatePath('/boards');
    return { data: board };
  } catch (error) {
    return toActionError('createBoard', error, 'Failed to create board');
  }
}

export async function updateBoard(boardId: string, input: unknown): Promise<ActionResult<Board>> {
  try {
    const id = uuidSchema.parse(boardId);
    const { user } = await requireBoardAccess(id, EDITOR_ROLES);
    const data = updateBoardSchema.parse(input);

    const board = await prisma.board.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });

    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'BOARD_UPDATED',
      entityType: 'board',
      entityId: id,
      metadata: { fields: Object.keys(data), boardTitle: board.title },
    });

    revalidatePath(`/board/${id}`);
    revalidatePath('/boards');
    return { data: board };
  } catch (error) {
    return toActionError('updateBoard', error, 'Failed to update board');
  }
}

export async function deleteBoard(boardId: string): Promise<ActionResult<{ id: string }>> {
  let deleted: string;

  try {
    const id = uuidSchema.parse(boardId);
    const { user } = await requireBoardAccess(id, OWNER_ROLES);

    // Logged before the delete: `activity_logs.board_id` cascades, so the row itself goes
    // away with the board — the write exists so realtime/replication consumers observe it.
    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'BOARD_DELETED',
      entityType: 'board',
      entityId: id,
      metadata: {},
    });

    await prisma.board.delete({ where: { id } });
    deleted = id;
  } catch (error) {
    return toActionError('deleteBoard', error, 'Failed to delete board');
  }

  // Outside the try: `redirect()` signals by throwing, and swallowing that in the catch
  // is what made this action return `{ error }` on failure but `undefined` on success.
  revalidatePath('/boards');
  redirect('/boards');

  return { data: { id: deleted } };
}

export async function addBoardMember(
  boardId: string,
  input: unknown,
): Promise<ActionResult<BoardMember>> {
  try {
    const id = uuidSchema.parse(boardId);
    const { user } = await requireBoardAccess(id, OWNER_ROLES);
    const { email, role } = addBoardMemberSchema.parse(input);

    const targetProfile = await prisma.profile.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!targetProfile) throw new PublicError('No account found for that email address');

    const existing = await prisma.boardMember.findFirst({
      where: { boardId: id, userId: targetProfile.id },
      select: { id: true },
    });
    if (existing) throw new PublicError('User is already a member');

    const member = await prisma.boardMember.create({
      data: { boardId: id, userId: targetProfile.id, role },
    });

    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'MEMBER_ADDED',
      entityType: 'member',
      entityId: member.id,
      metadata: { email, role },
    });

    revalidatePath(`/board/${id}`);
    return { data: member };
  } catch (error) {
    return toActionError('addBoardMember', error, 'Failed to add member');
  }
}

export async function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<ActionResult<true>> {
  try {
    const id = uuidSchema.parse(boardId);
    const targetUserId = uuidSchema.parse(userId);
    const { user } = await requireBoardAccess(id, OWNER_ROLES);

    // Read-then-delete in one transaction: removing the last OWNER would orphan the board
    // with no in-app way to recover it.
    await prisma.$transaction(async (tx) => {
      const target = await tx.boardMember.findFirst({
        where: { boardId: id, userId: targetUserId },
      });
      if (!target) throw new PublicError('User is not a member of this board');

      if (target.role === 'OWNER') {
        const ownerCount = await tx.boardMember.count({ where: { boardId: id, role: 'OWNER' } });
        if (ownerCount <= 1) {
          throw new PublicError('Cannot remove the last owner — promote another owner first');
        }
      }

      await tx.boardMember.delete({ where: { id: target.id } });
    });

    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'MEMBER_REMOVED',
      entityType: 'member',
      entityId: targetUserId,
      metadata: { removedUserId: targetUserId },
    });

    revalidatePath(`/board/${id}`);
    return { data: true };
  } catch (error) {
    return toActionError('removeBoardMember', error, 'Failed to remove member');
  }
}

export async function changeMemberRole(
  boardId: string,
  userId: string,
  input: unknown,
): Promise<ActionResult<BoardMember>> {
  try {
    const id = uuidSchema.parse(boardId);
    const targetUserId = uuidSchema.parse(userId);
    const { user } = await requireBoardAccess(id, OWNER_ROLES);
    const { role } = changeMemberRoleSchema.parse(input);

    // Read-then-update in one transaction so the OWNER-target check cannot race a
    // concurrent role change. An OWNER's role is untouchable here — the schema
    // already forbids assigning OWNER; this also forbids demoting one.
    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.boardMember.findFirst({
        where: { boardId: id, userId: targetUserId },
        include: { profile: { select: { email: true } } },
      });
      if (!target) throw new PublicError('User is not a member of this board');
      if (target.role === 'OWNER') {
        throw new PublicError("Owners' roles can't be changed here");
      }

      const member = await tx.boardMember.update({ where: { id: target.id }, data: { role } });
      return { member, email: target.profile.email };
    });

    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'MEMBER_ROLE_CHANGED',
      entityType: 'member',
      entityId: updated.member.id,
      metadata: { email: updated.email, role },
    });

    revalidatePath(`/board/${id}`);
    return { data: updated.member };
  } catch (error) {
    return toActionError('changeMemberRole', error, 'Failed to change member role');
  }
}

export async function leaveBoard(boardId: string): Promise<ActionResult<{ id: string }>> {
  let leftBoard: string;

  try {
    const id = uuidSchema.parse(boardId);
    const user = await requireAuth();
    const membership = await requireBoardMember(id, user.id);

    // Same last-owner guard as removeBoardMember: leaving as the sole owner would
    // orphan the board with no in-app way to recover it.
    await prisma.$transaction(async (tx) => {
      if (membership.role === 'OWNER') {
        const ownerCount = await tx.boardMember.count({ where: { boardId: id, role: 'OWNER' } });
        if (ownerCount <= 1) {
          throw new PublicError('Cannot leave as the last owner — promote another owner first');
        }
      }
      await tx.boardMember.delete({ where: { id: membership.id } });
    });

    await logActivity({
      boardId: id,
      userId: user.id,
      action: 'MEMBER_REMOVED',
      entityType: 'member',
      entityId: user.id,
      metadata: { removedUserId: user.id },
    });

    leftBoard = id;
  } catch (error) {
    return toActionError('leaveBoard', error, 'Failed to leave board');
  }

  // Outside the try: `redirect()` signals by throwing, and swallowing that throw
  // in the catch is what would turn a success into `{ error }` — see deleteBoard.
  revalidatePath('/boards');
  redirect('/boards');

  return { data: { id: leftBoard } };
}

export async function getBoardData(boardId: string): Promise<ActionResult<BoardWithDetails>> {
  try {
    const id = uuidSchema.parse(boardId);
    await requireBoardAccess(id);

    const board = await prisma.board.findUnique({
      where: { id },
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
        members: { include: { profile: true } },
        creator: { select: PUBLIC_PROFILE_SELECT },
      },
    });
    if (!board) throw new PublicError('Board not found');

    return { data: board };
  } catch (error) {
    return toActionError('getBoardData', error, 'Failed to fetch board');
  }
}
