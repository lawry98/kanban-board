'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { ROUTES } from '@/lib/auth/redirects';

const ERROR_ROUTE = ROUTES.authCodeError;

/**
 * When a Supabase auth link (password reset, email confirmation) is invalid or
 * expired, GoTrue redirects back to the app's `site_url` (the home page) with the
 * failure in the URL hash — which only the client can read. The app's own flows all
 * route errors through /auth/callback as query params (handled server-side), so
 * this is the residual net for hash errors landing on `/`; it is mounted on the
 * landing page only, not globally. It forwards the failure to the dedicated error
 * page.
 *
 * In the query string it gates on `error_code` only — which only Supabase link
 * failures carry — so should the landing page (`/`, its only mount point) ever
 * carry the app's own `?error=` param, it won't be mistaken for a link failure. The
 * hash is Supabase-only, so there it also honors a bare `error`.
 */
export function AuthErrorCatcher() {
  const router = useRouter();
  const pathname = usePathname();

  // Deps intentionally omit window.location: auth failures always arrive on a full
  // page load, so the mount run catches them. The pathname guard prevents a re-fire
  // loop after router.replace. Don't add window.location here — it can't change
  // without a navigation, and adding it only invites an accidental loop.
  useEffect(() => {
    if (pathname === ERROR_ROUTE) return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '',
    );
    // Only `error_code` from the query gates this, so a stray `?error=` on the
    // landing page is never mistaken for a link failure. The hash is Supabase-only,
    // so honoring its `error` there too is safe and forwards a fuller picture
    // (e.g. access_denied) to the error page.
    const errorCode = search.get('error_code') ?? hash.get('error_code');
    const error = hash.get('error');
    if (!errorCode && !error) return;

    console.warn('[auth] link error caught client-side:', errorCode ?? error);
    const params = new URLSearchParams();
    if (errorCode) params.set('error_code', errorCode);
    if (error) params.set('error', error);
    router.replace(`${ERROR_ROUTE}?${params.toString()}`);
  }, [pathname, router]);

  return null;
}
