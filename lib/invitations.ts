import type { Invitation, Prisma } from '@prisma/client';
import type { User } from '@supabase/supabase-js';

/** How long a newly created invite link stays usable. */
export const INVITATION_TTL_DAYS = 7;

const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** The expiry stamped on a link created at `from`. */
export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_MS);
}

/**
 * When a link stops working. Rows created before expiry was stamped have a null
 * `expiresAt`; they lapse INVITATION_TTL_DAYS after creation, so no link is
 * open-ended and no stored row has to be rewritten.
 */
export function effectiveExpiry(invitation: Pick<Invitation, 'expiresAt' | 'createdAt'>): Date {
  return invitation.expiresAt ?? invitationExpiry(invitation.createdAt);
}

/** An invite is usable only while neither revoked nor past its (effective) expiry. */
export function isInvitationActive(
  invitation: Pick<Invitation, 'revokedAt' | 'expiresAt' | 'createdAt'>,
  now: Date = new Date(),
): boolean {
  if (invitation.revokedAt) return false;
  return effectiveExpiry(invitation).getTime() > now.getTime();
}

/** The query twin of `isInvitationActive`: selects the links that are live at `now`. */
export function activeInvitationWhere(now: Date = new Date()): Prisma.InvitationWhereInput {
  return {
    revokedAt: null,
    OR: [
      { expiresAt: { gt: now } },
      { expiresAt: null, createdAt: { gt: new Date(now.getTime() - INVITATION_TTL_MS) } },
    ],
  };
}

/**
 * Whether `user` may accept an invite bound to `invitationEmail`. An unbound invite
 * is open to any signed-in user. A bound one needs a primary email that matches and
 * carries `email_confirmed_at`; `new_email` (a pending change) is deliberately not
 * consulted.
 *
 * The binding is only as strong as Supabase's "Confirm email" setting. With it ON,
 * `email_confirmed_at` proves the user controls the address. With it OFF, signup stamps
 * `email_confirmed_at` immediately, so anyone can register the invited address and pass
 * this check. Keep "Confirm email" enabled before relying on a bound invite. Nothing in
 * the UI sets `email` yet, so no invite is bound today.
 */
export function invitationEmailMatches(
  invitationEmail: string | null,
  user: Pick<User, 'email' | 'email_confirmed_at'>,
): boolean {
  if (!invitationEmail) return true;
  if (!user.email || !user.email_confirmed_at) return false;
  return user.email.trim().toLowerCase() === invitationEmail.trim().toLowerCase();
}
