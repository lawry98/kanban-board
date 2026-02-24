import { z } from 'zod';

export const createColumnSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  boardId: z.string().min(1, 'Board is required'),
  color: z.string().optional(),
});

export const updateColumnSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or less')
    .optional(),
  color: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderColumnsSchema = z.object({
  boardId: z.string().min(1),
  columnIds: z.array(z.string()).min(1),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type ReorderColumnsInput = z.infer<typeof reorderColumnsSchema>;
