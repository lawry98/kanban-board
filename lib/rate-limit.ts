import { prisma } from '@/lib/prisma';
import { PublicError } from '@/lib/auth/require-access';

interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Per-user fixed windows. `mutation` covers every write action; the others replace it
 * (never add to it) for the actions that hand out or redeem access, or that reveal
 * whether an email has an account.
 */
export const RATE_LIMITS = {
  mutation: { limit: 120, windowSeconds: 60 },
  invitationCreate: { limit: 10, windowSeconds: 60 * 60 },
  invitationAccept: { limit: 10, windowSeconds: 10 * 60 },
  memberAdd: { limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

function formatRetryAfter(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
}

/** A `PublicError`, so `toActionError` passes the message through unchanged. */
export class RateLimitError extends PublicError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many requests, try again in ${formatRetryAfter(retryAfterSeconds)}`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface CounterRow {
  hits: number | bigint;
  retry_after: number | bigint;
}

/**
 * Counts one call against `bucket` for `userId` and throws `RateLimitError` once the
 * window's limit is exceeded. Call it right after the action's auth guard.
 *
 * Fails OPEN: if the counter can't be read or written, the call is allowed and the
 * error logged, so a limiter outage never blocks users. The block decision sits
 * outside the try so fail-open can never swallow a `RateLimitError`.
 *
 * One row per (bucket, user), reset in place when its window lapses: the upsert is
 * atomic (ON CONFLICT locks the row), timing uses the database clock, and the table
 * stays bounded at users × buckets.
 */
export async function enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];

  let row: CounterRow | undefined;
  try {
    const rows = await prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "rate_limits" AS rl ("bucket", "user_id", "hits", "window_start")
      VALUES (${bucket}, ${userId}, 1, now())
      ON CONFLICT ("bucket", "user_id") DO UPDATE SET
        "hits" = CASE
          WHEN rl."window_start" <= now() - make_interval(secs => ${windowSeconds}::int) THEN 1
          ELSE rl."hits" + 1
        END,
        "window_start" = CASE
          WHEN rl."window_start" <= now() - make_interval(secs => ${windowSeconds}::int) THEN now()
          ELSE rl."window_start"
        END
      RETURNING
        "hits",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM
          ("window_start" + make_interval(secs => ${windowSeconds}::int) - now())))::int) AS "retry_after"
    `;
    row = rows[0];
  } catch (error) {
    console.error(`rateLimit(${bucket}) failed open (non-fatal):`, error);
    return;
  }

  const hits = Number(row?.hits);
  if (!Number.isFinite(hits) || hits <= limit) return;
  throw new RateLimitError(Math.max(1, Number(row?.retry_after) || windowSeconds));
}
