import { after } from 'next/server';

import * as Sentry from '@sentry/nextjs';

/**
 * Call right after `Sentry.capture*` in server code. On serverless the function may freeze once
 * the response is sent, before the SDK's background send completes; `after` keeps it alive until
 * the flush settles. Skipped when Sentry is inert (no client) and outside a request scope
 * (scripts, tests), where `after` throws.
 */
export function flushSentryAfterResponse(): void {
  if (!Sentry.getClient()) return;
  try {
    after(() => Sentry.flush(2000));
  } catch {
    // Not in a request scope — nothing to keep alive.
  }
}
