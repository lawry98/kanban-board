import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/redirects';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }

    // Log server-side only; the raw provider error can disclose token details.
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
