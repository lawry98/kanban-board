import { parseArgs } from 'node:util';

import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { parseCalendarDate } from '@/lib/dates';
import { uuidSchema } from '@/lib/validations/board';

import {
  DEMO_BOARD_DESCRIPTION,
  DEMO_BOARD_TITLE,
  DEMO_COLUMNS,
  addCalendarDays,
} from './demo-board';

export const SEED_OPT_IN_ENV = 'ALLOW_DEMO_SEED';

const USAGE = 'Usage: ALLOW_DEMO_SEED=1 pnpm db:seed (--email <email> | --user-id <uuid>)';

/** Expected failures with a message fit for the terminal (no stack trace). */
export class SeedError extends Error {}

export type SeedTarget = { email: string } | { userId: string };

export type SeedResult =
  | { status: 'created'; boardId: string; columnCount: number; taskCount: number }
  | { status: 'exists'; boardId: string };

/** Throws SeedError unless env.ALLOW_DEMO_SEED === '1' exactly. */
export function assertSeedOptIn(env: Record<string, string | undefined>): void {
  if (env[SEED_OPT_IN_ENV] !== '1') {
    throw new SeedError(
      `Refusing to seed: set ${SEED_OPT_IN_ENV}=1 on the command line to confirm you mean to write demo data to this database.\n${USAGE}`,
    );
  }
}

const emailSchema = z.email().max(255);

/** Exactly one of `--email` / `--user-id`, validated. `--` (as in `pnpm db:seed -- --email x`) is dropped. */
export function parseSeedArgs(argv: readonly string[]): SeedTarget {
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  let values: { email?: string; 'user-id'?: string };
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: { email: { type: 'string' }, 'user-id': { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new SeedError(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
  }

  const { email, 'user-id': userId } = values;
  if ((email === undefined) === (userId === undefined)) {
    throw new SeedError(`Pass exactly one of --email or --user-id.\n${USAGE}`);
  }

  if (email !== undefined) {
    // Normalise before validating: Zod's format check runs before a chained `.trim()`.
    const parsed = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) throw new SeedError(`--email is not a valid email address.\n${USAGE}`);
    return { email: parsed.data };
  }

  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) throw new SeedError(`--user-id is not a valid UUID.\n${USAGE}`);
  return { userId: parsed.data };
}

async function resolveProfileId(db: PrismaClient, target: SeedTarget): Promise<string> {
  const profile =
    'userId' in target
      ? await db.profile.findUnique({ where: { id: target.userId }, select: { id: true } })
      : await db.profile.findFirst({
          where: { email: { equals: target.email, mode: 'insensitive' } },
          select: { id: true },
        });

  if (!profile) {
    const who = 'userId' in target ? `id ${target.userId}` : target.email;
    throw new SeedError(
      `No profile found for ${who}. Sign up in the app first; the seed only populates an existing user.`,
    );
  }
  return profile.id;
}

/**
 * Creates the demo board for an existing user. INSERTS ONLY: it never updates or deletes a
 * row, and a user who already has a board with the demo title is left untouched.
 * `today` is the `YYYY-MM-DD` day the due dates are offset from.
 */
export async function seedDemoBoard(
  db: PrismaClient,
  target: SeedTarget,
  today: string,
): Promise<SeedResult> {
  const profileId = await resolveProfileId(db, target);

  return db.$transaction(
    async (tx): Promise<SeedResult> => {
      // Serialises concurrent runs for the same user, so the existence check below cannot race.
      // Released automatically at commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo-seed:${profileId}`}::text))`;

      const existing = await tx.board.findFirst({
        where: { createdBy: profileId, title: DEMO_BOARD_TITLE },
        select: { id: true },
      });
      if (existing) return { status: 'exists', boardId: existing.id };

      const board = await tx.board.create({
        data: {
          title: DEMO_BOARD_TITLE,
          description: DEMO_BOARD_DESCRIPTION,
          createdBy: profileId,
          members: { create: { userId: profileId, role: 'OWNER' } },
        },
        select: { id: true },
      });

      // One at a time, in order: column order must never depend on RETURNING order.
      const columnIds: string[] = [];
      for (const [index, column] of DEMO_COLUMNS.entries()) {
        const created = await tx.column.create({
          data: {
            boardId: board.id,
            title: column.title,
            color: column.color,
            position: (index + 1) * 1000,
          },
          select: { id: true },
        });
        columnIds.push(created.id);
      }

      const tasks = await tx.task.createManyAndReturn({
        data: DEMO_COLUMNS.flatMap((column, columnIndex) =>
          column.tasks.map(
            (task, indexInColumn): Prisma.TaskCreateManyInput => ({
              columnId: columnIds[columnIndex],
              boardId: board.id,
              title: task.title,
              description: task.description ?? null,
              priority: task.priority,
              labels: [...task.labels],
              position: (indexInColumn + 1) * 1000,
              dueDate:
                task.dueInDays === undefined
                  ? null
                  : parseCalendarDate(addCalendarDays(today, task.dueInDays)),
              assigneeId: task.assignToOwner ? profileId : null,
              createdBy: profileId,
            }),
          ),
        ),
        select: { id: true, title: true },
      });

      // The activity feed reads `metadata.title`. Deliberately no analytics events: seeded
      // data must not count as product activation.
      await tx.activityLog.createMany({
        data: [
          {
            boardId: board.id,
            userId: profileId,
            action: 'BOARD_CREATED',
            entityType: 'board',
            entityId: board.id,
            metadata: { title: DEMO_BOARD_TITLE },
          },
          ...tasks.map(
            (task): Prisma.ActivityLogCreateManyInput => ({
              boardId: board.id,
              userId: profileId,
              action: 'TASK_CREATED',
              entityType: 'task',
              entityId: task.id,
              metadata: { title: task.title },
            }),
          ),
        ],
      });

      return {
        status: 'created',
        boardId: board.id,
        columnCount: columnIds.length,
        taskCount: tasks.length,
      };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
