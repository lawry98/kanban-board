'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const ERROR_ROUTE = '/auth-code-error';

/**
 * When a Supabase auth link (password reset, email confirmation) is invalid or
 * expired, GoTrue redirects back to the app's `site_url` with the failure in the
 * query string and/or the URL hash — dropping the user on the home page with a
 * cryptic URL and no explanation. This catches that wherever it lands (the hash
 * is only readable client-side) and forwards to the dedicated error page.
 *
 * Gated on `error_code`, which only Supabase link failures carry, so it never
 * hijacks the app's own `?error=` params (e.g. /login?error=auth_callback_failed).
 */
export function AuthErrorCatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === ERROR_ROUTE) return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '',
    );
    const errorCode = search.get('error_code') ?? hash.get('error_code');
    if (!errorCode) return;

    router.replace(`${ERROR_ROUTE}?error_code=${encodeURIComponent(errorCode)}`);
  }, [pathname, router]);

  return null;
}
