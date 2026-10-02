-- ============================================================================
-- LOCK DOWN THE SUPABASE DATA API (PostgREST / GraphQL)
-- ============================================================================
--
-- Supabase serves every table in `public` over its Data API to anyone holding
-- the anon key, which ships in the browser bundle. Two things stand between
-- that API and the data: table privileges and RLS. Neither was doing its job:
--
--   * Supabase's default privileges granted `anon` and `authenticated` ALL on
--     every table Prisma created, and no migration revoked them.
--   * `invitations`, `analytics_events` and `_prisma_migrations` had RLS off, so
--     the anon key alone could read and write them. A forged OWNER invitation,
--     accepted through acceptInvitation, made the acceptor owner of any board.
--   * The write policies let signed-in users write directly, skipping Zod and
--     every guard in lib/auth/require-access.ts: editors on tasks and columns,
--     owners on board_members and boards, members on activity_logs, a user on
--     their own profile, and any signed-in user on boards INSERT.
--
-- The app never uses the Data API. All reads and writes are Prisma connecting
-- as `postgres`, the table owner, which neither grants nor RLS affect. The one
-- non-owner reader is Supabase Realtime, which authorizes each postgres_changes
-- event with a SELECT as `authenticated` under RLS (20260722000000).
--
-- End state:
--   anon           no privileges on any table or sequence in public
--   authenticated  SELECT on tasks, columns, board_members only (Realtime),
--                  still filtered row by row by the is_board_member policies
--   every table    RLS enabled; only SELECT policies remain
--   future tables  created by `postgres` (i.e. by later migrations) start with
--                  no anon/authenticated grants
--   invitations    every link outstanding at lockdown is revoked (section 6)
--
-- Ordering: a later migration that publishes a table to supabase_realtime must
-- GRANT SELECT itself. A grant made by a migration that sorts BEFORE this one
-- is revoked here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS on the three tables that never had it
-- ----------------------------------------------------------------------------
-- No policies are added, so every non-owner role is denied every row. Prisma
-- is unaffected: the owner bypasses RLS unless it is FORCEd.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;

-- Guarded: Prisma's shadow-database replay (migrate dev / migrate diff) runs
-- migrations without creating its bookkeeping table, so an unconditional ALTER
-- would make every future shadow replay fail on this file.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Revoke the Supabase default grants on existing objects
-- ----------------------------------------------------------------------------
-- ALL includes TRUNCATE, which RLS never checks. There are no sequences today
-- (ids are TEXT uuids); the sequence revoke covers any added before this runs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Re-grant exactly what Realtime needs: SELECT on the published tables.
GRANT SELECT ON TABLE public.tasks, public.columns, public.board_members TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Stop future tables from inheriting the grants
-- ----------------------------------------------------------------------------
-- Only `postgres`'s defaults can be changed from here. Supabase keeps an
-- identical set FOR ROLE supabase_admin, so a table created as supabase_admin
-- would still be exposed: create tables through migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Drop the write policies
-- ----------------------------------------------------------------------------
-- With no INSERT/UPDATE/DELETE privilege left these can never apply, and
-- keeping them would suggest writes through the Data API are a supported
-- path. Every one of them is covered by a SELECT-only policy on the same
-- table, so Realtime visibility doesn't shrink: a FOR ALL policy also granted
-- SELECT, but only to roles the remaining SELECT policies already admit.
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can create boards" ON boards;
DROP POLICY IF EXISTS "Owners and editors can update boards" ON boards;
DROP POLICY IF EXISTS "Owners can delete boards" ON boards;
DROP POLICY IF EXISTS "Owners can manage board members" ON board_members;
DROP POLICY IF EXISTS "Editors and owners can manage columns" ON columns;
DROP POLICY IF EXISTS "Editors and owners can manage tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON activity_logs;

-- ----------------------------------------------------------------------------
-- 5. Narrow the profiles SELECT policy
-- ----------------------------------------------------------------------------
-- USING (true) let any signed-up user list every email. `authenticated` no
-- longer has SELECT on profiles at all, so this is the second line: if a grant
-- ever comes back, a user still sees only their own row. Co-member names and
-- emails reach the UI through getBoardData (Prisma), never through this.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 6. Revoke every invite link that exists at lockdown time
-- ----------------------------------------------------------------------------
-- Until this migration, anon could INSERT invitations for any board (board and
-- user ids were readable from analytics_events). acceptInvitation now refuses
-- OWNER, but a planted EDITOR row would stay valid. A real link can't be told
-- apart from a planted one, so all are revoked; owners re-create the links
-- they need. This runs in the same migration as the revokes above, so nothing
-- can be planted in between.
UPDATE "invitations" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "revoked_at" IS NULL;
