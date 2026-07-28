import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// `proxy` only needs `updateSession`'s `{ response, user }` result — mock it so no
// real Supabase SSR client, cookies, or network round-trip is involved, matching the
// mocking style used for `createClient` in `test/auth-callback-route.test.ts`.
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }));

import { updateSession } from '@/lib/supabase/middleware';
import { proxy } from '@/proxy';

import type { User } from '@supabase/supabase-js';

const mockedUpdateSession = updateSession as unknown as Mock;

const ORIGIN = 'https://app.example.com';

function request(pathname: string, method: 'GET' | 'POST' = 'GET'): NextRequest {
  return new NextRequest(new URL(pathname, ORIGIN), { method });
}

function stubSession(user: User | null): void {
  mockedUpdateSession.mockResolvedValue({
    // A plain `NextResponse.next()` is enough — `proxy` only ever reads its cookies
    // via `.getAll()` when building a redirect, same shape `updateSession` returns.
    response: NextResponse.next(),
    user,
  });
}

function location(res: Response): string {
  const loc = res.headers.get('location');
  if (!loc) throw new Error('expected a Location header');
  const url = new URL(loc);
  return url.pathname + url.search;
}

const FAKE_USER = { id: 'user-1', email: 'me@example.com' } as User;

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a signed-out GET to a protected route to /login', async () => {
    stubSession(null);
    const res = await proxy(request('/boards', 'GET'));
    expect(location(res)).toBe('/login');
  });

  // Security-regression guard: the `!user && !isPublicRoute` branch must keep
  // rejecting unauthenticated requests regardless of HTTP method. This must fail
  // if that branch is ever made GET-only.
  it('redirects a signed-out POST to a protected route to /login', async () => {
    stubSession(null);
    const res = await proxy(request('/boards', 'POST'));
    expect(location(res)).toBe('/login');
  });

  it('redirects a signed-in GET to /register to /boards', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/register', 'GET'));
    expect(location(res)).toBe('/boards');
  });

  // The actual fix: a Server Action POSTs to the current URL (e.g. `/register`)
  // carrying the just-set auth cookie. Bouncing that POST to /boards silently
  // drops the action body (the `trackSignedUp` call) before it ever runs.
  it('does not redirect a signed-in POST to /register', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/register', 'POST'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).not.toBe(307);
  });

  it('does not redirect a signed-out GET to a public route', async () => {
    stubSession(null);
    for (const path of ['/register', '/login', '/join/some-token']) {
      const res = await proxy(request(path, 'GET'));
      expect(res.headers.get('location')).toBeNull();
    }
  });
});
