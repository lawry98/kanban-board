import { ZodError } from 'zod';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { BoardMember, Column, Prisma, Role, Task } from '@prisma/client';
import type { User } from '@supabase/supabase-js';

/**
 * Shared authorization + result plumbing for every Server Action.
 *
 * Server Actions are public HTTP endpoints: every argument is attacker-controlled.
 * The rule enforced here is that a parent id is NEVER taken from the client — it is
 * always derived from the child row that the action is actually mutating. That makes
 * the "authorize board A, then write to board B" bug class unrepresentable rather than
 * merely absent.
 */

// ─── Result type ──────────────────────────────────────────────────────────────

export type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

// ─── Errors ───────────────────────────────────────────────────────────────────

/** An error whose message is safe to show to the client. */
export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicError';
  }
}

/**
 * Single funnel for every action catch block. Logs the real error server-side and
 * returns a message that never contains model names, column names, constraint names,
 * or the database host (all of which Prisma happily embeds in `error.message`).
 */
export function toActionError(
  context: string,
  error: unknown,
  fallback: string,
): { error: string } {
  console.error(`${context} error:`, error);

  if (error instanceof PublicError) return { error: error.message };
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? 'Invalid input' };
  }
  return { error: fallback };
}

// ─── Role sets ────────────────────────────────────────────────────────────────

export const EDITOR_ROLES: readonly Role[] = ['OWNER', 'EDITOR'];
export const OWNER_ROLES: readonly Role[] = ['OWNER'];

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new PublicError('Unauthorized');
  return user;
}

export async function requireBoardMember(
  boardId: string,
  userId: string,
  roles?: readonly Role[],
): Promise<BoardMember> {
  const member = await prisma.boardMember.findFirst({
    where: {
      boardId,
      userId,
      ...(roles ? { role: { in: [...roles] } } : {}),
    },
  });
  if (!member) throw new PublicError('Forbidden');
  return member;
}

// ─── Derived access helpers ───────────────────────────────────────────────────

export interface BoardAccess {
  user: User;
  member: BoardMember;
  boardId: string;
}

export interface ColumnAccess extends BoardAccess {
  column: Column;
}

export interface TaskAccess extends BoardAccess {
  task: Task;
}

/** Authorizes against a board id the client supplied — only valid when the board IS the target. */
export async function requireBoardAccess(
  boardId: string,
  roles?: readonly Role[],
): Promise<BoardAccess> {
  const user = await requireAuth();
  const member = await requireBoardMember(boardId, user.id, roles);
  return { user, member, boardId };
}

/** Authorizes against the board the column actually belongs to. */
export async function requireColumnAccess(
  columnId: string,
  roles?: readonly Role[],
): Promise<ColumnAccess> {
  const user = await requireAuth();
  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column) throw new PublicError('Column not found');
  const member = await requireBoardMember(column.boardId, user.id, roles);
  return { user, member, column, boardId: column.boardId };
}

/** Authorizes against the board the task actually belongs to. */
export async function requireTaskAccess(
  taskId: string,
  roles?: readonly Role[],
): Promise<TaskAccess> {
  const user = await requireAuth();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new PublicError('Task not found');
  const member = await requireBoardMember(task.boardId, user.id, roles);
  return { user, member, task, boardId: task.boardId };
}

/**
 * Proves a client-supplied column id lives on the board we already authorized.
 * Every action that accepts a second id must run this — that second id is the one
 * that historically escaped the authorization check.
 */
export async function requireColumnOnBoard(columnId: string, boardId: string): Promise<Column> {
  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column || column.boardId !== boardId) throw new PublicError('Column not found');
  return column;
}

/** Proves a client-supplied assignee is actually a member of this board. */
export async function requireBoardMemberExists(boardId: string, userId: string): Promise<void> {
  const member = await prisma.boardMember.findFirst({
    where: { boardId, userId },
    select: { id: true },
  });
  if (!member) throw new PublicError('Assignee is not a member of this board');
}

// ─── Activity logging (best-effort) ───────────────────────────────────────────

/**
 * Activity logging must never fail a committed mutation. A realistic failure is an FK
 * violation when a freshly-created OAuth user has no `profiles` row yet: the task IS
 * saved, but a throw here would make the action return `{ error }` and the client would
 * toast a failure and revert a change that actually persisted.
 */
export async function logActivity(data: Prisma.ActivityLogUncheckedCreateInput): Promise<void> {
  try {
    await prisma.activityLog.create({ data });
  } catch (error) {
    console.error('activityLog.create failed (non-fatal):', error);
  }
}
