import { z } from 'zod';

import { MAX_BOARD_TITLE_LENGTH } from '@/lib/constants';

export const uuidSchema = z.uuid('Invalid id');

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(MAX_BOARD_TITLE_LENGTH, `Title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`);

const descriptionSchema = z.string().trim().max(500, 'Description must be 500 characters or less');

export const createBoardSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
});

export const updateBoardSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');

/** OWNER is deliberately not assignable here — it is only granted at board creation. */
export const addBoardMemberSchema = z.object({
  email: z
    .email('Enter a valid email address')
    .trim()
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less'),
  role: z.enum(['EDITOR', 'VIEWER']),
});

/** OWNER is deliberately not assignable here — ownership transfer is a later feature. */
export const changeMemberRoleSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER']),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type AddBoardMemberInput = z.infer<typeof addBoardMemberSchema>;
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
