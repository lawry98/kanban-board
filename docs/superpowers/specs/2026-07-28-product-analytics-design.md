# Product Analytics & Activation Instrumentation — Design

**Date:** 2026-07-28
**Status:** Approved for planning
**Branch:** `feat/product-analytics`
**Source:** Recommendation 5 of the product-discovery report

---

## 1. Context

KanbanFlow has **zero telemetry**. A repo-wide search for `posthog`, `segment`, `mixpanel`, `plausible`, `@vercel/analytics`, `sentry`, and `gtag` returns nothing, and `package.json` carries no analytics dependency. Every product decision — including the recently shipped invite links, member management, password reset, and onboarding fixes — is currently made blind.

The goal is to make the activation and collaboration funnel measurable:

> sign-up → first board → first task → invite link created → invite accepted → user returns

### The finding that shapes this design

**Roughly 4.5 of the 6 funnel steps are already reconstructable with SQL, with no instrumentation at all.** The domain tables already timestamp them:

| Funnel step            | Already recorded by                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Signed up              | `profiles.created_at` (written server-side by the `handle_new_user` trigger on `auth.users`) |
| Created a board        | `boards.created_at`, `boards.created_by`                                                     |
| Created a task         | `tasks.created_at`, `tasks.created_by`                                                       |
| Created an invite link | `invitations.created_at`, `invitations.invited_by`, `invitations.revoked_at`                 |
| Became a collaborator  | `board_members.joined_at`                                                                    |

**Four facts are structurally invisible** and are the only justification for new instrumentation:

1. **Return visits.** There is no `last_seen`, no session table, and no pageview anywhere in the app.
2. **Pre-auth activity.** A logged-out visitor opening `/join/<token>` renders `app/join/[token]/page.tsx` as a pure read and leaves no trace, so **invite conversion has no denominator**.
3. **Invite attribution.** `acceptInvitation` (`app/actions/invitation-actions.ts:138-145`) and `addBoardMember` (`app/actions/board-actions.ts`) write byte-identical `MEMBER_ADDED` rows with the same `{ email, role }` metadata, and neither records an invitation id. The two acquisition paths are indistinguishable.
4. **Signup method** (password vs GitHub) and whether the signup came from an invite.

### Situational constraints

- **Pre-launch:** essentially no real users yet. This rules out heavyweight tooling and makes "build analytics nobody reads" the single biggest risk.
- **Solo developer**, Vercel serverless, Prisma pool pinned to `max: 1` (`lib/prisma.ts`).
- **Email confirmations are OFF** (`supabase/config.toml` → `[auth.email] enable_confirmations = false`), so the register success branch that issues a session is the branch that always runs today.
- A nonce-based **CSP is deliberately deferred** (`next.config.ts`) — adding a third-party script now would raise the cost of that future work.

---

## 2. Goals and non-goals

### Goals

- Answer the funnel questions above using data that survives board and account deletion.
- Start recording the four un-backfillable facts **before** real users arrive.
- Add no new runtime dependency, no client SDK, no CSP change, and no consent banner obligation.
- Establish a read ritual that survives — the queries are the deliverable, not just the emitters.

### Non-goals (explicitly deferred)

- **Landing-page → signup attribution.** This is the one question first-party server events cannot answer; it requires an anonymous id, a client script, and a consent decision. Revisit when there is real landing traffic.
- **An in-app analytics dashboard.** There is no admin concept — `Role` is `OWNER`/`EDITOR`/`VIEWER` per board — so this needs an authorization design it does not currently have.
- **Session-level analytics.** No session primitive exists in the app.
- **Instrumenting `board_created` / `task_created`.** Already fully derivable from `boards.created_at` / `tasks.created_at`. Emitting them would be pure duplication.
- **Error-rate telemetry.** `toActionError` is the natural future hook, but it is out of scope here.

---

## 3. Decisions and rationale

### 3.1 Staged: SQL first, then a minimal event layer

Part 1 (SQL) ships immediately with zero schema change and answers most of what is actionable today. Part 2 exists solely because **event data cannot be backfilled** — return visits and invite-link opens are only ever measurable from the day recording starts.

### 3.2 First-party Postgres via Prisma — no third-party provider

Rejected a vendor SDK for three codebase-specific reasons:

1. An autocapturing SDK that records `pathname` would ship `/join/<token>` **invite tokens** and board UUIDs to a third party — precisely what `Referrer-Policy: strict-origin-when-cross-origin` (`next.config.ts`) currently prevents.
2. The deferred nonce-based CSP would have to allow a vendor inline snippet plus a `connect-src` host.
3. The board tree already ships full `Profile` rows **including email** to the browser, so any autocapturing SDK mounted inside it sits in a props graph containing collaborator emails.

Every event fires in server code where the authenticated user — and, where relevant, the board id — has already been resolved by `require*Access` or the session, at no extra cost. A vendor SDK adds nothing there and would need those ids plumbed to the browser anyway. Volume is not an argument for a vendor either: these are low-frequency business events, not pageviews.

### 3.3 A separate `analytics_events` table — **not** `activity_logs`

`activity_logs` looks like an event store but is disqualified on four counts, all verified:

1. **`board_id` is `NOT NULL`** (`prisma/schema.prisma`) — `signed_up`, `daily_active`, and an anonymous invite-link view have no board and are literally unrepresentable.
2. **The FK is `ON DELETE Cascade`** — deleting a board erases its `BOARD_CREATED` and every `TASK_CREATED` beneath it. That destroys the churned cohort's activation history, biasing every cohort toward users who never churned. This is the worst possible bias for an activation metric, and board deletion is now a shipped user-facing feature.
3. **`Action` is a Postgres enum** — every new event type needs a migration using the non-transactional `ALTER TYPE … ADD VALUE` dance, and the value cannot be used in the same migration.
4. **It is product surface.** `components/board/activity-feed.tsx` renders an exhaustive `Record<Action, …>` to users, so a new enum value forces user-facing copy and leaks internal instrumentation into the feed.

`activity_logs` remains untouched as the user-facing audit feed.

### 3.4 Server-side emission, with one controlled exception

Everything that feeds a conversion rate is server-emitted. Client emission is unsafe here for two specific reasons:

- `hooks/use-realtime.ts` re-invokes `getBoardData` on the client's **own** writes, on tab refocus, on `online`, and on every `SUBSCRIBED` reconnect. Any client- or `getBoardData`-derived event is inflated without bound.
- `acceptInvitation` returns `{ data: { boardId } }` identically for a real join, an already-a-member re-click, and a P2002 race. Only the server can tell them apart.

The single exception is `signed_up`, emitted through a thin **authenticated** Server Action — never an unauthenticated write endpoint, since `/register` is a public route.

### 3.5 Ids-only privacy

Store ids and enum-valued properties. **Never** persist: the raw invite token, an email address, a task or board title, a full pathname, an IP, or a user agent.

The codebase already has the right primitive (`PUBLIC_PROFILE_SELECT = { id, fullName, avatarUrl }` in `types/board.ts`, where email was deliberately dropped) and the counter-example to avoid (`activity_logs.metadata` persists raw email addresses, readable by any board member via `getActivityLogs`). No new cookie and no anonymous id means **no consent-banner obligation**.

### 3.6 Read ritual: a checked-in SQL file

`prisma/analytics/funnel.sql`, pasted into the Supabase SQL editor on a cadence (monthly is fine). Checking it into the repo is what makes it survive: the queries get reviewed and updated in the same commit as schema changes. Prisma Studio cannot aggregate and therefore cannot answer a single funnel question.

---

## 4. Data model

One new model. Migration name: `20260728000000_analytics_events`.

```prisma
model AnalyticsEvent {
  id         String   @id @default(uuid())
  /// Free-form by design — NOT a Postgres enum, so adding an event type never
  /// needs a migration. Type safety lives in lib/analytics/events.ts.
  name       String
  /// Nullable + SetNull: an erasure request deletes the profile and leaves the
  /// events intact but unattributable.
  userId     String?  @map("user_id")
  /// Deliberately a plain column with NO foreign key. An FK would cascade on
  /// board deletion and erase the churned cohort's activation history — the
  /// exact population an activation metric exists to study.
  boardId    String?  @map("board_id")
  properties Json     @default("{}")
  /// Idempotency handle for once-per-period events. NULL for ordinary events.
  dedupeKey  String?  @unique @map("dedupe_key")
  occurredAt DateTime @default(now()) @map("occurred_at")

  profile Profile? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([name, occurredAt])
  @@index([userId, occurredAt])
  @@map("analytics_events")
}
```

Add the back-relation `analyticsEvents AnalyticsEvent[]` to `Profile`.

**Realtime and RLS posture:** the table is **not** added to the `supabase_realtime` publication and gets **no RLS policy of its own**, matching the `invitations` precedent — Prisma (which connects as the `postgres` owner with `BYPASSRLS`) is the only reader and writer, so no `GRANT SELECT` is required either.

**Migration procedure:** `pnpm prisma migrate dev` fails against local Supabase with `schema "auth" does not exist` (the known shadow-database issue). Hand-write the migration SQL to match the conventions of the existing migrations and apply it with `pnpm prisma migrate deploy`, then `pnpm prisma generate`.

### `dedupeKey` does double duty

| Event          | Key format                           | Guarantee                                                 |
| -------------- | ------------------------------------ | --------------------------------------------------------- |
| `signed_up`    | `signed_up:<userId>`                 | Exactly one per user, whichever emission path fires first |
| `daily_active` | `daily_active:<userId>:<YYYY-MM-DD>` | At most one per user per UTC day                          |

The date component is the **UTC** calendar date, so the key is deterministic regardless of server region. Writes use `createMany({ data: [...], skipDuplicates: true })`, which never throws on a duplicate.

Ordinary (non-deduped) events leave `dedupeKey` as `NULL`. Postgres treats `NULL`s as distinct in a unique index, so any number of such rows coexist — the single `@unique` column serves both cases without a partial index.

---

## 5. Event taxonomy

Five events. Each one exists only because SQL over the domain tables cannot produce it.

| Event                 | Emitted from                                                                                             | Properties (beyond `userId`/`boardId`)                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `signed_up`           | Server Action from the register success branch **and** `/auth/callback` for newly created users; deduped | `method: 'password' \| 'github'`, `fromInvite: boolean`                                                   |
| `invite_link_created` | `createInvitation`                                                                                       | `role: 'EDITOR' \| 'VIEWER'`, `invitationId`                                                              |
| `invite_link_opened`  | `app/join/[token]/page.tsx` (server component)                                                           | `invitationId \| null`, `linkState: 'active' \| 'invalid'`, `viewerState: 'anonymous' \| 'authenticated'` |
| `invite_accepted`     | `acceptInvitation`, **real-join branch only**                                                            | `invitationId`, `role`, `secondsSinceLinkCreated: number`                                                 |
| `daily_active`        | `app/(dashboard)/layout.tsx`, deduped per UTC day                                                        | —                                                                                                         |

### Emission-site notes

**`signed_up` — two paths, one event.** The password path emits from the register branch where `signUp` already returned a session, calling an authenticated Server Action. GitHub OAuth users never touch that branch — they return through `/auth/callback`, which is therefore the second emission site. To avoid emitting for _returning_ users, the callback compares `data.user.created_at` from the exchange result against now and emits only within a 60-second freshness window; this uses the value already returned by `exchangeCodeForSession` and needs no extra query. The `signed_up:<userId>` dedupe key makes the two paths safe to run together: whichever fires first wins, the other is a no-op.

> `app/auth/callback/route.ts` currently destructures only `{ error }` from `exchangeCodeForSession` and discards `data`. It must capture `data` to read the user.

**`fromInvite`** is derived from the sanitized `next` destination starting with `/join/` — a boolean, never the path itself, so no token is recorded.

**`invite_accepted`** must be emitted only after `boardMember.create` succeeds, alongside the existing `logActivity` call — never on the already-member early return or the P2002 catch.

**`invite_link_opened`** is emitted during a server-component render. This is an accepted, documented tradeoff: RSC prefetches and link-preview bots (Slack, iMessage, email clients) will inflate it. It is a **directional denominator, never a headcount**, and the SQL file says so at the point of use. If it ever needs to be exact, the alternative is a dedicated route handler or a client beacon — deliberately not built now. When the token matches no invitation, the event still fires with `linkState: 'invalid'` and null ids, since a dead-link click is itself a funnel signal.

**`daily_active`** rides the existing `prisma.profile.findUnique` in the dashboard layout — one additional deduped write per user per day.

---

## 6. Module design

### `lib/analytics/events.ts` — the contract (no I/O)

Exports the closed union of event names and a discriminated union of property shapes, so a malformed payload is a **compile error**. This is the direct answer to the drift that already happened in `activity_logs`, where `createBoard` writes `metadata.boardTitle` while `activity-feed.tsx` reads `meta.title` — every board-created entry currently renders as _"created board 'Untitled'"_. That bug is proof an unenforced JSON shape rots silently.

Also exports the `dedupeKey` builders (`signedUpKey`, `dailyActiveKey`) so the format lives in exactly one place and can be unit-tested.

### `lib/analytics/track.ts` — the emitter (server-only)

Imports Prisma, so it must **never** be imported into a `'use client'` component.

`trackEvent(event)` copies the `logActivity` contract verbatim: a single `try/catch` around one write, `console.error` on failure, returns `void`, and **never throws**. Analytics must never fail a mutation the user actually completed.

### `app/actions/analytics-actions.ts` — the one client entry point

A single `trackSignedUp(input: unknown)` Server Action: `requireAuth()` first, `.parse()` the input with a Zod schema in `lib/validations/analytics.ts`, then delegate to `trackEvent`. It returns `ActionResult<true>` for consistency, and callers ignore the result.

---

## 7. The SQL read layer

`prisma/analytics/funnel.sql` — named, commented queries, each headed by what question it answers and any caveat:

1. **Signups over time** — weekly counts from `profiles.created_at`.
2. **Activation funnel** — of users who signed up, how many created a board, and of those, how many created a task; with median time-to-first-board and time-to-first-task.
3. **Signup method split** — total signups (`profiles`) versus `signed_up` events by `method`. Because the events table only covers the instrumented era, the query reports the instrumented window explicitly rather than implying full history.
4. **Invite funnel** — links created → links opened (directional; bot caveat stated inline) → accepted, with accept rate and median time-to-accept.
5. **Collaboration rate** — share of boards with two or more members, and the split between link accepts and owner add-by-email (answerable only from `invite_accepted`).
6. **Retention cohorts** — D1/D7/D30 from `daily_active`, grouped by signup week.

Queries 1, 2, and 5's first half run against existing tables and work **immediately**, before any emitter ships.

---

## 8. Testing

Reuses the existing harness in `test/collaboration-actions.test.ts` — `vi.mock('@/lib/prisma')` plus mocks for `@/lib/supabase/server`, `next/cache`, and `next/navigation`, with a `signInAs()` helper. The Prisma mock gains an `analyticsEvent: { createMany: vi.fn() }`.

Cover:

- **`trackEvent` never throws** when the database write rejects — the highest-value test, since it guarantees analytics cannot break a mutation.
- **Dedupe-key formats**, including that the daily key uses the UTC date.
- **`invite_accepted` fires only on the real-join branch** — not on the already-member return, not on the P2002 race.
- **`signed_up` property shape**, including `fromInvite` derivation from a `/join/...` destination.
- **The `trackSignedUp` action rejects an unauthenticated caller.**

Per project convention, the Supabase SDK, `components/ui` primitives, and Next internals are not tested.

---

## 9. Risks and mitigations

| Risk                                                                 | Mitigation                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Analytics nobody reads** — the top risk for a solo pre-1.0 project | The SQL file is the deliverable and ships first; queries 1, 2 and 5 return answers before any emitter exists                                |
| Double-counting via realtime echo                                    | No client-side or `getBoardData`-derived emission; server-only                                                                              |
| Double-counting invite accepts                                       | Emit only on the real-join branch, after `boardMember.create` succeeds                                                                      |
| History loss on board/account deletion                               | `boardId` carries no FK; `userId` is `SetNull`                                                                                              |
| PII in an aggregation table                                          | Ids-and-enums whitelist; never email, title, token, or path                                                                                 |
| Serverless write cost on a `max: 1` pool                             | Five low-frequency business events, one extra insert each; no batching (instances freeze after response, so in-process flushing is unsound) |
| Bot/prefetch noise on `invite_link_opened`                           | Documented as directional at the point of use in the SQL                                                                                    |
| Payload drift, as already happened in `activity_logs`                | Compile-time closed union in `lib/analytics/events.ts`                                                                                      |
| Partial signup coverage if confirmations are ever enabled            | The unconfirmed cohort appears as a `profiles` row with no subsequent event; the funnel top is labelled honestly in the SQL                 |

---

## 10. Scope

**New:** `lib/analytics/events.ts`, `lib/analytics/track.ts`, `app/actions/analytics-actions.ts`, `lib/validations/analytics.ts`, `prisma/analytics/funnel.sql`, one migration, tests.

**Modified:** `prisma/schema.prisma` (new model + `Profile` back-relation), `app/actions/invitation-actions.ts` (two emits), `app/join/[token]/page.tsx` (one emit), `app/(dashboard)/layout.tsx` (daily active), `app/auth/callback/route.ts` (capture `data`, emit for new users), `app/(auth)/register/page.tsx` (call the action).

**No** new dependency, **no** CSP change, **no** change to `activity_logs` or the activity feed.

---

## 11. Success criteria

1. `prisma/analytics/funnel.sql` runs clean in the Supabase SQL editor and returns the activation funnel from existing data.
2. Completing signup → board → task → invite → accept → next-day return produces exactly one row per expected event, with no PII in `properties`.
3. Re-clicking an already-accepted invite link adds **no** `invite_accepted` row.
4. Loading the dashboard twice in one UTC day produces exactly one `daily_active` row.
5. Deleting a board leaves its analytics rows intact.
6. Forcing a database error in `trackEvent` still lets the underlying mutation succeed.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` all pass.

---

## 12. Follow-ups (not in scope)

- Fix the `activity_logs` metadata drift: `createBoard` writes `boardTitle` while `activity-feed.tsx` reads `title`, so board-created entries render as _"Untitled"_.
- `CLAUDE.md` is stale: it states only `boardReducer` is tested, but nine test suites now exist.
- Landing-page attribution, an in-app dashboard, and error-rate telemetry, per the non-goals.
