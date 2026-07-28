-- ============================================================================
-- KANBANFLOW — ACTIVATION & COLLABORATION FUNNEL
-- ============================================================================
-- Paste into the Supabase SQL editor. Monthly is a fine cadence.
--
-- Checked into the repo on purpose: these queries are the deliverable, not the
-- emitters. Keeping them here means they get reviewed and updated in the same
-- commit as a schema change, instead of rotting in a browser tab.
--
-- READ THIS FIRST — three honest caveats that apply throughout:
--   * `analytics_events` only covers the INSTRUMENTED ERA (from the day this
--     shipped). `profiles`/`boards`/`tasks`/`invitations` cover all of history.
--     Never divide an event count by an all-time table count.
--   * Queries 1, 2 and the first half of 5 read only domain tables, so they
--     return real answers immediately, before any event has been recorded.
--   * Board deletion CASCADES `invitations`, `board_members`, `columns` and
--     `tasks` (see schema.prisma) — those rows are gone once a board is
--     deleted. `analytics_events` rows have no FK to `board_id` and survive
--     the same deletion BY DESIGN: preserving the churned cohort's activation
--     history is the whole reason this table exists instead of reusing
--     `activity_logs`. That asymmetry is deliberate, but it means any query
--     that puts a surviving event count on one side and a cascading domain
--     count on the other under-reports the domain side — never treat the two
--     as the same population.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Signups over time
--    Q: are we getting more signups week over week?
--    Source: profiles.created_at (written server-side by the handle_new_user
--    trigger on auth.users). Works over all history.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week,
  count(*)                                                AS signups
FROM profiles
GROUP BY 1
ORDER BY 1;


-- ----------------------------------------------------------------------------
-- 2. Activation funnel
--    Q: of everyone who signed up, how many created a board, and of those, how
--       many created a task? How long did each step take?
--    No instrumentation needed — every step is already timestamped.
--    CAVEAT: if email confirmations are ever turned on, unconfirmed users still
--    appear here as a profiles row with no board and no task. That is honest,
--    but it moves the top of the funnel.
--    CAVEAT: `created_a_task` counts "signed up AND created a task on ANY board",
--    including a board someone else owns (an EDITOR/VIEWER collaborator counts
--    here even if they never created their own board). It is NOT nested under
--    `created_a_board`. `pct_of_board_creators_who_made_a_task` IS the true
--    nested rate — its numerator is restricted to users who both created a board
--    and created a task — so read that percentage, not created_a_task, as "of
--    those [board creators], how many created a task".
--    CAVEAT: board deletion cascades `boards`/`tasks`, so a user whose board was
--    later deleted loses their `created_a_board`/`created_a_task` rows here even
--    though their `profiles` row survives — this biases `pct_reached_board` and
--    the nested rate downward. See the board-deletion caveat in the file header.
-- ----------------------------------------------------------------------------
WITH first_board AS (
  SELECT created_by AS user_id, min(created_at) AS at FROM boards GROUP BY 1
),
first_task AS (
  SELECT created_by AS user_id, min(created_at) AS at FROM tasks GROUP BY 1
)
SELECT
  count(*)                                                             AS signed_up,
  count(b.at)                                                          AS created_a_board,
  count(t.at)                                                          AS created_a_task,
  round(100.0 * count(b.at) / nullif(count(*), 0), 1)                  AS pct_reached_board,
  round(100.0 * count(*) FILTER (WHERE b.at IS NOT NULL AND t.at IS NOT NULL)
        / nullif(count(b.at), 0), 1)                                  AS pct_of_board_creators_who_made_a_task,
  round(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM b.at - p.created_at) / 60)::numeric, 1) AS median_minutes_to_first_board,
  round(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM t.at - p.created_at) / 60)::numeric, 1) AS median_minutes_to_first_task
FROM profiles p
LEFT JOIN first_board b ON b.user_id = p.id
LEFT JOIN first_task  t ON t.user_id = p.id;


-- ----------------------------------------------------------------------------
-- 3. Signup method split (password vs GitHub)
--    Q: how are people creating accounts, and how many arrive via an invite?
--    Only answerable from events. `profiles_in_window` is the honest denominator:
--    comparing `signed_up` events to all-time `profiles` would understate coverage
--    by exactly the pre-instrumentation history.
-- ----------------------------------------------------------------------------
WITH window_start AS (
  SELECT min(occurred_at) AS since FROM analytics_events WHERE name = 'signed_up'
)
SELECT
  (SELECT since FROM window_start)                                    AS instrumented_since,
  (SELECT count(*) FROM profiles)                                     AS profiles_all_time,
  (SELECT count(*) FROM profiles, window_start
     WHERE profiles.created_at >= window_start.since)                 AS profiles_in_window,
  e.properties ->> 'method'                                           AS method,
  count(*)                                                            AS signup_events,
  count(*) FILTER (WHERE (e.properties ->> 'fromInvite')::boolean)    AS of_which_from_an_invite
FROM analytics_events e
WHERE e.name = 'signed_up'
GROUP BY e.properties ->> 'method'
ORDER BY signup_events DESC;


-- ----------------------------------------------------------------------------
-- 4. Invite funnel: created -> opened -> accepted
--    CAVEAT ON `link_opens`: `invite_link_opened` fires during a server-component
--    render, so RSC prefetches and link-preview bots (Slack, iMessage, mail
--    clients) inflate it. It is a DIRECTIONAL DENOMINATOR, NEVER A HEADCOUNT.
--    Watch the trend, not the absolute rate. Making it exact would need a
--    dedicated route handler or a client beacon — deliberately not built.
--    `links_created_all_time` counts `invitations`, which CASCADES on board
--    deletion. `links_created_in_window` counts `invite_link_created` events
--    instead, which survive board deletion just like `opened`/`accepted` do —
--    that's the pair to use for any created-to-accepted rate. The two counts
--    are labelled distinctly on purpose so a reader can't mistake the
--    cascading all-time figure for the survives-deletion windowed one.
-- ----------------------------------------------------------------------------
WITH created_all_time AS (
  SELECT count(*) AS n FROM invitations
),
created_in_window AS (
  SELECT count(*) AS n FROM analytics_events WHERE name = 'invite_link_created'
),
opened AS (
  SELECT
    count(*)                                                              AS n,
    count(*) FILTER (WHERE properties ->> 'linkState'   = 'active')       AS on_a_live_link,
    count(*) FILTER (WHERE properties ->> 'linkState'   = 'invalid')      AS on_a_dead_link,
    count(*) FILTER (WHERE properties ->> 'viewerState' = 'anonymous')    AS by_logged_out_visitors
  FROM analytics_events WHERE name = 'invite_link_opened'
),
accepted AS (
  SELECT
    count(*) AS n,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY (properties ->> 'secondsSinceLinkCreated')::numeric) AS median_seconds
  FROM analytics_events WHERE name = 'invite_accepted'
)
SELECT
  created_all_time.n                                            AS links_created_all_time,
  created_in_window.n                                           AS links_created_in_window,
  opened.n                                                      AS link_opens_directional,
  opened.on_a_live_link,
  opened.on_a_dead_link,
  opened.by_logged_out_visitors,
  accepted.n                                                    AS accepts,
  round(100.0 * accepted.n / nullif(created_in_window.n, 0), 1) AS pct_accept_per_link_created_in_window,
  round(100.0 * accepted.n / nullif(opened.on_a_live_link, 0), 1) AS pct_accept_per_live_link_open,
  round(accepted.median_seconds::numeric, 0)                    AS median_seconds_from_link_to_accept
FROM created_all_time, created_in_window, opened, accepted;


-- ----------------------------------------------------------------------------
-- 5a. Collaboration rate (all history, no instrumentation needed)
--     Q: what share of boards actually has more than one person on it?
-- ----------------------------------------------------------------------------
SELECT
  count(*)                                                                    AS boards_total,
  count(*) FILTER (WHERE members >= 2)                                        AS boards_with_collaborators,
  round(100.0 * count(*) FILTER (WHERE members >= 2) / nullif(count(*), 0), 1) AS pct_collaborative
FROM (SELECT board_id, count(*) AS members FROM board_members GROUP BY 1) m;


-- ----------------------------------------------------------------------------
-- 5b. Acquisition path split for collaborators
--     Q: do people join via an invite link, or does an owner add them by email?
--     Before `invite_accepted` existed the two paths wrote byte-identical
--     MEMBER_ADDED activity rows, so this is only answerable for the
--     instrumented era — hence the window filter on both sides.
-- ----------------------------------------------------------------------------
WITH window_start AS (
  SELECT min(occurred_at) AS since FROM analytics_events WHERE name = 'invite_accepted'
),
counts AS (
  SELECT
    (SELECT count(*) FROM analytics_events WHERE name = 'invite_accepted')  AS joined_via_link,
    (SELECT count(*) FROM board_members bm, window_start
       WHERE bm.role <> 'OWNER' AND bm.joined_at >= window_start.since)     AS non_owner_memberships_in_window
)
SELECT
  (SELECT since FROM window_start)                                          AS instrumented_since,
  joined_via_link,
  non_owner_memberships_in_window,
  -- Floored at 0 — see the trailing comment for why the raw subtraction can
  -- go negative and why this is a directional approximation, not an identity.
  greatest(0, non_owner_memberships_in_window - joined_via_link)            AS owner_added_by_email_approx
FROM counts;
-- `owner_added_by_email_approx` approximates owner add-by-email. It is an
-- approximation, not an identity, for two independent reasons:
--   1. A member who left and rejoined counts once in `board_members` (current
--      membership only) but twice in the events (once per accept).
--   2. Board deletion CASCADES `board_members` but not `analytics_events` (see
--      the file header): a user who accepted an invite to a board that was
--      later deleted still has their `invite_accepted` event, but their
--      membership row is gone — which alone can push the raw subtraction
--      negative even with zero rejoins. `greatest(0, ...)` floors that case
--      rather than reporting a nonsensical negative headcount.


-- ----------------------------------------------------------------------------
-- 6. Retention cohorts (D1 / D7 / D30), grouped by signup week
--    Q: do people come back?
--    The ONLY source is `daily_active`, which cannot be backfilled — this query
--    returns nothing useful until 30 days after instrumentation shipped.
--    "D7" here means "was active on exactly the 7th day after signup", which is
--    strict. For "active at all in the first week", swap `= signup_day + 7` for
--    `BETWEEN signup_day + 1 AND signup_day + 7`.
-- ----------------------------------------------------------------------------
WITH cohort AS (
  SELECT id AS user_id,
         date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS signup_week,
         (created_at AT TIME ZONE 'UTC')::date                  AS signup_day
  FROM profiles
),
active AS (
  SELECT user_id, (occurred_at AT TIME ZONE 'UTC')::date AS day
  FROM analytics_events
  WHERE name = 'daily_active' AND user_id IS NOT NULL
)
SELECT
  c.signup_week,
  count(DISTINCT c.user_id)                                                  AS cohort_size,
  count(DISTINCT c.user_id) FILTER (WHERE a.day = c.signup_day + 1)          AS d1,
  count(DISTINCT c.user_id) FILTER (WHERE a.day = c.signup_day + 7)          AS d7,
  count(DISTINCT c.user_id) FILTER (WHERE a.day = c.signup_day + 30)         AS d30
FROM cohort c
LEFT JOIN active a ON a.user_id = c.user_id
GROUP BY 1
ORDER BY 1;
