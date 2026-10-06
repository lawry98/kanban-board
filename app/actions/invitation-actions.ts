'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { trackEvent } from '@/lib/analytics/track';
import {
  OWNER_ROLES,
  PublicError,
  logActivity,
  requireAuth,
  requireBoardAccess,
  toActionError,
} from '@/lib/auth/require-access';
import {
  activeInvitationWhere,
  invitationEmailMatches,
  invitationExpiry,
  isInvitationActive,
} from '@/lib/invitations';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uuidSchema } from '@/lib/validations/board';
import { createInvitationSchema, invitableRoleSchema } from '@/lib/validations/invitation';
import { Prisma } from '@prisma/client';
import type { ActionResult } from '@/lib/auth/require-access';
import type { Invitation } from '@prisma/client';

/** Length of the raw entropy behind an invite token, before base64url encoding. */
const TOKEN_BYTES = 24;

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
    await enforceRateLimit(user.id, 'invitationCreate');
    const { role, email } = createInvitationSchema.parse(input);

    const invitation = await prisma.invitation.create({
      data: {
        boardId: id,
        role,
        email: email ?? null,
        token: randomBytes(TOKEN_BYTES).toString('base64url'),
        invitedBy: user.id,
        expiresAt: invitationExpiry(),
      },
    });

    // Ids and enum values only — the token is never recorded.
    await trackEvent({
      name: 'invite_link_created',
      userId: user.id,
      boardId: id,
      properties: { role, invitationId: invitation.id },
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
      where: { boardId: id, ...activeInvitationWhere() },
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

    const { user } = await requireBoardAccess(invitation.boardId, OWNER_ROLES);
    await enforceRateLimit(user.id, 'mutation');

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
    // Before the token lookup, so guessing tokens is throttled per user, not just per row.
    await enforceRateLimit(user.id, 'invitationAccept');

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || !isInvitationActive(invitation)) {
      throw new PublicError('This invite link is no longer valid');
    }

    // A bound invite is for one person, not whoever holds the link. Checked before
    // the existing-member shortcut so the answer doesn't depend on membership.
    if (!invitationEmailMatches(invitation.email, user)) {
      throw new PublicError(
        'This invite was sent to a different email address. Sign in with that account to join.',
      );
    }

    // Re-check the stored role: a row written around createInvitation (e.g. via
    // the Supabase Data API) could claim OWNER. Fail closed rather than downgrade.
    const parsedRole = invitableRoleSchema.safeParse(invitation.role);
    if (!parsedRole.success) {
      console.error('acceptInvitation: refused non-invitable role', {
        invitationId: invitation.id,
        role: invitation.role,
      });
      throw new PublicError('This invite link is no longer valid');
    }
    const role = parsedRole.data;

    const existing = await prisma.boardMember.findFirst({
      where: { boardId: invitation.boardId, userId: user.id },
      select: { id: true },
    });
    if (existing) return { data: { boardId: invitation.boardId } };

    try {
      const member = await prisma.boardMember.create({
        data: { boardId: invitation.boardId, userId: user.id, role },
      });

      await logActivity({
        boardId: invitation.boardId,
        userId: user.id,
        action: 'MEMBER_ADDED',
        entityType: 'member',
        entityId: member.id,
        metadata: { email: user.email ?? '', role },
      });

      // Only here: not on the already-a-member early return above, and not in the
      // P2002 catch below. Either of those would inflate the accept count.
      await trackEvent({
        name: 'invite_accepted',
        userId: user.id,
        boardId: invitation.boardId,
        properties: {
          invitationId: invitation.id,
          role,
          secondsSinceLinkCreated: Math.max(
            0,
            Math.round((Date.now() - invitation.createdAt.getTime()) / 1000),
          ),
        },
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
