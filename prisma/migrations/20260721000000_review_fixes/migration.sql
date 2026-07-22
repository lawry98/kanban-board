-- ============================================================================
-- REVIEW FIXES MIGRATION
-- ============================================================================
--
-- RLS POSTURE (team decision — read before assuming a database-level backstop):
--
--   Row Level Security is enabled and its policies are fixed here so that
--   Supabase Realtime (postgres_changes) can authorize per-subscriber reads.
--   That is the ONLY thing RLS does for this application.
--
--   RLS does NOT protect application data. Prisma connects over DATABASE_URL as
--   the `postgres` role, which OWNS these tables and has BYPASSRLS. Every query
--   issued by a Server Action or Server Component therefore bypasses every
--   policy below.
--
--   All real authorization is enforced in application code, in the server
--   actions, via `lib/auth/require-access.ts`. If you add a new server action,
--   you MUST call the access check yourself — the database will not stop you.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum additions
-- ----------------------------------------------------------------------------
-- IMPORTANT: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on
-- PostgreSQL < 12 (and still cannot be used in the same transaction that later
-- references the new value). These statements MUST be first in this file and
-- MUST NOT be wrapped in BEGIN/COMMIT. Prisma runs migration files
-- statement-by-statement outside an explicit transaction, which is why they are
-- safe here — do not add a transaction wrapper to this file.
--
-- Without these, createBoard() logs board lifecycle events as COLUMN_CREATED.
ALTER TYPE "Action" ADD VALUE IF NOT EXISTS 'BOARD_CREATED';
ALTER TYPE "Action" ADD VALUE IF NOT EXISTS 'BOARD_UPDATED';
ALTER TYPE "Action" ADD VALUE IF NOT EXISTS 'BOARD_DELETED';

-- ----------------------------------------------------------------------------
-- 2. Fractional positions
-- ----------------------------------------------------------------------------
-- Moving a task becomes a single-row UPDATE setting position to the midpoint
-- between its two new neighbours, instead of renumbering every sibling row.
-- Existing dense integer values convert losslessly to DOUBLE PRECISION.
ALTER TABLE "tasks" ALTER COLUMN "position" TYPE DOUBLE PRECISION;
ALTER TABLE "columns" ALTER COLUMN "position" TYPE DOUBLE PRECISION;

-- ----------------------------------------------------------------------------
-- 3. REPLICA IDENTITY FULL on realtime-published tables
-- ----------------------------------------------------------------------------
-- Supabase postgres_changes DELETE payloads contain ONLY the columns covered by
-- the table's replica identity. With the default (primary key) identity a
-- DELETE payload carries just `id`. The client subscribes with the filter
-- `board_id=eq.<id>`; because board_id is absent from the payload the filter can
-- never match, so every DELETE event is silently dropped and deleted cards
-- remain on collaborators' screens until a full refetch. FULL replica identity
-- puts the whole old row in the WAL record so the filter can be evaluated.
ALTER TABLE "tasks" REPLICA IDENTITY FULL;
ALTER TABLE "columns" REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- 4. SECURITY DEFINER membership helpers (fixes 42P17 infinite recursion)
-- ----------------------------------------------------------------------------
-- The previous policy "Owners can manage board members" was defined ON
-- board_members with a USING clause that itself selected FROM board_members.
-- Postgres re-applies board_members' own policies to that subquery, which
-- re-enters the same policy → 42P17 infinite recursion. Since the boards,
-- columns, tasks and activity_logs policies all subquery board_members, the
-- recursion poisons every RLS-evaluated read — including the path Supabase
-- Realtime uses to authorize postgres_changes.
--
-- A SECURITY DEFINER function runs as its owner, so the inner read of
-- board_members is NOT subject to RLS and the recursion is broken. search_path
-- is pinned so the function body cannot be hijacked by a caller-controlled
-- schema (Supabase linter: function_search_path_mutable).

CREATE OR REPLACE FUNCTION public.is_board_member(bid text, min_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members m
    WHERE m.board_id = bid AND m.user_id = auth.uid()::text
      AND (min_roles IS NULL OR m.role::text = ANY(min_roles))
  );
$$;

REVOKE ALL ON FUNCTION public.is_board_member(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_board_member(text, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Recreate every policy that subqueried board_members
-- ----------------------------------------------------------------------------

-- board_members
DROP POLICY IF EXISTS "Owners can manage board members" ON board_members;
CREATE POLICY "Owners can manage board members" ON board_members FOR ALL TO authenticated
  USING (public.is_board_member(board_members.board_id, ARRAY['OWNER']))
  WITH CHECK (public.is_board_member(board_members.board_id, ARRAY['OWNER']));

-- boards
DROP POLICY IF EXISTS "Boards visible to members" ON boards;
CREATE POLICY "Boards visible to members" ON boards FOR SELECT TO authenticated
  USING (public.is_board_member(boards.id));

DROP POLICY IF EXISTS "Owners and editors can update boards" ON boards;
CREATE POLICY "Owners and editors can update boards" ON boards FOR UPDATE TO authenticated
  USING (public.is_board_member(boards.id, ARRAY['OWNER', 'EDITOR']))
  WITH CHECK (public.is_board_member(boards.id, ARRAY['OWNER', 'EDITOR']));

-- Previously missing entirely: without a DELETE policy, RLS denies all deletes.
DROP POLICY IF EXISTS "Owners can delete boards" ON boards;
CREATE POLICY "Owners can delete boards" ON boards FOR DELETE TO authenticated
  USING (public.is_board_member(boards.id, ARRAY['OWNER']));

-- columns
DROP POLICY IF EXISTS "Columns visible to board members" ON columns;
CREATE POLICY "Columns visible to board members" ON columns FOR SELECT TO authenticated
  USING (public.is_board_member(columns.board_id));

DROP POLICY IF EXISTS "Editors and owners can manage columns" ON columns;
CREATE POLICY "Editors and owners can manage columns" ON columns FOR ALL TO authenticated
  USING (public.is_board_member(columns.board_id, ARRAY['OWNER', 'EDITOR']))
  WITH CHECK (public.is_board_member(columns.board_id, ARRAY['OWNER', 'EDITOR']));

-- tasks
DROP POLICY IF EXISTS "Tasks visible to board members" ON tasks;
CREATE POLICY "Tasks visible to board members" ON tasks FOR SELECT TO authenticated
  USING (public.is_board_member(tasks.board_id));

DROP POLICY IF EXISTS "Editors and owners can manage tasks" ON tasks;
CREATE POLICY "Editors and owners can manage tasks" ON tasks FOR ALL TO authenticated
  USING (public.is_board_member(tasks.board_id, ARRAY['OWNER', 'EDITOR']))
  WITH CHECK (public.is_board_member(tasks.board_id, ARRAY['OWNER', 'EDITOR']));

-- activity_logs
DROP POLICY IF EXISTS "Activity logs visible to board members" ON activity_logs;
CREATE POLICY "Activity logs visible to board members" ON activity_logs FOR SELECT TO authenticated
  USING (public.is_board_member(activity_logs.board_id));

-- Previously any authenticated user could forge a log row on any board so long
-- as user_id matched their own uid. Now they must also be a member of the board.
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON activity_logs;
CREATE POLICY "Authenticated users can insert activity logs" ON activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text AND public.is_board_member(activity_logs.board_id));

-- ----------------------------------------------------------------------------
-- 6. Harden handle_new_user()
-- ----------------------------------------------------------------------------
-- The original definition (migration 20260224012055) is SECURITY DEFINER with a
-- mutable search_path — a privilege-escalation vector flagged by the Supabase
-- linter as function_search_path_mutable. It also:
--   * had no ON CONFLICT, so a retried signup raised a unique violation which
--     aborted the whole auth.users INSERT (the trigger runs in that
--     transaction), locking the user out of signing up at all;
--   * dereferenced NEW.email unconditionally, but NEW.email is NULL for phone
--     and anonymous signups while profiles.email is NOT NULL.
-- The old migration is already applied and must not be edited, so the corrected
-- definition is installed here with CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.email, NEW.phone || '@phone.local', NEW.id::text || '@anonymous.local'),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      NEW.phone,
      'User'
    ),
    NEW.raw_user_meta_data ->> 'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Indexes
-- ----------------------------------------------------------------------------

-- boards/page.tsx does boardMember.findMany({ where: { userId } }). The only
-- existing index is UNIQUE(board_id, user_id), whose leading column is board_id,
-- so that lookup sequentially scans board_members today.
CREATE INDEX IF NOT EXISTS "board_members_user_id_idx" ON "board_members"("user_id");

-- The board load filters by parent then ORDER BY position; composite indexes
-- serve both the filter and the sort.
CREATE INDEX IF NOT EXISTS "columns_board_id_position_idx" ON "columns"("board_id", "position");
CREATE INDEX IF NOT EXISTS "tasks_column_id_position_idx" ON "tasks"("column_id", "position");

-- Redundant: subsumed by tasks_column_id_position_idx (same leading column).
DROP INDEX IF EXISTS "tasks_column_id_idx";

-- Unindexed FK referents make ON DELETE cascades seq-scan the child table.
CREATE INDEX IF NOT EXISTS "boards_created_by_idx" ON "boards"("created_by");
CREATE INDEX IF NOT EXISTS "tasks_created_by_idx" ON "tasks"("created_by");
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- ----------------------------------------------------------------------------
-- 8. Cascade-delete safety
-- ----------------------------------------------------------------------------
-- tasks.created_by and activity_logs.user_id cascaded on profile deletion:
-- removing one user destroyed every task they had ever created on OTHER
-- people's boards, and erased the audit trail. Both become nullable with
-- ON DELETE SET NULL so the rows survive as authored-by-deleted-user.
ALTER TABLE "tasks" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_created_by_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activity_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_user_id_fkey";
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
