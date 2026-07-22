import { z } from 'zod';

import { MAX_COLUMNS } from '@/lib/constants';
import { uuidSchema } from '@/lib/validations/board';

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(100, 'Title must be 100 characters or less');

/** Rendered into `style={{ backgroundColor }}` — must be a literal hex colour, nothing else. */
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, 'Colour must be a hex value like #6366f1');

export const createColumnSchema = z.object({
  boardId: uuidSchema,
  title: titleSchema,
  color: colorSchema.optional(),
});

/**
 * Deliberately has no `boardId` and no `position`: a client object spread into
 * `prisma.column.update` reaches `ColumnUncheckedUpdateInput`, which accepts `boardId` —
 * that would re-parent the column (and all of its tasks) onto another board, past an
 * authorization check that read the row's OLD boardId. Ordering goes through
 * `reorderColumns`, which derives the board from the rows.
 */
export const updateColumnSchema = z
  .object({
    title: titleSchema.optional(),
    color: colorSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');

/**
 * No boardId: the board is derived from the columns themselves, and every id must
 * resolve to the same board.
 */
export const reorderColumnsSchema = z.object({
  columnIds: z.array(uuidSchema).min(1, 'Nothing to reorder').max(MAX_COLUMNS),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type ReorderColumnsInput = z.infer<typeof reorderColumnsSchema>;
