import { z } from 'zod';

/**
 * OWNER is deliberately not assignable — a link can only ever grant EDITOR or
 * VIEWER, mirroring `addBoardMemberSchema`. Token and expiry are server-generated
 * (crypto), never client input.
 */
export const createInvitationSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER']),
  email: z
    .email('Enter a valid email address')
    .trim()
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less')
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
