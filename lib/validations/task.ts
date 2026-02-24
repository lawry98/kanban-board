import { z } from 'zod';

const priorityEnum = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  description: z.string().optional(),
  priority: priorityEnum.default('NONE'),
  labels: z.array(z.string()).default([]),
  dueDate: z.string().optional(),
  assigneeId: z.string().optional(),
  columnId: z.string().min(1, 'Column is required'),
  boardId: z.string().min(1, 'Board is required'),
  position: z.number().int().min(0),
});

export const updateTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .optional(),
  description: z.string().optional().nullable(),
  priority: priorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  columnId: z.string().optional(),
});

export const moveTaskSchema = z.object({
  taskId: z.string().min(1),
  targetColumnId: z.string().min(1),
  newPosition: z.number().int().min(0),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
