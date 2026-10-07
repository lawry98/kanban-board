-- Publish `boards` to Realtime so a rename reaches every viewer live.
--
-- Realtime authorizes each postgres_changes event by SELECTing the row as the
-- subscriber (`authenticated`) under RLS, so a published table needs all of:
--   * membership of the supabase_realtime publication,
--   * REPLICA IDENTITY FULL (DELETE payloads carry the filtered column; matches
--     tasks / columns / board_members),
--   * GRANT SELECT to authenticated — this sorts after
--     20261002053019_lock_down_data_api, which revoked every earlier grant,
--   * a SELECT policy gated by is_board_member (re-asserted, unchanged).
-- Nothing is granted to anon. Writes stay in Server Actions: no write grant or
-- write policy is added.
--
-- Idempotent: safe to re-run.

ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boards" REPLICA IDENTITY FULL;

-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'boards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boards;
  END IF;
END $$;

GRANT SELECT ON TABLE public.boards TO authenticated;

DROP POLICY IF EXISTS "Boards visible to members" ON boards;
CREATE POLICY "Boards visible to members" ON boards FOR SELECT TO authenticated
  USING (public.is_board_member(boards.id));
