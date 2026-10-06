// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const PUBLIC_DSN = 'https://public@o0.ingest.sentry.io/0';
const SERVER_DSN = 'https://server@o0.ingest.sentry.io/1';

/**
 * `env` is parsed when lib/env.ts is first evaluated, so each case stubs the environment and
 * then imports a fresh copy of the module.
 */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  // Start every case from "unset" whatever the shell or .env.local provides.
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined);
  vi.stubEnv('SENTRY_DSN', undefined);
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return import('@/lib/env');
}

describe('Sentry DSN environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves both DSNs undefined when they are unset', async () => {
    const { env, serverSentryDsn } = await loadEnv({});
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(serverSentryDsn()).toBeUndefined();
  });

  it('treats empty strings (as copied from .env.example) as unset', async () => {
    const { env, serverSentryDsn } = await loadEnv({ NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '' });
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(serverSentryDsn()).toBeUndefined();
  });

  it('prefers SENTRY_DSN for the server even when the public DSN is also set', async () => {
    const { env, serverSentryDsn } = await loadEnv({
      NEXT_PUBLIC_SENTRY_DSN: PUBLIC_DSN,
      SENTRY_DSN: SERVER_DSN,
    });
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe(PUBLIC_DSN);
    expect(serverSentryDsn()).toBe(SERVER_DSN);
  });

  it('falls back to the public DSN on the server when SENTRY_DSN is unset', async () => {
    const { serverSentryDsn } = await loadEnv({ NEXT_PUBLIC_SENTRY_DSN: PUBLIC_DSN });
    expect(serverSentryDsn()).toBe(PUBLIC_DSN);
  });

  it('rejects a public DSN that is not a URL when the module loads', async () => {
    await expect(loadEnv({ NEXT_PUBLIC_SENTRY_DSN: 'not-a-url' })).rejects.toThrow(
      /- NEXT_PUBLIC_SENTRY_DSN:/,
    );
  });

  it('rejects a server DSN that is not a URL', async () => {
    const { serverSentryDsn } = await loadEnv({ SENTRY_DSN: 'not-a-url' });
    expect(() => serverSentryDsn()).toThrow(/- SENTRY_DSN:/);
  });

  it('resolves the server DSN without the database config', async () => {
    const { serverSentryDsn } = await loadEnv({ SENTRY_DSN: SERVER_DSN, DATABASE_URL: undefined });
    expect(serverSentryDsn()).toBe(SERVER_DSN);
  });
});
