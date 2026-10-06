import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// Same approach as test/proxy.test.ts: mock `updateSession` so no Supabase SSR client,
// cookies or network round-trip is involved.
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }));

import { updateSession } from '@/lib/supabase/middleware';
import { proxy } from '@/proxy';

import type { User } from '@supabase/supabase-js';

const mockedUpdateSession = updateSession as unknown as Mock;

const ORIGIN = 'https://app.example.com';
const FAKE_USER = { id: 'user-1', email: 'me@example.com' } as User;
const UNKNOWN_ROUTES = ['/does-not-exist', '/foo/bar'];

/** The exact response `updateSession` returned, so pass-through can be asserted by identity. */
let passthrough: NextResponse;

function stubSession(user: User | null): void {
  passthrough = NextResponse.next();
  mockedUpdateSession.mockResolvedValue({ response: passthrough, user });
}

function get(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, ORIGIN), { method: 'GET' });
}

// The proxy has no list of known routes, so it cannot 404 by itself. For a signed-in user it
// must let an unknown path through, and Next then renders app/not-found.tsx
// (test/not-found-page.test.tsx covers that page's content). Signed out, deny-by-default
// sends the same path to /login before Next ever resolves it.
describe('proxy on an unknown route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(UNKNOWN_ROUTES)('lets a signed-in GET to %s through to Next', async (path) => {
    stubSession(FAKE_USER);

    const res = await proxy(get(path));

    expect(res).toBe(passthrough);
    expect(res.headers.get('location')).toBeNull();
  });

  it.each(UNKNOWN_ROUTES)('redirects a signed-out GET to %s to /login', async (path) => {
    stubSession(null);

    const res = await proxy(get(path));

    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe('/login');
  });
});
