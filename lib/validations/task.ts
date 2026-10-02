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
 * A calendar day, `YYYY-MM-DD` only (what `<input type="date">` emits), and a real one:
 * 2026-02-30 is rejected rather than rolled over. Datetimes are rejected too — an instant
 * falls on different days in different time zones, which is how due dates drifted.
 * See `lib/dates.ts`.
 */
const dueDateSchema = z.iso.date({ error: 'Enter a valid date' });

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
