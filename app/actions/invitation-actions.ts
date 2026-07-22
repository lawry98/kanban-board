'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import {
  OWNER_ROLES,
  PublicError,
  logActivity,
  requireAuth,
  requireBoardAccess,
  toActionError,
} from '@/lib/auth/require-access';
import { uuidSchema } from '@/lib/validations/board';
import { createInvitationSchema } from '@/lib/validations/invitation';
import { Prisma } from '@prisma/client';
import type { ActionResult } from '@/lib/auth/require-access';
import type { Invitation } from '@prisma/client';

/** Length of the raw entropy behind an invite token, before base64url encoding. */
const TOKEN_BYTES = 24;

/** An invite is usable only while neither revoked nor past its expiry. */
function isInvitationActive(invitation: Pick<Invitation, 'revokedAt' | 'expiresAt'>): boolean {
  if (invitation.revokedAt) return false;
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Creates a shareable, revocable invite link scoped to a role. Owner-only.
 * The token is returned so the UI can build the `/join/{token}` URL — it is the
 * only time the full token is handed back to the client.
 */
export async function createInvitation(
  boardId: string,
  input: unknown,
): Promise<ActionResult<Invitation>> {
  try {
    const id = uuidSchema.parse(boardId);
    const { user } = await requireBoardAccess(id, OWNER_ROLES);
    const { role, email } = createInvitationSchema.parse(input);

    const invitation = await prisma.invitation.create({
      data: {
        boardId: id,
        role,
        email: email ?? null,
        token: randomBytes(TOKEN_BYTES).toString('base64url'),
        invitedBy: user.id,
      },
    });

    return { data: invitation };
  } catch (error) {
    return toActionError('createInvitation', error, 'Failed to create invite link');
  }
}

/** Lists active (non-revoked, non-expired) invite links for the management panel. Owner-only. */
export async function getInvitations(boardId: string): Promise<ActionResult<Invitation[]>> {
  try {
    const id = uuidSchema.parse(boardId);
    await requireBoardAccess(id, OWNER_ROLES);

    const invitations = await prisma.invitation.findMany({
      where: {
        boardId: id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: invitations };
  } catch (error) {
    return toActionError('getInvitations', error, 'Failed to load invite links');
  }
}

/**
 * Revokes an invite link. The board is derived from the invitation row — never
 * from a client-supplied parent id — so an owner of board A cannot revoke a link
 * belonging to board B (the anti-IDOR rule).
 */
export async function revokeInvitation(
  invitationId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const id = uuidSchema.parse(invitationId);

    const invitation = await prisma.invitation.findUnique({ where: { id } });
    if (!invitation) throw new PublicError('Invite link not found');

    await requireBoardAccess(invitation.boardId, OWNER_ROLES);

    await prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });

    revalidatePath(`/board/${invitation.boardId}`);
    return { data: { id } };
  } catch (error) {
    return toActionError('revokeInvitation', error, 'Failed to revoke invite link');
  }
}

/**
 * Accepts an invite link for the signed-in user. Idempotent: joining a board you
 * already belong to is a no-op that still resolves to the board. The unique
 * constraint on (board_id, user_id) is the source of truth — a concurrent double
 * accept surfaces as P2002 and is treated as already-a-member.
 */
export async function acceptInvitation(token: unknown): Promise<ActionResult<{ boardId: string }>> {
  try {
    if (typeof token !== 'string' || token.length === 0) {
      throw new PublicError('This invite link is no longer valid');
    }

    const user = await requireAuth();

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || !isInvitationActive(invitation)) {
      throw new PublicError('This invite link is no longer valid');
    }

    const existing = await prisma.boardMember.findFirst({
      where: { boardId: invitation.boardId, userId: user.id },
      select: { id: true },
    });
    if (existing) return { data: { boardId: invitation.boardId } };

    try {
      const member = await prisma.boardMember.create({
        data: { boardId: invitation.boardId, userId: user.id, role: invitation.role },
      });

      await logActivity({
        boardId: invitation.boardId,
        userId: user.id,
        action: 'MEMBER_ADDED',
        entityType: 'member',
        entityId: member.id,
        metadata: { email: user.email ?? '', role: invitation.role },
      });
    } catch (error) {
      // Lost a race with another accept (or the add-by-email flow): the unique
      // (board_id, user_id) constraint fired. Already-a-member is success.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { data: { boardId: invitation.boardId } };
      }
      throw error;
    }

    revalidatePath(`/board/${invitation.boardId}`);
    return { data: { boardId: invitation.boardId } };
  } catch (error) {
    return toActionError('acceptInvitation', error, 'Failed to join board');
  }
}
