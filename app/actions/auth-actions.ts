'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/auth/require-access';

export async function signOut(): Promise<ActionResult<never>> {
  const supabase = await createClient();

  // `scope: 'global'` revokes every refresh token for the user, not just this session.
  const { error } = await supabase.auth.signOut({ scope: 'global' });

  if (error) {
    // Redirecting anyway would leave valid auth cookies behind: the proxy would then
    // bounce the user straight back to /boards, showing a live session to someone who
    // believes they signed out.
    console.error('signOut error:', error);
    return { error: 'Failed to sign out. Please try again.' };
  }

  redirect('/login');
}
