import { describe, expect, it } from 'vitest';

import {
  INVITATION_TTL_DAYS,
  activeInvitationWhere,
  effectiveExpiry,
  invitationEmailMatches,
  invitationExpiry,
  isInvitationActive,
} from '@/lib/invitations';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-06T12:00:00.000Z');

function inv(
  overrides: Partial<{ revokedAt: Date | null; expiresAt: Date | null; createdAt: Date }> = {},
) {
  return {
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + DAY),
    createdAt: NOW,
    ...overrides,
  };
}

describe('invitationExpiry', () => {
  it('is INVITATION_TTL_DAYS after the given instant', () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiry(NOW).getTime()).toBe(NOW.getTime() + 7 * DAY);
  });
});

describe('isInvitationActive', () => {
  it('accepts a live, unrevoked link', () => {
    expect(isInvitationActive(inv(), NOW)).toBe(true);
  });
  it('rejects a revoked link even before expiry', () => {
    expect(isInvitationActive(inv({ revokedAt: NOW }), NOW)).toBe(false);
  });
  it('rejects a link at or past its expiry', () => {
    expect(isInvitationActive(inv({ expiresAt: NOW }), NOW)).toBe(false);
    expect(isInvitationActive(inv({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(false);
  });
  it('lapses a legacy null-expiry link INVITATION_TTL_DAYS after creation', () => {
    const fresh = inv({ expiresAt: null, createdAt: new Date(NOW.getTime() - 6 * DAY) });
    const stale = inv({ expiresAt: null, createdAt: new Date(NOW.getTime() - 7 * DAY) });
    expect(isInvitationActive(fresh, NOW)).toBe(true);
    expect(isInvitationActive(stale, NOW)).toBe(false);
    expect(effectiveExpiry(fresh).getTime()).toBe(fresh.createdAt.getTime() + 7 * DAY);
  });
});

describe('activeInvitationWhere', () => {
  it('mirrors isInvitationActive as a Prisma filter', () => {
    expect(activeInvitationWhere(NOW)).toEqual({
      revokedAt: null,
      OR: [
        { expiresAt: { gt: NOW } },
        { expiresAt: null, createdAt: { gt: new Date(NOW.getTime() - 7 * DAY) } },
      ],
    });
  });
});

describe('invitationEmailMatches', () => {
  const confirmed = '2026-01-01T00:00:00Z';
  it('lets anyone accept an unbound invite', () => {
    expect(invitationEmailMatches(null, { email: undefined, email_confirmed_at: undefined })).toBe(
      true,
    );
  });
  it('matches the confirmed email case- and whitespace-insensitively', () => {
    expect(
      invitationEmailMatches('ann@example.com', {
        email: ' Ann@Example.COM ',
        email_confirmed_at: confirmed,
      }),
    ).toBe(true);
  });
  it('rejects a different email', () => {
    expect(
      invitationEmailMatches('ann@example.com', {
        email: 'bob@example.com',
        email_confirmed_at: confirmed,
      }),
    ).toBe(false);
  });
  it('rejects an unconfirmed or missing email', () => {
    expect(
      invitationEmailMatches('ann@example.com', {
        email: 'ann@example.com',
        email_confirmed_at: undefined,
      }),
    ).toBe(false);
    expect(
      invitationEmailMatches('ann@example.com', {
        email: undefined,
        email_confirmed_at: confirmed,
      }),
    ).toBe(false);
  });
});
