import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// The route only needs the Supabase client for the code-exchange path; mock it so
// no real cookie/SSR machinery is pulled in. `sanitizeNext` is left real (pure).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { GET } from '@/app/auth/callback/route';
import type { NextRequest } from 'next/server';

const mockedCreateClient = createClient as unknown as Mock;
const ORIGIN = 'https://app.example.com';

// The handler only reads `request.url`, so a bare object is enough — no need to
// stand up a full NextRequest.
function request(query: string): NextRequest {
  return { url: `${ORIGIN}/auth/callback${query}` } as unknown as NextRequest;
}

function exchangeReturns(error: { message: string } | null): void {
  mockedCreateClient.mockResolvedValue({
    auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error }) },
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
});
