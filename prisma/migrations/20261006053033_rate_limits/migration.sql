-- ============================================================================
-- SERVER ACTION RATE LIMITS
-- ============================================================================
--
-- Fixed-window counters for lib/rate-limit.ts. One row per (bucket, user),
-- reset in place when its window lapses, so the table is bounded by
-- users x buckets and needs no pruning.
--
-- Data API posture matches analytics_events: Prisma (the `postgres` owner,
-- BYPASSRLS) is the only reader and writer. RLS on with no policy and no
-- grants is deny-all for anon/authenticated. NOT published to supabase_realtime.
--
-- user_id deliberately has NO foreign key to profiles: an FK violation (e.g. a
-- user acting before their profiles row exists) would make the fail-open
-- limiter silently skip exactly that user.
--
-- window_start is timestamptz (unlike the repo's TIMESTAMP(3) convention) so the
-- window arithmetic against now() is independent of the pooler session TimeZone.
--
-- Idempotent: every statement is safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "rate_limits" (
    "bucket" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket", "user_id")
);

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

-- Explicit, not inherited: on a database where the lockdown migration's default
-- privileges are not in effect, Supabase's defaults would grant this new table
-- to anon/authenticated.
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;
