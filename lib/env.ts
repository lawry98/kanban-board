import { z } from 'zod';

/**
 * Validated environment access.
 *
 * Two separate schemas:
 *  - `env`       — NEXT_PUBLIC_* values, safe in both browser and server bundles.
 *  - `serverEnv()` — server-only secrets, resolved lazily so that importing this
 *                    module from a client component never evaluates (or bundles)
 *                    them.
 *
 * IMPORTANT: every `NEXT_PUBLIC_*` variable must be referenced as a literal
 * `process.env.NEXT_PUBLIC_FOO` expression below. Next.js performs a static
 * text substitution at build time and cannot inline values reached through a
 * dynamic property access or by spreading `process.env`.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, { error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' }),
});

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL is required' }),
  DIRECT_URL: z.string().min(1).optional(),
  // PEM-encoded CA bundle, only needed for the legacy Supabase endpoint whose
  // certificate is not chained to a public root. Omit for pooler/direct hosts.
  SUPABASE_CA_CERT: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function format(prefix: string, error: z.ZodError): never {
  const issues = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`${prefix}\n${issues.join('\n')}`);
}

function parsePublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    format('Invalid public environment variables:', parsed.error);
  }

  return parsed.data;
}

export const env: PublicEnv = parsePublicEnv();

let cachedServerEnv: ServerEnv | undefined;

/** Server-only environment. Throws if called from a browser bundle. */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called from client code');
  }

  if (!cachedServerEnv) {
    const parsed = serverEnvSchema.safeParse({
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      SUPABASE_CA_CERT: process.env.SUPABASE_CA_CERT,
    });

    if (!parsed.success) {
      format('Invalid server environment variables:', parsed.error);
    }

    cachedServerEnv = parsed.data;
  }

  return cachedServerEnv;
}
