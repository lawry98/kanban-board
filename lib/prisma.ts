import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { serverEnv } from '@/lib/env';

import type { ConnectionOptions } from 'node:tls';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * TLS policy for the database connection.
 *
 * Certificate verification stays ON. Supabase's pooler and direct database
 * hostnames present certificates chained to a public root, so the default
 * system trust store validates them without any extra configuration.
 * `SUPABASE_CA_CERT` exists only for the legacy endpoint, whose CA Supabase
 * publishes as a downloadable bundle. Disabling verification would leave the
 * DB credential and every row exposed to an on-path attacker.
 *
 * `?sslmode=disable` remains supported for a local Postgres/Supabase instance
 * that serves no TLS at all.
 */
function resolveSsl(
  connectionString: string,
  caCert: string | undefined,
): ConnectionOptions | false {
  if (connectionString.includes('sslmode=disable')) return false;
  return caCert ? { rejectUnauthorized: true, ca: caCert } : { rejectUnauthorized: true };
}

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
