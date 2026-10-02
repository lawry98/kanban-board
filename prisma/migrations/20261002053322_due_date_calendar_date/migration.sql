-- Due dates are calendar days, not instants (see lib/dates.ts).
--
-- Every existing value was written as `new Date('YYYY-MM-DD')` -- UTC midnight -- into a
-- TIMESTAMP (without time zone) column, so the cast keeps exactly the stored day and does
-- not depend on the session TimeZone. It cannot undo drift that already happened: a date
-- the old dialog shifted back a day is kept as stored.
--
-- Rewrites `tasks` under an ACCESS EXCLUSIVE lock (fine at current size). REPLICA IDENTITY
-- FULL, the supabase_realtime publication, RLS policies and grants are unaffected.

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "due_date" SET DATA TYPE DATE USING "due_date"::date;
