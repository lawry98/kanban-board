-- ============================================================================
-- COLLABORATION: INVITATIONS + LIVE MEMBERSHIP SYNC
-- ============================================================================
--
-- Adds shareable, revocable invite links (the `invitations` table) and the
-- `MEMBER_ROLE_CHANGED` activity action, and publishes `board_members` to
-- Supabase Realtime so membership changes sync live.
--
-- RLS posture is unchanged: authorization is enforced in application code via
-- `lib/auth/require-access.ts`. Invitations are owner-only and fetched on
-- demand, so the table is NOT published to Realtime and gets no RLS policy of
-- its own — Prisma (BYPASSRLS) is the only reader/writer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum addition
-- ----------------------------------------------------------------------------
-- IMPORTANT: `ALTER TYPE ... ADD VALUE` must be first and must NOT be wrapped in
-- an explicit transaction, and the new value may not be *used* in the same
-- transaction that adds it. Nothing in this migration uses 'MEMBER_ROLE_CHANGED'
-- (it is only referenced later at runtime by changeMemberRole), so this is safe.
-- Matches the pattern established in 20260721000000_review_fixes.
ALTER TYPE "Action" ADD VALUE IF NOT EXISTS 'MEMBER_ROLE_CHANGED';

-- ----------------------------------------------------------------------------
-- 2. Invitations table
-- ----------------------------------------------------------------------------
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "token" TEXT NOT NULL,
    "email" TEXT,
    "invited_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_board_id_idx" ON "invitations"("board_id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Publish board_members to Supabase Realtime
-- ----------------------------------------------------------------------------
-- Membership changes (add / remove / role change) must reach every open client.
-- REPLICA IDENTITY FULL is required so DELETE payloads carry `board_id`; the
-- client subscribes with the filter `board_id=eq.<id>`, and with the default
-- (primary key) identity that column is absent from the DELETE payload, so the
-- filter never matches and removals are silently dropped — the same reasoning
-- applied to tasks/columns in 20260721000000_review_fixes.
--
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
ALTER TABLE "board_members" REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- 4. Co-member visibility for live membership sync
-- ----------------------------------------------------------------------------
-- The existing "Members can view their board memberships" policy authorizes a
-- member to SELECT only their OWN row (user_id = auth.uid()). Realtime authorizes
-- each postgres_changes event against the subscriber's SELECT visibility of the
-- changed row, so under that policy alone a non-owner would receive events only
-- for their own membership — a VIEWER would never see a co-member added, removed,
-- or re-roled live. This adds an OR'd permissive SELECT policy letting any member
-- see every membership row on boards they belong to, so add/remove/role-change
-- events reach all roles.
--
-- No new disclosure: getBoardData already returns the full member list to every
-- member, and RLS governs only Realtime here (Prisma connects with BYPASSRLS).
-- Uses the SECURITY DEFINER helper from review_fixes, so no policy recursion.
DROP POLICY IF EXISTS "Members can view co-members" ON board_members;
CREATE POLICY "Members can view co-members" ON board_members FOR SELECT TO authenticated
  USING (public.is_board_member(board_members.board_id));
