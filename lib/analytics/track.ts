import { prisma } from '@/lib/prisma';
import type { AnalyticsEventInput } from '@/lib/analytics/events';
import type { Prisma } from '@prisma/client';

/**
 * Server-only: this module imports Prisma, so it must never be pulled into a
 * `'use client'` component. Client code reaches analytics through the single
 * Server Action in `app/actions/analytics-actions.ts`.
 *
 * Copies the `logActivity` contract verbatim — one write, one try/catch,
 * `console.error` on failure, returns void, NEVER throws. Analytics must never
 * fail a mutation the user actually completed. A realistic failure is the FK to
 * `profiles` when a freshly-created OAuth user has no profile row yet.
 *
 * `createMany` (not `create`) because `skipDuplicates` turns a repeated dedupe
 * key into a silent no-op instead of a P2002 we would have to catch and classify.
 */
export async function trackEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    await prisma.analyticsEvent.createMany({
      data: [
        {
          name: event.name,
          userId: event.userId,
          boardId: event.boardId,
          properties: (event.properties ?? {}) satisfies Prisma.InputJsonObject,
          dedupeKey: event.dedupeKey ?? null,
        },
      ],
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('analyticsEvent.createMany failed (non-fatal):', error);
  }
}
