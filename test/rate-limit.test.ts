import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }));
// require-access (PublicError) imports the Supabase server client, which validates env at import.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { PublicError, toActionError } from '@/lib/auth/require-access';
import { RATE_LIMITS, RateLimitError, enforceRateLimit } from '@/lib/rate-limit';

const queryRaw = prisma.$queryRaw as unknown as Mock;
const USER = 'user-1';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('enforceRateLimit', () => {
  it.each(Object.entries(RATE_LIMITS))(
    '%s: allows `limit` calls, then blocks',
    async (bucket, { limit }) => {
      let hits = 0;
      queryRaw.mockImplementation(async () => [{ hits: ++hits, retry_after: 30 }]);
      for (let i = 0; i < limit; i++) {
        await expect(
          enforceRateLimit(USER, bucket as keyof typeof RATE_LIMITS),
        ).resolves.toBeUndefined();
      }
      await expect(
        enforceRateLimit(USER, bucket as keyof typeof RATE_LIMITS),
      ).rejects.toBeInstanceOf(RateLimitError);
    },
  );

  it('carries retry-after and a sanitized message through toActionError', async () => {
    queryRaw.mockResolvedValue([{ hits: 121, retry_after: 42 }]);
    const err = await enforceRateLimit(USER, 'mutation').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublicError);
    expect((err as RateLimitError).retryAfterSeconds).toBe(42);
    expect(toActionError('x', err, 'fallback')).toEqual({
      error: 'Too many requests, try again in 42s',
    });
  });

  it('formats long waits in minutes', () => {
    expect(new RateLimitError(3540).message).toBe('Too many requests, try again in 59 min');
  });

  it('fails open when the store errors, logging the bucket', async () => {
    queryRaw.mockRejectedValue(new Error('relation "rate_limits" does not exist'));
    await expect(enforceRateLimit(USER, 'invitationAccept')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('invitationAccept'),
      expect.any(Error),
    );
  });

  it('fails open on a synchronous throw, an empty result, or a garbled row', async () => {
    queryRaw.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // A query that succeeds but yields no usable counter is also an outage: log it.
    errorSpy.mockClear();
    queryRaw.mockResolvedValueOnce([]);
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('rateLimit(mutation) failed open'),
      undefined,
    );

    errorSpy.mockClear();
    const garbled = { hits: 'nope', retry_after: null };
    queryRaw.mockResolvedValueOnce([garbled]);
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('unexpected counter row'),
      garbled,
    );
  });

  it('stays silent for an in-limit call', async () => {
    queryRaw.mockResolvedValue([{ hits: RATE_LIMITS.mutation.limit, retry_after: 30 }]);
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('coerces bigint counters', async () => {
    queryRaw.mockResolvedValue([{ hits: BigInt(121), retry_after: BigInt(5) }]);
    await expect(enforceRateLimit(USER, 'mutation')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('binds every value as a parameter, never interpolated SQL', async () => {
    queryRaw.mockResolvedValue([{ hits: 1, retry_after: 60 }]);
    await enforceRateLimit(USER, 'mutation');
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(expect.arrayContaining(['mutation', USER, 60]));
    expect(strings.join('')).not.toContain(USER);
  });
});
