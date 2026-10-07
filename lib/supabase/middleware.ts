import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/env';

import type { User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export interface SessionResult {
  /** Response carrying any rotated auth cookies. Must be returned (or its cookies copied). */
  response: NextResponse;
  /** Server-verified user, or null when there is no valid session. */
  user: User | null;
}

/**
 * Refreshes the Supabase session for a request and returns the verified user.
 *
 * This performs the ONLY `getUser()` call in the request pipeline. `getUser()`
 * is a network round-trip to the auth server, and with refresh-token rotation
 * two concurrent calls can race on the same single-use refresh token, so the
 * caller must reuse the `user` returned here rather than asking again.
 *
 * `requestHeaders` replaces the headers forwarded to the downstream render; it
 * defaults to the incoming request's own.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers = request.headers,
): Promise<SessionResult> {
  // `requestHeaders` reach Server Components (proxy.ts adds the CSP + nonce here).
  // Must be a Headers instance, or NextResponse.next throws.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the token against the auth server; getSession() only
  // decodes the (client-writable) cookie and must never be used for authorization.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
