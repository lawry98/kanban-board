import { prisma } from '@/lib/prisma';
import { EVENT_PROPERTY_KEYS } from '@/lib/analytics/events';
import type { AnalyticsEventInput, AnalyticsEventName } from '@/lib/analytics/events';
import type { Prisma } from '@prisma/client';

/**
 * Dedupe keys this warm instance has already written successfully.
 *
 * Purely an optimisation — the UNIQUE index on `dedupe_key` is what actually
 * guarantees at-most-one row, and a cold instance simply does the write again and
 * Postgres ignores it. What this avoids is a provably redundant round-trip: the
 * dashboard layout is dynamic and re-renders on every `revalidatePath` response,
 * and there are ~20 such call sites across the board/task/column/invitation
 * actions (every task move among them). Without this, each of those mutations
 * costs an extra `INSERT … ON CONFLICT DO NOTHING` on a `max: 1` pool that cannot
 * do anything after the day's first write.
 *
 * Note `Promise.all` with the layout's profile lookup is NOT an alternative: the
 * pool holds a single connection (`lib/prisma.ts`), so concurrent queries
 * serialise on it anyway.
 */
const writtenDedupeKeys = new Set<string>();

/**
 * Bounds memory on a long-lived instance. Keys are per user per UTC day, so this
 * only trips on an instance serving a large number of distinct users; dropping the
 * whole set just means the next write per user goes to the database again.
 */
const MAX_REMEMBERED_KEYS = 10_000;

/** Test-only: module state does not reset between tests in the same file. */
export function clearDedupeMemoForTests(): void {
  writtenDedupeKeys.clear();
}

/**
 * Strips every key not on the allowlist for this event type. See
 * `EVENT_PROPERTY_KEYS` for why the compile-time union is not sufficient on its own.
 */
function pickAllowedProperties(
  name: AnalyticsEventName,
  properties: Record<string, unknown> | undefined,
): Prisma.InputJsonObject {
  if (!properties) return {};

  const allowed = EVENT_PROPERTY_KEYS[name] as readonly string[] | undefined;
  if (!allowed) return {};

  const picked: Record<string, Prisma.InputJsonValue> = {};
  for (const key of allowed) {
    const value = properties[key];
    if (value !== undefined) picked[key] = value as Prisma.InputJsonValue;
  }
  return picked;
}

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
 *
 * The ENTIRE body sits inside the try on purpose: a caller that reaches this with
 * a malformed event must still not throw, so property access is guarded too.
 */
export async function trackEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    const dedupeKey = event.dedupeKey ?? null;
    if (dedupeKey !== null && writtenDedupeKeys.has(dedupeKey)) return;

    await prisma.analyticsEvent.createMany({
      data: [
        {
          name: event.name,
          userId: event.userId,
          boardId: event.boardId,
          properties: pickAllowedProperties(event.name, event.properties),
          dedupeKey,
        },
      ],
      skipDuplicates: true,
    });

    // Only after a successful write — remembering a failed one would silently
    // drop this user's event for the rest of the instance's life.
    if (dedupeKey !== null) {
      if (writtenDedupeKeys.size >= MAX_REMEMBERED_KEYS) writtenDedupeKeys.clear();
      writtenDedupeKeys.add(dedupeKey);
    }
  } catch (error) {
    console.error('analyticsEvent.createMany failed (non-fatal):', error);
  }
}
