import { z } from 'zod';

import { MAX_BOARD_TITLE_LENGTH } from '@/lib/constants';

export const createBoardSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(MAX_BOARD_TITLE_LENGTH, `Title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

export const updateBoardSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(MAX_BOARD_TITLE_LENGTH, `Title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`)
    .optional(),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
