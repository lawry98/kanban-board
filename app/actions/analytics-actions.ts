'use server';

import { trackEvent } from '@/lib/analytics/track';
import { signedUpKey } from '@/lib/analytics/events';
import { requireAuth, toActionError } from '@/lib/auth/require-access';
import { enforceRateLimit } from '@/lib/rate-limit';
import { trackSignedUpSchema } from '@/lib/validations/analytics';

import type { ActionResult } from '@/lib/auth/require-access';

/**
 * The single client entry point into analytics. Authenticated on purpose:
 * `/register` is a public route, and an unauthenticated write endpoint here would
 * let anyone forge funnel data. The user id comes from the verified session, so a
 * caller cannot attribute an event to someone else.
 *
 * The `signed_up:<userId>` dedupe key makes this safe to race with the OAuth
 * callback's emission — whichever fires first wins, the other is a no-op.
 * Callers ignore the result; it exists only for contract consistency.
 */
export async function trackSignedUp(input: unknown): Promise<ActionResult<true>> {
  try {
    const user = await requireAuth();
    await enforceRateLimit(user.id, 'mutation');
    const { method, fromInvite } = trackSignedUpSchema.parse(input);

    await trackEvent({
      name: 'signed_up',
      userId: user.id,
      boardId: null,
      dedupeKey: signedUpKey(user.id),
      properties: { method, fromInvite },
    });

    return { data: true };
  } catch (error) {
    return toActionError('trackSignedUp', error, 'Failed to record signup');
  }
}
