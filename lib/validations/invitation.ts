import { z } from 'zod';

/**
 * The only roles an invite link may grant. OWNER is deliberately not assignable,
 * mirroring `addBoardMemberSchema`. Enforced twice: when a link is created, and
 * again when it is accepted, because a stored row is not proof it came through
 * `createInvitation`.
 */
export const invitableRoleSchema = z.enum(['EDITOR', 'VIEWER']);

/** Token and expiry are server-generated (crypto), never client input. */
export const createInvitationSchema = z.object({
  role: invitableRoleSchema,
  email: z
    .email('Enter a valid email address')
    .trim()
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less')
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
