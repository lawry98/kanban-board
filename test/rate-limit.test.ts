import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  getClient: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
const after = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => sentry);
vi.mock('next/server', () => ({ after }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }));
// require-access (PublicError) imports the Supabase server client, which validates env at import.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { PublicError, toActionError } from '@/lib/auth/require-access';
import { RATE_LIMITS, RateLimitError, enforceRateLimit } from '@/lib/rate-limit';

const queryRaw = prisma.$queryRaw as unknown as Mock;
const USER = 'user-1';

const MINUTE_MS = 60 * 1000;
const REPORT_INTERVAL_MS = 5 * MINUTE_MS;

// The outage-report throttle is module state with no reset hook. Each test instead starts an hour
// later than the last on a faked clock, so the previous test's report is always outside the window.
let clock = Date.UTC(2026, 0, 1);

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  clock += 60 * MINUTE_MS;
  vi.setSystemTime(clock);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

describe('enforceRateLimit outage reporting', () => {
  const storeDown = () => new Error('relation "rate_limits" does not exist');

  it('reports a thrown store error to Sentry, tagged with the bucket', async () => {
    const err = storeDown();
    queryRaw.mockRejectedValue(err);
    await expect(enforceRateLimit(USER, 'invitationAccept')).resolves.toBeUndefined();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { rateLimit: 'invitationAccept' },
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a garbled counter row (no usable hits) to Sentry', async () => {
    queryRaw.mockResolvedValueOnce([{ hits: 'nope', retry_after: null }]);
    await expect(enforceRateLimit(USER, 'memberAdd')).resolves.toBeUndefined();
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('rateLimit(memberAdd)'),
      { level: 'error', tags: { rateLimit: 'memberAdd' } },
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    sentry.captureMessage.mockClear();
    queryRaw.mockResolvedValueOnce([]);
    vi.setSystemTime(clock + REPORT_INTERVAL_MS);
    await expect(enforceRateLimit(USER, 'memberAdd')).resolves.toBeUndefined();
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports at most once per five minutes, but logs every failure', async () => {
    queryRaw.mockRejectedValue(storeDown());
    await enforceRateLimit(USER, 'mutation');
    await enforceRateLimit(USER, 'mutation');
    await enforceRateLimit(USER, 'invitationCreate');
    vi.setSystemTime(clock + REPORT_INTERVAL_MS - 1);
    await enforceRateLimit(USER, 'mutation');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(4);
  });

  it('shares one throttle between a thrown error and a garbled row', async () => {
    queryRaw.mockRejectedValueOnce(storeDown());
    await enforceRateLimit(USER, 'mutation');
    queryRaw.mockResolvedValueOnce([]);
    await enforceRateLimit(USER, 'mutation');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports again once the five minutes have passed', async () => {
    queryRaw.mockRejectedValue(storeDown());
    await enforceRateLimit(USER, 'mutation');
    vi.setSystemTime(clock + REPORT_INTERVAL_MS);
    await enforceRateLimit(USER, 'mutation');
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('never reports a block (RateLimitError) or an in-limit call', async () => {
    queryRaw.mockResolvedValueOnce([{ hits: 121, retry_after: 42 }]);
    await expect(enforceRateLimit(USER, 'mutation')).rejects.toBeInstanceOf(RateLimitError);
    queryRaw.mockResolvedValueOnce([{ hits: 1, retry_after: 42 }]);
    await enforceRateLimit(USER, 'mutation');
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('keeps the function alive until the flush settles when Sentry is active', async () => {
    sentry.getClient.mockReturnValue({});
    queryRaw.mockRejectedValue(storeDown());
    await enforceRateLimit(USER, 'mutation');
    expect(after).toHaveBeenCalledTimes(1);
    after.mock.calls[0][0]();
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it('schedules no flush when Sentry is inert', async () => {
    sentry.getClient.mockReturnValue(undefined);
    queryRaw.mockRejectedValue(storeDown());
    await enforceRateLimit(USER, 'mutation');
    expect(after).not.toHaveBeenCalled();
  });

  it.each([
    ['captureException', () => sentry.captureException],
    ['captureMessage', () => sentry.captureMessage],
    ['flush scheduling', () => after],
  ])('still fails open when Sentry reporting throws (%s)', async (name, target) => {
    sentry.getClient.mockReturnValue({});
    target().mockImplementationOnce(() => {
      throw new Error('sentry exploded');
    });
    if (name === 'captureMessage') queryRaw.mockResolvedValueOnce([]);
    else queryRaw.mockRejectedValueOnce(storeDown());
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
  });
});
