// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  getClient: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
const after = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => sentry);
vi.mock('next/server', () => ({ after }));
// require-access imports these at module load; neither is exercised here.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { PublicError, toActionError } from '@/lib/auth/require-access';

describe('toActionError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports an unexpected error to Sentry, tagged with the action, and returns the fallback', () => {
    const err = new Error('connect ECONNREFUSED db.internal:5432');
    expect(toActionError('createTask', err, 'Failed to create task')).toEqual({
      error: 'Failed to create task',
    });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { action: 'createTask' } });
  });

  it('does not report a PublicError (an expected, client-safe outcome)', () => {
    expect(toActionError('x', new PublicError('Board not found'), 'f')).toEqual({
      error: 'Board not found',
    });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not report a ZodError (invalid input)', () => {
    const { error } = z
      .object({ title: z.string().min(1, 'Title is required') })
      .safeParse({ title: '' });
    expect(error).toBeInstanceOf(ZodError);
    expect(toActionError('x', error, 'f')).toEqual({ error: 'Title is required' });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('keeps the function alive until the flush settles when Sentry is active', () => {
    sentry.getClient.mockReturnValue({});
    toActionError('x', new Error('boom'), 'f');
    expect(after).toHaveBeenCalledTimes(1);
    after.mock.calls[0][0]();
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it('does not schedule a flush when Sentry is inert', () => {
    sentry.getClient.mockReturnValue(undefined);
    toActionError('x', new Error('boom'), 'f');
    expect(after).not.toHaveBeenCalled();
  });

  it('still returns the fallback when called outside a request scope', () => {
    sentry.getClient.mockReturnValue({});
    after.mockImplementationOnce(() => {
      throw new Error('`after` was called outside a request scope');
    });
    expect(toActionError('x', new Error('boom'), 'f')).toEqual({ error: 'f' });
  });
});
