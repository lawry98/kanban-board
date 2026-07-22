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
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  const response = NextResponse.next({ request });

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
