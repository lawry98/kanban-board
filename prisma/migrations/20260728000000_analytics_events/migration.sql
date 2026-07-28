-- ============================================================================
-- PRODUCT ANALYTICS: FIRST-PARTY EVENT TABLE
-- ============================================================================
--
-- A dedicated event store for activation and collaboration metrics. It is NOT
-- `activity_logs` and does not touch it. Four reasons (see the design spec):
--   1. activity_logs.board_id is NOT NULL — signed_up / daily_active / an
--      anonymous invite-link view have no board and are unrepresentable there.
--   2. Its board FK is ON DELETE CASCADE — deleting a board would erase the
--      churned cohort's activation history, biasing every cohort toward users
--      who never churned. Board deletion is a shipped user-facing feature.
--   3. `Action` is a Postgres enum — every new event type would need the
--      non-transactional ALTER TYPE ... ADD VALUE dance.
--   4. activity_logs is product surface, rendered by activity-feed.tsx.
--
-- RLS/Realtime posture matches the `invitations` precedent: this table is NOT
-- published to `supabase_realtime` and gets NO RLS policy of its own. Prisma
-- (which connects as the `postgres` owner, BYPASSRLS) is the only reader and
-- writer, so no GRANT SELECT to `authenticated` is required either.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT,
    -- Intentionally NOT a foreign key: an FK would cascade on board deletion.
    "board_id" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
-- Idempotency handle for once-per-period events (signed_up:<uid>,
-- daily_active:<uid>:<YYYY-MM-DD>). NULL for ordinary events, and Postgres
-- treats NULLs as distinct here, so one unique column serves both cases
-- without a partial index. Writes use createMany({ skipDuplicates: true }).
CREATE UNIQUE INDEX "analytics_events_dedupe_key_key" ON "analytics_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "analytics_events"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_occurred_at_idx" ON "analytics_events"("user_id", "occurred_at");

-- ----------------------------------------------------------------------------
-- 3. Foreign key
-- ----------------------------------------------------------------------------
-- SET NULL, not CASCADE: an account erasure removes the profile and leaves the
-- events intact but unattributable, so historical cohort counts stay correct.
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
