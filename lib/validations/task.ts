import { z } from 'zod';

import { uuidSchema } from '@/lib/validations/board';

const priorityEnum = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(255, 'Title must be 255 characters or less');

const descriptionSchema = z
  .string()
  .trim()
  .max(10_000, 'Description must be 10000 characters or less');

/**
 * Must parse to a real instant — `z.string()` let `'garbage'` through, which became an
 * Invalid Date and surfaced as a raw Prisma error. Accepts both `yyyy-MM-dd` (what the
 * date input emits) and full ISO datetimes.
 */
const dueDateSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date');

const labelsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Labels cannot be empty')
      .max(30, 'Labels must be 30 characters or less'),
  )
  .max(20, 'A task can have at most 20 labels');

export const createTaskSchema = z.object({
  columnId: uuidSchema,
  title: titleSchema,
  description: descriptionSchema.optional(),
  priority: priorityEnum.optional(),
  labels: labelsSchema.optional(),
  dueDate: dueDateSchema.optional(),
  assigneeId: uuidSchema.nullable().optional(),
});

/** No `boardId`: the board is derived from the task row being updated. */
export const updateTaskSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    priority: priorityEnum.optional(),
    labels: labelsSchema.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    assigneeId: uuidSchema.nullable().optional(),
    columnId: uuidSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');

/** `targetIndex` is a UI slot, not a stored value — the server derives the real position. */
export const moveTaskSchema = z.object({
  taskId: uuidSchema,
  targetColumnId: uuidSchema,
  targetIndex: z.number().int().min(0).max(10_000),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
