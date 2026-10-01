import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { resolveSsl } from '@/lib/db-tls';
import { serverEnv } from '@/lib/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const { DATABASE_URL, SUPABASE_CA_CERT } = serverEnv();

  const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
    ssl: resolveSsl(DATABASE_URL, SUPABASE_CA_CERT),
    // Serverless sizing. `DATABASE_URL` should point at the Supabase transaction
    // pooler (port 6543, `?pgbouncer=true`); pooling then happens there, so each
    // lambda instance only ever needs a single connection. `DIRECT_URL` keeps
    // port 5432 for migrations. Without this cap, the driver default of 10 per
    // instance multiplies across concurrent lambdas and exhausts the database
    // ("sorry, too many clients").
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
