import { config } from 'dotenv';

import { localToday } from '@/lib/dates';

import {
  assertSeedOptIn,
  describeDatabaseTarget,
  parseSeedArgs,
  SeedError,
  seedDemoBoard,
} from './seed/seed-demo-board';

async function main(): Promise<void> {
  // Checked before .env.local loads: the opt-in must come from the command line, never a file.
  assertSeedOptIn(process.env);
  const target = parseSeedArgs(process.argv.slice(2));

  config({ path: '.env.local', quiet: true });
  // A DATABASE_URL exported in the shell beats .env.local, and the dev DB is shared: say where this lands.
  process.stderr.write(`Seeding database at ${describeDatabaseTarget(process.env.DATABASE_URL)}\n`);
  // Dynamic: lib/env validates on import, so .env.local must be loaded first.
  const { prisma } = await import('@/lib/prisma');
  try {
    const result = await seedDemoBoard(prisma, target, localToday());
    process.stdout.write(
      result.status === 'created'
        ? `Created demo board ${result.boardId} with ${result.columnCount} columns and ${result.taskCount} tasks.\n`
        : `Demo board already exists: ${result.boardId} (nothing written).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `${err instanceof SeedError ? err.message : err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exitCode = 1;
});
