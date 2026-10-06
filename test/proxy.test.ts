import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// `proxy` only needs `updateSession`'s `{ response, user }` result — mock it so no
// real Supabase SSR client, cookies, or network round-trip is involved, matching the
// mocking style used for `createClient` in `test/auth-callback-route.test.ts`.
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }));
// `proxy` reads the Supabase origin from validated env to build the CSP; the real
// `@/lib/env` throws on import without the full environment.
vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));

import { CSP_HEADER } from '@/lib/csp';
import { updateSession } from '@/lib/supabase/middleware';
import { proxy } from '@/proxy';

import type { User } from '@supabase/supabase-js';

const mockedUpdateSession = updateSession as unknown as Mock;

const ORIGIN = 'https://app.example.com';

function request(pathname: string, method: 'GET' | 'HEAD' | 'POST' = 'GET'): NextRequest {
  return new NextRequest(new URL(pathname, ORIGIN), { method });
}

/** The exact response `updateSession` returned, so passthrough can be asserted by identity. */
let passthrough: NextResponse;

function stubSession(user: User | null): void {
  // A plain `NextResponse.next()` is enough — `proxy` only ever reads its cookies
  // via `.getAll()` when building a redirect, same shape `updateSession` returns.
  passthrough = NextResponse.next();
  mockedUpdateSession.mockResolvedValue({ response: passthrough, user });
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
    // Identity, not `not.toBe(307)`: this asserts the request passed through with
    // the very response `updateSession` produced, which a wrong status could not
    // satisfy by accident.
    expect(res).toBe(passthrough);
    expect(res.headers.get('location')).toBeNull();
  });

  // HEAD is a document request too — a browser or crawler issuing HEAD for
  // /register should get the same answer a GET would, not fall through to the page.
  it('redirects a signed-in HEAD to /register to /boards, like GET', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/register', 'HEAD'));
    expect(location(res)).toBe('/boards');
  });

  it('does not redirect a signed-out GET to a public route', async () => {
    stubSession(null);
    for (const path of ['/register', '/login', '/join/some-token']) {
      const res = await proxy(request(path, 'GET'));
      expect(res.headers.get('location')).toBeNull();
    }
  });
});

describe('content security policy', () => {
  const CSP_NAMES = new Set(['content-security-policy', 'content-security-policy-report-only']);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function nonceIn(csp: string): string {
    const match = /'nonce-([^']+)'/.exec(csp);
    if (!match) throw new Error('expected a nonce in the CSP');
    return match[1];
  }

  /** The request headers `proxy` handed to `updateSession` as its second argument. */
  function forwardedHeaders(): Headers {
    const headers = mockedUpdateSession.mock.calls[0][1];
    expect(headers).toBeInstanceOf(Headers);
    return headers as Headers;
  }

  it('sets a nonce + strict-dynamic policy on a passthrough response', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/boards'));
    const csp = res.headers.get(CSP_HEADER);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(res).toBe(passthrough);
  });

  it('forwards the same nonce and policy to the render as request headers', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/boards'));
    const csp = res.headers.get(CSP_HEADER) ?? '';
    const forwarded = forwardedHeaders();
    expect(forwarded.get('x-nonce')).toBe(nonceIn(csp));
    expect(forwarded.get(CSP_HEADER)).toBe(csp);
  });

  it('sets the policy on a redirect too', async () => {
    stubSession(null);
    const res = await proxy(request('/boards', 'GET'));
    expect(location(res)).toBe('/login');
    expect(res.headers.get(CSP_HEADER)).toContain("'strict-dynamic'");
  });

  it('uses a different nonce for every request', async () => {
    stubSession(FAKE_USER);
    const first = await proxy(request('/boards'));
    stubSession(FAKE_USER);
    const second = await proxy(request('/boards'));
    expect(nonceIn(first.headers.get(CSP_HEADER) ?? '')).not.toBe(
      nonceIn(second.headers.get(CSP_HEADER) ?? ''),
    );
  });

  it('overwrites a client-supplied x-nonce header', async () => {
    stubSession(FAKE_USER);
    const req = new NextRequest(new URL('/boards', ORIGIN), { headers: { 'x-nonce': 'attacker' } });
    const res = await proxy(req);
    const forwarded = forwardedHeaders();
    expect(forwarded.get('x-nonce')).not.toBe('attacker');
    expect(forwarded.get('x-nonce')).toBe(nonceIn(res.headers.get(CSP_HEADER) ?? ''));
  });

  it('sets the policy on the signed-in bounce off an auth route', async () => {
    stubSession(FAKE_USER);
    const res = await proxy(request('/register', 'GET'));
    expect(location(res)).toBe('/boards');
    expect(res.headers.get(CSP_HEADER)).toContain("'strict-dynamic'");
  });

  // Next takes the nonce from `content-security-policy || content-security-policy-report-only`
  // on the request, so a client-sent header of either name must never reach it.
  it('drops client-sent CSP request headers so only the server policy is forwarded', async () => {
    stubSession(FAKE_USER);
    const req = new NextRequest(new URL('/boards', ORIGIN), {
      headers: {
        'content-security-policy': "script-src 'nonce-attacker'",
        'content-security-policy-report-only': "script-src 'nonce-attacker'",
      },
    });
    const res = await proxy(req);
    const csp = res.headers.get(CSP_HEADER) ?? '';
    const forwarded = forwardedHeaders();

    const forwardedPolicy = forwarded.get(CSP_HEADER) ?? '';
    expect(forwardedPolicy).toBe(csp);
    expect(forwardedPolicy).not.toContain('attacker');
    expect(nonceIn(forwardedPolicy)).toBe(forwarded.get('x-nonce'));

    // The header name that is not in use must be absent, not left as the client's value.
    const unused = [...CSP_NAMES].find((name) => name !== CSP_HEADER.toLowerCase());
    expect(forwarded.get(unused ?? '')).toBeNull();
  });
});
