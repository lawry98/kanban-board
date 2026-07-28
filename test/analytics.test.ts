import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { analyticsEvent: { createMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { dailyActiveKey, signedUpKey } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/track';

const db = prisma as unknown as { analyticsEvent: { createMany: Mock } };

beforeEach(() => {
  vi.clearAllMocks();
  db.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
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
