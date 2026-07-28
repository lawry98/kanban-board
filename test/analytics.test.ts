import { describe, expect, it } from 'vitest';

import { dailyActiveKey, signedUpKey } from '@/lib/analytics/events';

describe('dedupe keys', () => {
  it('builds a stable per-user signed_up key', () => {
    expect(signedUpKey('user-1')).toBe('signed_up:user-1');
  });

  it('builds a per-user, per-day daily_active key', () => {
    expect(dailyActiveKey('user-1', new Date('2026-07-28T12:00:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
  });

  it('uses the UTC calendar date, not the server-local one', () => {
    // 23:30 UTC on the 28th is already the 29th in UTC+2 and still the 28th in
    // UTC-5. The key must be identical regardless of the deploy region, or a
    // single user double-counts across a region change.
    expect(dailyActiveKey('user-1', new Date('2026-07-28T23:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
    expect(dailyActiveKey('user-1', new Date('2026-07-29T00:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-29',
    );
  });

  it('gives the same user a different key on a different day', () => {
    const a = dailyActiveKey('user-1', new Date('2026-07-28T09:00:00.000Z'));
    const b = dailyActiveKey('user-1', new Date('2026-07-29T09:00:00.000Z'));
    expect(a).not.toBe(b);
  });
});
