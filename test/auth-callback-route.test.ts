import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// The route only needs the Supabase client for the code-exchange path; mock it so
// no real cookie/SSR machinery is pulled in. `sanitizeNext` is left real (pure).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
// `trackEvent` transitively imports the real Prisma client (via `@/lib/prisma`),
// which validates env vars at import time — mock it so this suite stays isolated
// from both Prisma and the DB, same as `require-access` tests do for `logActivity`.
vi.mock('@/lib/analytics/track', () => ({ trackEvent: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { trackEvent } from '@/lib/analytics/track';
import { signedUpKey } from '@/lib/analytics/events';
import { GET } from '@/app/auth/callback/route';
import type { NextRequest } from 'next/server';

const mockedCreateClient = createClient as unknown as Mock;
const mockedTrackEvent = trackEvent as unknown as Mock;
const ORIGIN = 'https://app.example.com';

type MockUser = { id: string; created_at: string; app_metadata?: { provider?: string } };

// The handler only reads `request.url`, so a bare object is enough — no need to
// stand up a full NextRequest.
function request(query: string): NextRequest {
  return { url: `${ORIGIN}/auth/callback${query}` } as unknown as NextRequest;
}

// `data` defaults to a null user: the existing redirect-only tests below don't care
// about the signup emission, and a null user (like a genuinely errored exchange)
// keeps the route's `user && …` freshness check false, so no event is emitted and
// nothing crashes on `data.user`.
function exchangeReturns(
  error: { message: string } | null,
  data: { user: MockUser | null } = { user: null },
): void {
  mockedCreateClient.mockResolvedValue({
    auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ data, error }) },
  });
}

// NextResponse.redirect encodes the absolute URL in the Location header; assert on
// the path + query only.
function location(res: Response): string {
  const loc = res.headers.get('location');
  if (!loc) throw new Error('expected a Location header');
  const url = new URL(loc);
  return url.pathname + url.search;
}

describe('auth/callback GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('exchanges a valid code and redirects to the sanitised next', async () => {
    exchangeReturns(null);
    const res = await GET(request('?code=abc&next=%2Fboards'));
    expect(location(res)).toBe('/boards');
  });

  it('routes a failed recovery-link exchange to the link-error page, not login', async () => {
    // The cross-device reset trap: the PKCE verifier lives in the requesting browser,
    // so opening the email elsewhere fails the exchange. Those users must reach a page
    // that offers a fresh link, not a dead-end sign-in screen.
    exchangeReturns({ message: 'code verifier missing' });
    const res = await GET(request('?code=abc&next=%2Freset-password'));
    expect(location(res)).toBe('/auth-code-error');
  });

  it('routes a failed non-recovery exchange (e.g. OAuth) to login', async () => {
    exchangeReturns({ message: 'invalid code' });
    const res = await GET(request('?code=abc&next=%2Fboards'));
    expect(location(res)).toBe('/login?error=auth_callback_failed');
  });

  it('forwards both error_code and error to the link-error page when there is no code', async () => {
    const res = await GET(request('?error=access_denied&error_code=otp_expired'));
    expect(location(res)).toBe('/auth-code-error?error_code=otp_expired&error=access_denied');
    // No code means no exchange attempt.
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it('falls back to login for a bare callback with neither code nor error', async () => {
    const res = await GET(request(''));
    expect(location(res)).toBe('/login?error=auth_callback_failed');
  });

  it('emits signed_up for a freshly created GitHub user, deriving fromInvite as a boolean', async () => {
    exchangeReturns(null, {
      user: {
        id: 'user-1',
        created_at: new Date().toISOString(),
        app_metadata: { provider: 'github' },
      },
    });
    const res = await GET(request('?code=abc&next=%2Fjoin%2Fsecret-token'));

    expect(location(res)).toBe('/join/secret-token');
    expect(mockedTrackEvent).toHaveBeenCalledWith({
      name: 'signed_up',
      userId: 'user-1',
      boardId: null,
      dedupeKey: signedUpKey('user-1'),
      properties: { method: 'github', fromInvite: true },
    });
    // A boolean, never the path — the token must not reach the events table.
    expect(JSON.stringify(mockedTrackEvent.mock.calls)).not.toContain('secret-token');
  });

  it('derives method=password for a non-GitHub provider (email confirmation links)', async () => {
    exchangeReturns(null, {
      user: {
        id: 'user-2',
        created_at: new Date().toISOString(),
        app_metadata: { provider: 'email' },
      },
    });
    await GET(request('?code=abc&next=%2Fboards'));

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ properties: { method: 'password', fromInvite: false } }),
    );
  });

  it('does not emit for a returning sign-in outside the freshness window', async () => {
    exchangeReturns(null, {
      user: {
        id: 'user-3',
        created_at: new Date(Date.now() - 120_000).toISOString(),
        app_metadata: { provider: 'github' },
      },
    });
    await GET(request('?code=abc&next=%2Fboards'));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('fails closed on an unparseable created_at — no event, no throw', async () => {
    // `new Date('not-a-date').getTime()` is NaN, and `Date.now() - NaN < 60_000`
    // is false, so the freshness gate skips the emission rather than misfiring.
    // The redirect must still happen: a malformed timestamp from the auth server
    // is not a reason to fail a sign-in that actually succeeded.
    exchangeReturns(null, {
      user: {
        id: 'user-4',
        created_at: 'not-a-date',
        app_metadata: { provider: 'github' },
      },
    });

    const res = await GET(request('?code=abc&next=%2Fboards'));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/boards');
  });

  it('fails closed when created_at is missing entirely', async () => {
    exchangeReturns(null, {
      user: { id: 'user-5', app_metadata: { provider: 'github' } } as unknown as MockUser,
    });

    const res = await GET(request('?code=abc&next=%2Fboards'));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/boards');
  });
});
