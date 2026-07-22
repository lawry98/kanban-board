-- ============================================================================
-- REALTIME AUTHORIZATION: SELECT GRANTS ON PUBLISHED TABLES
-- ============================================================================
--
-- Supabase Realtime authorizes each `postgres_changes` event by running a SELECT
-- as the *subscriber's* role (`authenticated`) under RLS. These tables were
-- created by Prisma as the `postgres` owner, which never granted DML to the
-- Supabase roles — so `authenticated` had NO SELECT privilege on them. The
-- realtime authorizer could therefore read zero rows and delivered NO events:
-- writes committed fine (Prisma connects as the table owner and bypasses grants
-- + RLS), but collaborators saw nothing until a manual refetch.
--
-- Granting SELECT to `authenticated` lets the realtime authorizer evaluate the
-- existing RLS policies. It does NOT widen visibility: RLS stays enabled and
-- every SELECT policy is still gated by public.is_board_member(...), so a member
-- only ever receives events for boards they belong to. The application itself
-- never reads through PostgREST/the Supabase client — all data access is Prisma
-- as `postgres` — so this grant changes nothing about app-layer authorization.
--
-- NOTE for future changes: any table added to the `supabase_realtime` publication
-- must also be granted SELECT to `authenticated` here, or its events won't arrive.
GRANT SELECT ON TABLE public.tasks TO authenticated;
GRANT SELECT ON TABLE public.columns TO authenticated;
GRANT SELECT ON TABLE public.board_members TO authenticated;
