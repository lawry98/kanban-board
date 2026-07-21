import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  // Hosted Supabase requires SSL with its self-signed cert; a local Supabase/Postgres
  // instance has no SSL at all. Opt out with `?sslmode=disable` in the connection string.
  const sslDisabled = connectionString?.includes('sslmode=disable') ?? false;

  const adapter = new PrismaPg({
    connectionString,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
