import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type * as RateLimitModule from '@/lib/rate-limit';

vi.mock('@/lib/prisma', () => ({
  prisma: { analyticsEvent: { createMany: vi.fn() } },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  enforceRateLimit: vi.fn(async () => {}),
}));

import { prisma } from '@/lib/prisma';
import { dailyActiveKey, signedUpKey } from '@/lib/analytics/events';
import { clearDedupeMemoForTests, trackEvent } from '@/lib/analytics/track';
import { createClient } from '@/lib/supabase/server';
import { trackSignedUp } from '@/app/actions/analytics-actions';

import type { AnalyticsEventInput } from '@/lib/analytics/events';

const db = prisma as unknown as { analyticsEvent: { createMany: Mock } };

const mockedCreateClient = createClient as unknown as Mock;

function signInAs(id = 'user-1'): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id, email: 'me@example.com' } }, error: null }),
    },
  });
}

function signedOut(): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
  signInAs();
  // The warm-instance memo is module state, which vitest does not reset between
  // tests in the same file — only between files.
  clearDedupeMemoForTests();
});

describe('dedupe keys', () => {
  it('builds a stable per-user signed_up key', () => {
    expect(signedUpKey('user-1')).toBe('signed_up:user-1');
  });

  it('builds a per-user, per-day daily_active key', () => {
    expect(dailyActiveKey('user-1', new Date('2026-07-28T12:00:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
  });

  describe('UTC calendar date enforcement', () => {
    let originalTz: string | undefined;

    beforeAll(() => {
      originalTz = process.env.TZ;
      // Pin to Asia/Tokyo (UTC+9) to exercise the local-vs-UTC distinction.
      // 2026-07-28T23:30:00.000Z is 2026-07-29 09:30 in Tokyo time.
      // If the implementation used .getDate() instead of .toISOString(),
      // it would produce '2026-07-29', not '2026-07-28', triggering a test failure.
      // This ensures the UTC correctness is enforced on all runners, including CI with TZ=UTC.
      process.env.TZ = 'Asia/Tokyo';
    });

    afterAll(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    it('uses the UTC calendar date, not the server-local one', () => {
      // 23:30 UTC on the 28th is already the 29th in UTC+2 and still the 28th in
      // UTC-5. The key must be identical regardless of the deploy region, or a
      // single user double-counts across a region change.
      // With TZ=Asia/Tokyo (UTC+9), the assertion is exercised in the opposite
      // direction: 23:30 UTC is 08:30 the next day locally.
      expect(dailyActiveKey('user-1', new Date('2026-07-28T23:30:00.000Z'))).toBe(
        'daily_active:user-1:2026-07-28',
      );
      expect(dailyActiveKey('user-1', new Date('2026-07-29T00:30:00.000Z'))).toBe(
        'daily_active:user-1:2026-07-29',
      );
    });
  });

  it('gives the same user a different key on a different day', () => {
    const a = dailyActiveKey('user-1', new Date('2026-07-28T09:00:00.000Z'));
    const b = dailyActiveKey('user-1', new Date('2026-07-29T09:00:00.000Z'));
    expect(a).not.toBe(b);
  });
});

describe('trackEvent', () => {
  it('never throws when the database write rejects', async () => {
    // The single most important guarantee in this feature: analytics must never
    // fail a mutation the user actually completed. A throw here would make the
    // calling action return { error } and the client would revert a change that
    // really did persist.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.analyticsEvent.createMany.mockRejectedValue(new Error('connection terminated'));

    await expect(
      trackEvent({
        name: 'invite_accepted',
        userId: 'user-1',
        boardId: 'board-1',
        properties: { invitationId: 'inv-1', role: 'EDITOR', secondsSinceLinkCreated: 42 },
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('never throws even when the event itself is malformed', async () => {
    // Guards the whole body, not just the awaited write: if a refactor ever hoists
    // the payload construction above the try block, property access on a null event
    // would throw past the catch and fail a mutation the user completed.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(trackEvent(null as unknown as AnalyticsEventInput)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('writes one row with skipDuplicates so a duplicate dedupe key is a no-op', async () => {
    await trackEvent({
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-28',
    });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'daily_active',
          userId: 'user-1',
          boardId: null,
          properties: {},
          dedupeKey: 'daily_active:user-1:2026-07-28',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('skips a repeat write for a dedupe key this instance already wrote', async () => {
    // The dashboard layout re-renders on every revalidatePath response — ~20
    // mutation sites, including every task move — so without this memo each of
    // those costs an INSERT … ON CONFLICT DO NOTHING round-trip on a max:1 pool
    // that can only ever be a no-op after the day's first write.
    const event = {
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-28',
    } as const;

    await trackEvent(event);
    await trackEvent(event);
    await trackEvent(event);

    expect(db.analyticsEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it('still writes when the dedupe key differs (a new UTC day)', async () => {
    await trackEvent({
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-28',
    });
    await trackEvent({
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-29',
    });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it('does not memoize a key whose write failed, so the next attempt retries', async () => {
    // Remembering a failed write would silently drop that user's daily_active for
    // the rest of the instance's life. The memo is an optimisation, never a
    // correctness mechanism — the unique index is.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.analyticsEvent.createMany.mockRejectedValueOnce(new Error('connection terminated'));

    const event = {
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-28',
    } as const;

    await trackEvent(event);
    await trackEvent(event);

    expect(db.analyticsEvent.createMany).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('never memoizes an ordinary event, which has no dedupe key', async () => {
    const event = {
      name: 'invite_link_created',
      userId: 'user-1',
      boardId: 'board-1',
      properties: { role: 'VIEWER', invitationId: 'inv-1' },
    } as const;

    await trackEvent(event);
    await trackEvent(event);

    expect(db.analyticsEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it('drops any property key not on the event type allowlist', async () => {
    // Defence in depth for the privacy contract. The closed union makes a stray
    // key a compile error only for an object LITERAL; a widened variable would
    // slip past it. This is the runtime backstop, so an email or a token cannot
    // reach the events table even if the type system is subverted.
    const smuggled = {
      role: 'VIEWER',
      invitationId: 'inv-1',
      email: 'victim@example.com',
      token: 'raw-invite-token',
    } as unknown as { role: 'VIEWER'; invitationId: string };

    await trackEvent({
      name: 'invite_link_created',
      userId: 'user-1',
      boardId: 'board-1',
      properties: smuggled,
    });

    const [{ data }] = db.analyticsEvent.createMany.mock.calls[0];
    expect(data[0].properties).toEqual({ role: 'VIEWER', invitationId: 'inv-1' });
    expect(JSON.stringify(data[0].properties)).not.toContain('victim@example.com');
    expect(JSON.stringify(data[0].properties)).not.toContain('raw-invite-token');
  });

  it('stores a NULL dedupe key for ordinary, non-deduped events', async () => {
    await trackEvent({
      name: 'invite_link_created',
      userId: 'user-1',
      boardId: 'board-1',
      properties: { role: 'VIEWER', invitationId: 'inv-1' },
    });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'invite_link_created',
          userId: 'user-1',
          boardId: 'board-1',
          properties: { role: 'VIEWER', invitationId: 'inv-1' },
          dedupeKey: null,
        },
      ],
      skipDuplicates: true,
    });
  });
});

describe('trackSignedUp', () => {
  it('rejects an unauthenticated caller without writing anything', async () => {
    // /register is a public route, so this action is the one client entry point
    // into analytics — it must never behave as an open write endpoint.
    signedOut();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trackSignedUp({ method: 'password', fromInvite: false });

    expect(result).toEqual({ error: 'Unauthorized' });
    expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('checks auth before it parses — a signed-out caller never reaches validation', async () => {
    // The ordering is the security property: /register is a public route, so this
    // action is reachable unauthenticated. A malformed payload from a signed-out
    // caller must still report Unauthorized — a Zod message here would mean the
    // parse ran first, leaking which fields the endpoint accepts to an anonymous caller.
    signedOut();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trackSignedUp({ method: 'carrier-pigeon', fromInvite: 'nope' });

    expect(result).toEqual({ error: 'Unauthorized' });
    expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects a malformed payload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trackSignedUp({ method: 'carrier-pigeon', fromInvite: false });

    expect(result.error).toBeDefined();
    expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('records the signup with the authenticated user id and a dedupe key', async () => {
    const result = await trackSignedUp({ method: 'password', fromInvite: true });

    expect(result).toEqual({ data: true });
    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'signed_up',
          userId: 'user-1',
          boardId: null,
          properties: { method: 'password', fromInvite: true },
          dedupeKey: 'signed_up:user-1',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('never trusts a user id supplied by the caller', async () => {
    await trackSignedUp({ method: 'password', fromInvite: false, userId: 'attacker' });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ userId: 'user-1' })],
      }),
    );
  });
});
