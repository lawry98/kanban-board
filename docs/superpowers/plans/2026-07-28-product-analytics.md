# Product Analytics & Activation Instrumentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the activation and collaboration funnel measurable by adding a first-party `analytics_events` table, five server-emitted events, and a checked-in SQL read layer.

**Architecture:** A single new Postgres table written only through Prisma. `lib/analytics/events.ts` holds a compile-time closed union of event shapes plus the dedupe-key builders (no I/O). `lib/analytics/track.ts` is the server-only emitter — one write, one `try/catch`, never throws, copying the `logActivity` contract verbatim. Five call sites emit; one thin authenticated Server Action (`trackSignedUp`) is the only client entry point. `prisma/analytics/funnel.sql` is the read ritual.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 (`@prisma/adapter-pg`), Supabase (Postgres + Auth), Zod 4, Vitest + React Testing Library.

**Source spec:** `docs/superpowers/specs/2026-07-28-product-analytics-design.md` — read section 5 (taxonomy) and section 11 (success criteria) before starting.

## Global Constraints

- **No new runtime dependency.** No analytics SDK, no `server-only` package, no CSP change.
- **`pnpm` is not on PATH** — always `mise exec -- pnpm <script>`.
- **`pnpm prisma migrate dev` fails** locally (`schema "auth" does not exist`). Hand-write migration SQL, apply with `mise exec -- pnpm prisma migrate deploy`, then `mise exec -- pnpm prisma generate`. Never edit an applied migration.
- **No AI attribution in any commit** — no `Co-Authored-By`, no "Generated with". Conventional Commits. Verify each commit with `git log -1 --format='%an <%ae> [%(trailers)]'` — the trailer list must be empty.
- **Do not modify** `activity_logs`, the `Action` enum, or `components/board/activity-feed.tsx`.
- **Never** persist a raw invite token, an email address, a board or task title, a full pathname, an IP, or a user agent in `properties`. Ids and enum values only.
- `lib/analytics/track.ts` imports Prisma — it must **never** be imported into a `'use client'` component.
- Server Actions: `requireAuth()`/`require*Access` first, `.parse()` every client input, return `ActionResult<T>`, `toActionError` in every catch.
- Every task ends green on: `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`, `mise exec -- pnpm test`, `mise exec -- pnpm format:check`.

---

## File Structure

| File                                                                       | Responsibility                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `prisma/schema.prisma` (modify)                                            | `AnalyticsEvent` model + `Profile.analyticsEvents` back-relation |
| `prisma/migrations/20260728000000_analytics_events/migration.sql` (create) | Hand-written DDL                                                 |
| `lib/analytics/events.ts` (create)                                         | Closed union of event shapes; dedupe-key builders. No I/O.       |
| `lib/analytics/track.ts` (create)                                          | `trackEvent` — the only writer. Server-only.                     |
| `lib/validations/analytics.ts` (create)                                    | Zod schema for the one client-supplied payload                   |
| `app/actions/analytics-actions.ts` (create)                                | `trackSignedUp` — the one client entry point                     |
| `app/actions/invitation-actions.ts` (modify)                               | `invite_link_created`, `invite_accepted`                         |
| `app/join/[token]/page.tsx` (modify)                                       | `invite_link_opened`                                             |
| `app/(dashboard)/layout.tsx` (modify)                                      | `daily_active`                                                   |
| `app/auth/callback/route.ts` (modify)                                      | capture `data`; `signed_up` for fresh users                      |
| `app/(auth)/register/page.tsx` (modify)                                    | call `trackSignedUp` on the session branch                       |
| `prisma/analytics/funnel.sql` (create)                                     | The six read queries                                             |
| `test/analytics.test.ts` (create)                                          | `trackEvent`, dedupe keys, `trackSignedUp`                       |
| `test/collaboration-actions.test.ts` (modify)                              | `invite_accepted` branch coverage                                |
| `test/register-page.test.tsx` (modify)                                     | mock the action; assert `fromInvite`                             |

---

### Task 1: Data model and migration

**Files:**

- Modify: `prisma/schema.prisma` (add model; add back-relation to `Profile`, currently lines 58–74)
- Create: `prisma/migrations/20260728000000_analytics_events/migration.sql`

**Interfaces:**

- Consumes: nothing.
- Produces: the Prisma delegate `prisma.analyticsEvent` with `createMany`, and the generated type `AnalyticsEvent`. Column names used by every later task: `name`, `userId`/`user_id`, `boardId`/`board_id`, `properties`, `dedupeKey`/`dedupe_key`, `occurredAt`/`occurred_at`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append after the `Invitation` model (which ends at line 137):

```prisma
/// First-party product analytics. Deliberately NOT `activity_logs`: that table's
/// board_id is NOT NULL and cascades on board delete, which would erase the
/// churned cohort's activation history — the exact population an activation
/// metric exists to study. See docs/superpowers/specs/2026-07-28-product-analytics-design.md §3.3.
model AnalyticsEvent {
  id String @id @default(uuid())
  /// Free-form by design — NOT a Postgres enum, so adding an event type never
  /// needs a migration. Type safety lives in lib/analytics/events.ts.
  name String
  /// Nullable + SetNull: an erasure request deletes the profile and leaves the
  /// events intact but unattributable.
  userId String? @map("user_id")
  /// Deliberately a plain column with NO foreign key. An FK would cascade on
  /// board deletion and erase the churned cohort's activation history.
  boardId    String? @map("board_id")
  properties Json    @default("{}")
  /// Idempotency handle for once-per-period events. NULL for ordinary events;
  /// Postgres treats NULLs as distinct in a unique index, so any number coexist.
  dedupeKey  String?  @unique @map("dedupe_key")
  occurredAt DateTime @default(now()) @map("occurred_at")

  profile Profile? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([name, occurredAt])
  @@index([userId, occurredAt])
  @@map("analytics_events")
}
```

And add one line to the `Profile` relation block (after `invitations   Invitation[]`):

```prisma
  analyticsEvents AnalyticsEvent[]
```

- [ ] **Step 2: Format the schema and confirm it parses**

Run: `mise exec -- pnpm prisma format`
Expected: rewrites `schema.prisma` with aligned columns, exits 0. If it reports a validation error, the model is malformed — fix before continuing.

- [ ] **Step 3: Hand-write the migration**

Create `prisma/migrations/20260728000000_analytics_events/migration.sql`:

```sql
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
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `mise exec -- pnpm prisma migrate deploy`
Expected: `1 migration found` … `Applying migration '20260728000000_analytics_events'` … `All migrations have been successfully applied.`

Run: `mise exec -- pnpm prisma generate`
Expected: `Generated Prisma Client (v7.x.x)`.

- [ ] **Step 5: Verify drift-free state**

Run: `mise exec -- pnpm prisma migrate status`
Expected: `Database schema is up to date!`

Run: `mise exec -- pnpm typecheck`
Expected: exits 0, no output.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260728000000_analytics_events
git commit -m "feat(analytics): add analytics_events table"
```

Then verify: `git log -1 --format='%an <%ae> [%(trailers)]'` — trailer list must be `[]`.

---

### Task 2: The event contract (`lib/analytics/events.ts`)

**Files:**

- Create: `lib/analytics/events.ts`
- Create: `test/analytics.test.ts`

**Interfaces:**

- Consumes: nothing (pure types + string builders, no I/O, no Prisma import).
- Produces:
  - `type AnalyticsEventName = 'signed_up' | 'invite_link_created' | 'invite_link_opened' | 'invite_accepted' | 'daily_active'`
  - `type AnalyticsEventInput` — the discriminated union every emitter passes to `trackEvent`. Every member has `name`, `userId`, `boardId`, and (except `daily_active`) `properties`; `signed_up` and `daily_active` additionally require `dedupeKey`.
  - `function signedUpKey(userId: string): string`
  - `function dailyActiveKey(userId: string, at: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `test/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { dailyActiveKey, signedUpKey } from '@/lib/analytics/events';

describe('dedupe keys', () => {
  it('builds a stable per-user signed_up key', () => {
    expect(signedUpKey('user-1')).toBe('signed_up:user-1');
  });

  it('builds a per-user, per-day daily_active key', () => {
    expect(dailyActiveKey('user-1', new Date('2026-07-28T12:00:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
  });

  it('uses the UTC calendar date, not the server-local one', () => {
    // 23:30 UTC on the 28th is already the 29th in UTC+2 and still the 28th in
    // UTC-5. The key must be identical regardless of the deploy region, or a
    // single user double-counts across a region change.
    expect(dailyActiveKey('user-1', new Date('2026-07-28T23:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
    expect(dailyActiveKey('user-1', new Date('2026-07-29T00:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-29',
    );
  });

  it('gives the same user a different key on a different day', () => {
    const a = dailyActiveKey('user-1', new Date('2026-07-28T09:00:00.000Z'));
    const b = dailyActiveKey('user-1', new Date('2026-07-29T09:00:00.000Z'));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/events"`.

- [ ] **Step 3: Write the implementation**

Create `lib/analytics/events.ts`:

```ts
/**
 * The analytics event contract — types and key formats only, no I/O.
 *
 * The union below is closed on purpose: a malformed payload is a compile error,
 * not a silently rotten JSON column. This is the direct answer to the drift that
 * already happened in `activity_logs`, where `createBoard` writes
 * `metadata.boardTitle` while `activity-feed.tsx` reads `meta.title`.
 *
 * PRIVACY: property values are ids and enum members only. Never add an email, a
 * raw invite token, a board or task title, a pathname, an IP, or a user agent.
 */

export type AnalyticsEventName =
  | 'signed_up'
  | 'invite_link_created'
  | 'invite_link_opened'
  | 'invite_accepted'
  | 'daily_active';

/** How the account was created. `fromInvite` is a boolean, never the path itself. */
export type SignedUpProperties = {
  method: 'password' | 'github';
  fromInvite: boolean;
};

export type InviteLinkCreatedProperties = {
  role: 'EDITOR' | 'VIEWER';
  invitationId: string;
};

/**
 * `linkState: 'invalid'` covers an unknown, revoked, or expired token — a dead-link
 * click is itself a funnel signal. Ids are null only when the token matches nothing.
 */
export type InviteLinkOpenedProperties = {
  invitationId: string | null;
  linkState: 'active' | 'invalid';
  viewerState: 'anonymous' | 'authenticated';
};

export type InviteAcceptedProperties = {
  invitationId: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  secondsSinceLinkCreated: number;
};

/**
 * Property bags are `type` aliases rather than `interface`s on purpose: only a type
 * alias gets TypeScript's implicit index signature, which is what makes them
 * assignable to Prisma's `InputJsonObject` without a cast.
 */
export type AnalyticsEventInput =
  | {
      name: 'signed_up';
      userId: string;
      boardId: null;
      dedupeKey: string;
      properties: SignedUpProperties;
    }
  | {
      name: 'invite_link_created';
      userId: string;
      boardId: string;
      dedupeKey?: undefined;
      properties: InviteLinkCreatedProperties;
    }
  | {
      name: 'invite_link_opened';
      userId: string | null;
      boardId: string | null;
      dedupeKey?: undefined;
      properties: InviteLinkOpenedProperties;
    }
  | {
      name: 'invite_accepted';
      userId: string;
      boardId: string;
      dedupeKey?: undefined;
      properties: InviteAcceptedProperties;
    }
  | {
      name: 'daily_active';
      userId: string;
      boardId: null;
      dedupeKey: string;
      properties?: undefined;
    };

/** Exactly one row per user, whichever emission path (register or OAuth callback) fires first. */
export function signedUpKey(userId: string): string {
  return `signed_up:${userId}`;
}

/**
 * At most one row per user per UTC day. `toISOString()` is always UTC, so the key
 * is deterministic regardless of the server region the function happens to run in.
 */
export function dailyActiveKey(userId: string, at: Date): string {
  return `daily_active:${userId}:${at.toISOString().slice(0, 10)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/events.ts test/analytics.test.ts
git commit -m "feat(analytics): add event contract and dedupe key builders"
```

---

### Task 3: The emitter (`lib/analytics/track.ts`)

**Files:**

- Create: `lib/analytics/track.ts`
- Modify: `test/analytics.test.ts` (add the `trackEvent` block and the Prisma mock)

**Interfaces:**

- Consumes: `AnalyticsEventInput` from `lib/analytics/events.ts`.
- Produces: `async function trackEvent(event: AnalyticsEventInput): Promise<void>` — writes exactly one row via `prisma.analyticsEvent.createMany({ data: [...], skipDuplicates: true })`, and **never throws**.

- [ ] **Step 1: Write the failing tests**

Rewrite the top of `test/analytics.test.ts` so the mocks are hoisted above the imports, and add the `trackEvent` describe block. The full file after this step:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { analyticsEvent: { createMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { dailyActiveKey, signedUpKey } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/track';

const db = prisma as unknown as { analyticsEvent: { createMany: Mock } };

beforeEach(() => {
  vi.clearAllMocks();
  db.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
});

describe('dedupe keys', () => {
  it('builds a stable per-user signed_up key', () => {
    expect(signedUpKey('user-1')).toBe('signed_up:user-1');
  });

  it('builds a per-user, per-day daily_active key', () => {
    expect(dailyActiveKey('user-1', new Date('2026-07-28T12:00:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
  });

  it('uses the UTC calendar date, not the server-local one', () => {
    // 23:30 UTC on the 28th is already the 29th in UTC+2 and still the 28th in
    // UTC-5. The key must be identical regardless of the deploy region, or a
    // single user double-counts across a region change.
    expect(dailyActiveKey('user-1', new Date('2026-07-28T23:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-28',
    );
    expect(dailyActiveKey('user-1', new Date('2026-07-29T00:30:00.000Z'))).toBe(
      'daily_active:user-1:2026-07-29',
    );
  });

  it('gives the same user a different key on a different day', () => {
    const a = dailyActiveKey('user-1', new Date('2026-07-28T09:00:00.000Z'));
    const b = dailyActiveKey('user-1', new Date('2026-07-29T09:00:00.000Z'));
    expect(a).not.toBe(b);
  });
});

describe('trackEvent', () => {
  it('never throws when the database write rejects', async () => {
    // The single most important guarantee in this feature: analytics must never
    // fail a mutation the user actually completed. A throw here would make the
    // calling action return { error } and the client would revert a change that
    // really did persist.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.analyticsEvent.createMany.mockRejectedValue(new Error('connection terminated'));

    await expect(
      trackEvent({
        name: 'invite_accepted',
        userId: 'user-1',
        boardId: 'board-1',
        properties: { invitationId: 'inv-1', role: 'EDITOR', secondsSinceLinkCreated: 42 },
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('writes one row with skipDuplicates so a duplicate dedupe key is a no-op', async () => {
    await trackEvent({
      name: 'daily_active',
      userId: 'user-1',
      boardId: null,
      dedupeKey: 'daily_active:user-1:2026-07-28',
    });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'daily_active',
          userId: 'user-1',
          boardId: null,
          properties: {},
          dedupeKey: 'daily_active:user-1:2026-07-28',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('stores a NULL dedupe key for ordinary, non-deduped events', async () => {
    await trackEvent({
      name: 'invite_link_created',
      userId: 'user-1',
      boardId: 'board-1',
      properties: { role: 'VIEWER', invitationId: 'inv-1' },
    });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'invite_link_created',
          userId: 'user-1',
          boardId: 'board-1',
          properties: { role: 'VIEWER', invitationId: 'inv-1' },
          dedupeKey: null,
        },
      ],
      skipDuplicates: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/track"`.

- [ ] **Step 3: Write the implementation**

Create `lib/analytics/track.ts`:

```ts
import { prisma } from '@/lib/prisma';
import type { AnalyticsEventInput } from '@/lib/analytics/events';
import type { Prisma } from '@prisma/client';

/**
 * Server-only: this module imports Prisma, so it must never be pulled into a
 * `'use client'` component. Client code reaches analytics through the single
 * Server Action in `app/actions/analytics-actions.ts`.
 *
 * Copies the `logActivity` contract verbatim — one write, one try/catch,
 * `console.error` on failure, returns void, NEVER throws. Analytics must never
 * fail a mutation the user actually completed. A realistic failure is the FK to
 * `profiles` when a freshly-created OAuth user has no profile row yet.
 *
 * `createMany` (not `create`) because `skipDuplicates` turns a repeated dedupe
 * key into a silent no-op instead of a P2002 we would have to catch and classify.
 */
export async function trackEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    await prisma.analyticsEvent.createMany({
      data: [
        {
          name: event.name,
          userId: event.userId,
          boardId: event.boardId,
          properties: (event.properties ?? {}) satisfies Prisma.InputJsonObject,
          dedupeKey: event.dedupeKey ?? null,
        },
      ],
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('analyticsEvent.createMany failed (non-fatal):', error);
  }
}
```

> If `satisfies Prisma.InputJsonObject` does not typecheck against the generated
> client, replace it with a plain `event.properties ?? {}` and let inference do the
> work — do **not** reach for `as any` (the no-explicit-any rule is an error).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: PASS — 7 passed.

Run: `mise exec -- pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/track.ts test/analytics.test.ts
git commit -m "feat(analytics): add best-effort trackEvent emitter"
```

---

### Task 4: The `trackSignedUp` Server Action

**Files:**

- Create: `lib/validations/analytics.ts`
- Create: `app/actions/analytics-actions.ts`
- Modify: `test/analytics.test.ts` (add Supabase mock + a `trackSignedUp` block)

**Interfaces:**

- Consumes: `trackEvent`, `signedUpKey`, `requireAuth`, `toActionError`, `ActionResult`.
- Produces:
  - `const trackSignedUpSchema` (Zod) — `{ method: 'password' | 'github'; fromInvite: boolean }`
  - `async function trackSignedUp(input: unknown): Promise<ActionResult<true>>`

- [ ] **Step 1: Write the failing tests**

Add to the mock block at the top of `test/analytics.test.ts` (immediately after the existing `vi.mock('@/lib/prisma', …)`):

```ts
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
```

Add these imports beside the existing ones:

```ts
import { createClient } from '@/lib/supabase/server';
import { trackSignedUp } from '@/app/actions/analytics-actions';
```

Add this helper below the `db` handle:

```ts
const mockedCreateClient = createClient as unknown as Mock;

function signInAs(id = 'user-1'): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id, email: 'me@example.com' } }, error: null }),
    },
  });
}

function signedOut(): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  });
}
```

Add `signInAs();` as the last line of the existing `beforeEach`.

Append this describe block:

```ts
describe('trackSignedUp', () => {
  it('rejects an unauthenticated caller without writing anything', async () => {
    // /register is a public route, so this action is the one client entry point
    // into analytics — it must never behave as an open write endpoint.
    signedOut();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trackSignedUp({ method: 'password', fromInvite: false });

    expect(result).toEqual({ error: 'Unauthorized' });
    expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects a malformed payload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trackSignedUp({ method: 'carrier-pigeon', fromInvite: false });

    expect(result.error).toBeDefined();
    expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('records the signup with the authenticated user id and a dedupe key', async () => {
    const result = await trackSignedUp({ method: 'password', fromInvite: true });

    expect(result).toEqual({ data: true });
    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'signed_up',
          userId: 'user-1',
          boardId: null,
          properties: { method: 'password', fromInvite: true },
          dedupeKey: 'signed_up:user-1',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('never trusts a user id supplied by the caller', async () => {
    await trackSignedUp({ method: 'password', fromInvite: false, userId: 'attacker' });

    expect(db.analyticsEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ userId: 'user-1' })],
      }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/actions/analytics-actions"`.

- [ ] **Step 3: Write the validation schema**

Create `lib/validations/analytics.ts`:

```ts
import { z } from 'zod';

/**
 * The only analytics payload that ever crosses the Server Action boundary. The
 * user id is NOT part of it — it comes from `requireAuth()`, never the client.
 */
export const trackSignedUpSchema = z.object({
  method: z.enum(['password', 'github']),
  fromInvite: z.boolean(),
});

export type TrackSignedUpInput = z.infer<typeof trackSignedUpSchema>;
```

- [ ] **Step 4: Write the action**

Create `app/actions/analytics-actions.ts`:

```ts
'use server';

import { trackEvent } from '@/lib/analytics/track';
import { signedUpKey } from '@/lib/analytics/events';
import { requireAuth, toActionError } from '@/lib/auth/require-access';
import { trackSignedUpSchema } from '@/lib/validations/analytics';
import type { ActionResult } from '@/lib/auth/require-access';

/**
 * The single client entry point into analytics. Authenticated on purpose:
 * `/register` is a public route, and an unauthenticated write endpoint here would
 * let anyone forge funnel data. The user id comes from the verified session, so a
 * caller cannot attribute an event to someone else.
 *
 * The `signed_up:<userId>` dedupe key makes this safe to race with the OAuth
 * callback's emission — whichever fires first wins, the other is a no-op.
 * Callers ignore the result; it exists only for contract consistency.
 */
export async function trackSignedUp(input: unknown): Promise<ActionResult<true>> {
  try {
    const user = await requireAuth();
    const { method, fromInvite } = trackSignedUpSchema.parse(input);

    await trackEvent({
      name: 'signed_up',
      userId: user.id,
      boardId: null,
      dedupeKey: signedUpKey(user.id),
      properties: { method, fromInvite },
    });

    return { data: true };
  } catch (error) {
    return toActionError('trackSignedUp', error, 'Failed to record signup');
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mise exec -- pnpm test test/analytics.test.ts`
Expected: PASS — 11 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/analytics.ts app/actions/analytics-actions.ts test/analytics.test.ts
git commit -m "feat(analytics): add authenticated trackSignedUp action"
```

---

### Task 5: Invitation emitters (`invite_link_created`, `invite_accepted`)

**Files:**

- Modify: `app/actions/invitation-actions.ts` (`createInvitation` around line 46–56; `acceptInvitation` around line 133–153)
- Modify: `test/collaboration-actions.test.ts` (extend the Prisma mock, add assertions)

**Interfaces:**

- Consumes: `trackEvent` from `lib/analytics/track.ts`.
- Produces: no new exports. Two emissions, both inside the existing `try`.

- [ ] **Step 1: Extend the Prisma mock in `test/collaboration-actions.test.ts`**

In the `vi.mock('@/lib/prisma', …)` factory (lines 4–17), add one delegate:

```ts
    analyticsEvent: { createMany: vi.fn() },
```

In the `db` handle type (lines 43–48), add the matching line:

```ts
analyticsEvent: {
  createMany: Mock;
}
```

In `beforeEach` (lines 88–94), add:

```ts
db.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
```

- [ ] **Step 2: Write the failing tests**

Add to the existing `describe('acceptInvitation', …)` block:

```ts
it('records invite_accepted only on the real-join branch', async () => {
  db.invitation.findUnique.mockResolvedValue(
    makeInvitation({ role: 'VIEWER', createdAt: new Date(Date.now() - 120_000) }),
  );
  db.boardMember.findFirst.mockResolvedValue(null);
  db.boardMember.create.mockResolvedValue({ id: 'member-new' });

  await acceptInvitation('tok_abc');

  expect(db.analyticsEvent.createMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        name: 'invite_accepted',
        userId: USER_ID,
        boardId: BOARD_A,
        properties: expect.objectContaining({
          invitationId: INVITATION_ID,
          role: 'VIEWER',
        }),
      }),
    ],
    skipDuplicates: true,
  });
});

it('records NO invite_accepted when the user is already a member', async () => {
  // Re-clicking a link you already accepted must not inflate the accept count.
  db.invitation.findUnique.mockResolvedValue(makeInvitation());
  db.boardMember.findFirst.mockResolvedValue({ id: 'member-existing' });

  await acceptInvitation('tok_abc');

  expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
});

it('records NO invite_accepted when the create loses a P2002 race', async () => {
  db.invitation.findUnique.mockResolvedValue(makeInvitation());
  db.boardMember.findFirst.mockResolvedValue(null);
  db.boardMember.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
  );

  await acceptInvitation('tok_abc');

  expect(db.analyticsEvent.createMany).not.toHaveBeenCalled();
});

it('records seconds-since-link-created as a non-negative number', async () => {
  db.invitation.findUnique.mockResolvedValue(
    makeInvitation({ createdAt: new Date(Date.now() - 90_000) }),
  );
  db.boardMember.findFirst.mockResolvedValue(null);
  db.boardMember.create.mockResolvedValue({ id: 'member-new' });

  await acceptInvitation('tok_abc');

  const [{ data }] = db.analyticsEvent.createMany.mock.calls[0];
  expect(data[0].properties.secondsSinceLinkCreated).toBeGreaterThanOrEqual(89);
  expect(data[0].properties.secondsSinceLinkCreated).toBeLessThanOrEqual(95);
});
```

Add to the existing `describe('createInvitation', …)` block:

```ts
it('records invite_link_created with the role and invitation id, never the token', async () => {
  db.boardMember.findFirst.mockResolvedValue(makeMember({ role: 'OWNER' }));
  db.invitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: INVITATION_ID,
    ...data,
  }));

  await createInvitation(BOARD_A, { role: 'EDITOR' });

  const [{ data }] = db.analyticsEvent.createMany.mock.calls[0];
  expect(data[0]).toEqual(
    expect.objectContaining({
      name: 'invite_link_created',
      userId: USER_ID,
      boardId: BOARD_A,
      properties: { role: 'EDITOR', invitationId: INVITATION_ID },
    }),
  );
  // Ids and enums only — no token, no email.
  expect(JSON.stringify(data[0].properties)).not.toContain('token');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `mise exec -- pnpm test test/collaboration-actions.test.ts`
Expected: FAIL — the four new assertions report `createMany` was never called (and the two `not.toHaveBeenCalled()` ones pass vacuously for now).

- [ ] **Step 4: Add the emissions**

In `app/actions/invitation-actions.ts`, add to the import block:

```ts
import { trackEvent } from '@/lib/analytics/track';
```

In `createInvitation`, between the `prisma.invitation.create(...)` call and `return { data: invitation };`:

```ts
// Ids and enum values only — the token is never recorded.
await trackEvent({
  name: 'invite_link_created',
  userId: user.id,
  boardId: id,
  properties: { role, invitationId: invitation.id },
});
```

In `acceptInvitation`, immediately after the existing `await logActivity({ … })` call and still inside the inner `try`:

```ts
// Only here: not on the already-a-member early return above, and not in the
// P2002 catch below. Either of those would inflate the accept count.
await trackEvent({
  name: 'invite_accepted',
  userId: user.id,
  boardId: invitation.boardId,
  properties: {
    invitationId: invitation.id,
    role: invitation.role,
    secondsSinceLinkCreated: Math.max(
      0,
      Math.round((Date.now() - invitation.createdAt.getTime()) / 1000),
    ),
  },
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mise exec -- pnpm test test/collaboration-actions.test.ts`
Expected: PASS — all tests in the file, including the five new ones.

- [ ] **Step 6: Commit**

```bash
git add app/actions/invitation-actions.ts test/collaboration-actions.test.ts
git commit -m "feat(analytics): record invite link creation and acceptance"
```

---

### Task 6: `invite_link_opened` and `daily_active`

**Files:**

- Modify: `app/join/[token]/page.tsx` (lines 31–67 are reordered)
- Modify: `app/(dashboard)/layout.tsx` (after the profile lookup, lines 17–20)

**Interfaces:**

- Consumes: `trackEvent`, `dailyActiveKey`.
- Produces: no new exports.

> **Why the join page is reordered:** today it returns early on an invalid link
> (line 44) and only calls `supabase.auth.getUser()` afterwards (line 64). The event
> needs `viewerState` on _both_ branches, so the `getUser()` call moves above the
> validity check. Nothing else about the rendering changes.

- [ ] **Step 1: Emit `invite_link_opened` from the join page**

In `app/join/[token]/page.tsx`, add to the imports:

```ts
import { trackEvent } from '@/lib/analytics/track';
```

Replace the body of `JoinPage` from `const { token } = await params;` down to and including the invalid-link `if` block, with:

```ts
  const { token } = await params;

  // Read-only lookup: acceptance is a separate, explicit POST via <JoinButton>,
  // so merely loading (or prefetching) this page never joins anyone.
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      board: { select: { title: true } },
      inviter: { select: { fullName: true } },
    },
  });

  // Resolved before the validity check because the event needs `viewerState` on
  // both branches — a logged-out visitor hitting a dead link is still a signal.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const linkActive = invitation !== null && isActive(invitation);

  // The only pre-auth event in the app, and the denominator for invite conversion.
  // ACCEPTED TRADEOFF: this fires during a server render, so RSC prefetches and
  // link-preview bots (Slack, iMessage, mail clients) inflate it. Treat it as a
  // directional denominator, never a headcount — funnel.sql repeats this caveat
  // at the point of use. The token itself is never recorded.
  await trackEvent({
    name: 'invite_link_opened',
    userId: user?.id ?? null,
    boardId: invitation?.boardId ?? null,
    properties: {
      invitationId: invitation?.id ?? null,
      linkState: linkActive ? 'active' : 'invalid',
      viewerState: user ? 'authenticated' : 'anonymous',
    },
  });

  if (!linkActive) {
    return (
      <JoinShell>
        <Card>
          <CardHeader>
            <CardTitle>Invite link no longer valid</CardTitle>
            <CardDescription>
              This invite link has been revoked or has expired. Ask the board owner for a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/boards">Go to your boards</Link>
            </Button>
          </CardContent>
        </Card>
      </JoinShell>
    );
  }
```

Then delete the now-duplicated `getUser()` block that used to sit below (the old lines 64–67), leaving the code that follows starting at `const boardTitle = invitation.board.title;`.

> **On TypeScript narrowing:** TypeScript 5.5+ narrows `invitation` to non-null
> after `if (!linkActive) return`, because `linkActive` is a `const` initialised
> from an expression containing `invitation !== null` (aliased-condition narrowing).
> If the installed `tsc` version reports `'invitation' is possibly 'null'` on the
> `invitation.board.title` line below, use the explicit form instead:
>
> ```ts
> if (!invitation || !isActive(invitation)) {
>   return ( /* the identical JSX shown above */ );
> }
> ```
>
> keeping `linkActive` computed above it purely for the event payload. Never add a
> non-null assertion (`!`) to silence this.

- [ ] **Step 2: Emit `daily_active` from the dashboard layout**

In `app/(dashboard)/layout.tsx`, add to the imports:

```ts
import { trackEvent } from '@/lib/analytics/track';
import { dailyActiveKey } from '@/lib/analytics/events';
```

Immediately after the `prisma.profile.findUnique(...)` call:

```ts
// Rides the profile lookup that already runs here. The UTC-dated dedupe key
// collapses every dashboard navigation in a day into a single row, so this is
// at most one extra insert per user per day.
await trackEvent({
  name: 'daily_active',
  userId: user.id,
  boardId: null,
  dedupeKey: dailyActiveKey(user.id, new Date()),
});
```

- [ ] **Step 3: Verify the build and the existing suite**

Run: `mise exec -- pnpm typecheck`
Expected: exits 0. If it reports `invitation is possibly null`, apply the alternate guard form noted in Step 1.

Run: `mise exec -- pnpm test`
Expected: all suites pass (no test imports these two server components; this step guards against a regression elsewhere).

Run: `mise exec -- pnpm lint`
Expected: exits 0, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add "app/join/[token]/page.tsx" "app/(dashboard)/layout.tsx"
git commit -m "feat(analytics): record invite link opens and daily active users"
```

---

### Task 7: `signed_up` from both auth paths

**Files:**

- Modify: `app/auth/callback/route.ts` (line 19 destructure; emit before the redirect at line 22)
- Modify: `app/(auth)/register/page.tsx` (the `if (data.session)` branch, lines 71–77)
- Modify: `test/register-page.test.tsx` (mock the action; assert the payload)

**Interfaces:**

- Consumes: `trackEvent`, `signedUpKey` (callback, server side); `trackSignedUp` (register page, client side).
- Produces: no new exports.

> **One implementation note beyond the spec's letter:** the spec names the callback
> the `'github'` emission site. The callback also handles email-confirmation links,
> so `method` is derived from `user.app_metadata.provider` (`'github'` when the
> provider is GitHub, otherwise `'password'`) rather than hard-coded. The value set
> stays exactly the spec's `'password' | 'github'`.

- [ ] **Step 1: Write the failing register-page tests**

In `test/register-page.test.tsx`, add to the `vi.hoisted` block (lines 7–13):

```ts
  trackSignedUp: vi.fn(),
```

and destructure it: `const { push, refresh, signUp, toastError, toastSuccess, trackSignedUp } = vi.hoisted(…)`.

Add this mock beside the others (it is **required**, not optional: without it the test
would import the real `'use server'` module and, through it, the real Prisma client):

```ts
vi.mock('@/app/actions/analytics-actions', () => ({
  trackSignedUp: (...args: unknown[]) => {
    trackSignedUp(...args);
    return Promise.resolve({ data: true as const });
  },
}));
```

Change the `next/navigation` mock so the `?next=` value is configurable:

```ts
const searchParams = { value: '' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
```

`searchParams` must also be declared inside the same `vi.hoisted` call so the mock
factory can close over it:

```ts
const { push, refresh, signUp, toastError, toastSuccess, trackSignedUp, searchParams } = vi.hoisted(
  () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    signUp: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    trackSignedUp: vi.fn(),
    searchParams: { value: '' },
  }),
);
```

Add `searchParams.value = '';` to the existing `beforeEach`.

Append these tests:

```ts
it('records signed_up with method=password when a session is issued', async () => {
  signUp.mockResolvedValue({
    data: { user: { identities: [{}] }, session: { access_token: 'x' } },
    error: null,
  });
  await fillAndSubmit();

  await waitFor(() =>
    expect(trackSignedUp).toHaveBeenCalledWith({ method: 'password', fromInvite: false }),
  );
});

it('derives fromInvite from a /join destination without recording the token', async () => {
  searchParams.value = 'next=%2Fjoin%2Fsecret-token';
  signUp.mockResolvedValue({
    data: { user: { identities: [{}] }, session: { access_token: 'x' } },
    error: null,
  });
  await fillAndSubmit();

  await waitFor(() =>
    expect(trackSignedUp).toHaveBeenCalledWith({ method: 'password', fromInvite: true }),
  );
  // A boolean, never the path — the token must not reach the events table.
  expect(JSON.stringify(trackSignedUp.mock.calls)).not.toContain('secret-token');
});

it('records nothing when sign-up fails', async () => {
  signUp.mockResolvedValue({ data: {}, error: { message: 'Password is too weak' } });
  await fillAndSubmit();

  await waitFor(() => expect(toastError).toHaveBeenCalled());
  expect(trackSignedUp).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mise exec -- pnpm test test/register-page.test.tsx`
Expected: FAIL — `expected "trackSignedUp" to be called with …` (never called).

- [ ] **Step 3: Emit from the register page**

In `app/(auth)/register/page.tsx`, add to the imports:

```ts
import { trackSignedUp } from '@/app/actions/analytics-actions';
```

Replace the `if (data.session) { … }` branch (lines 71–77) with:

```ts
if (data.session) {
  // Confirmations disabled (or the address was auto-confirmed): the user has a
  // live session now, so send them on to their destination.
  // Best-effort telemetry — a boolean, never the destination path, and never
  // allowed to block or fail a signup the user actually completed.
  await trackSignedUp({ method: 'password', fromInvite: next.startsWith('/join/') }).catch(
    () => {},
  );
  router.push(next as Route);
  router.refresh();
  return;
}
```

- [ ] **Step 4: Run the register tests to verify they pass**

Run: `mise exec -- pnpm test test/register-page.test.tsx`
Expected: PASS — 7 passed (4 pre-existing + 3 new).

- [ ] **Step 5: Emit from the OAuth callback**

In `app/auth/callback/route.ts`, add to the imports:

```ts
import { trackEvent } from '@/lib/analytics/track';
import { signedUpKey } from '@/lib/analytics/events';
```

Add above `export async function GET`:

```ts
/**
 * How recently `auth.users.created_at` must be for this callback to count as a
 * signup rather than a returning sign-in. Read from the exchange result that is
 * already in hand, so this costs no extra query.
 */
const SIGNUP_FRESHNESS_MS = 60_000;
```

Replace lines 19–23 (`const { error } = …` through the `if (!error)` return) with:

```ts
const { data, error } = await supabase.auth.exchangeCodeForSession(code);

if (!error) {
  const user = data.user;
  if (user && Date.now() - new Date(user.created_at).getTime() < SIGNUP_FRESHNESS_MS) {
    // GitHub users never touch the register page's session branch, so this is
    // their only signup emission site. The freshness window keeps returning
    // sign-ins (and recovery-link exchanges) out of the funnel top, and the
    // shared `signed_up:<userId>` dedupe key makes a race with the register
    // page's emission a no-op.
    await trackEvent({
      name: 'signed_up',
      userId: user.id,
      boardId: null,
      dedupeKey: signedUpKey(user.id),
      properties: {
        method: user.app_metadata?.provider === 'github' ? 'github' : 'password',
        fromInvite: next.startsWith('/join/'),
      },
    });
  }
  return NextResponse.redirect(new URL(next, origin));
}
```

- [ ] **Step 6: Verify the whole suite and the types**

Run: `mise exec -- pnpm typecheck`
Expected: exits 0.

Run: `mise exec -- pnpm test`
Expected: all suites pass.

Run: `mise exec -- pnpm lint`
Expected: exits 0, zero warnings.

- [ ] **Step 7: Commit**

```bash
git add app/auth/callback/route.ts "app/(auth)/register/page.tsx" test/register-page.test.tsx
git commit -m "feat(analytics): record signups from the password and OAuth paths"
```

---

### Task 8: The SQL read layer

**Files:**

- Create: `prisma/analytics/funnel.sql`

**Interfaces:**

- Consumes: the `analytics_events` table from Task 1 and the existing domain tables.
- Produces: nothing importable — this file is pasted into the Supabase SQL editor.

- [ ] **Step 1: Write the file**

Create `prisma/analytics/funnel.sql`:

```sql
-- ============================================================================
-- KANBANFLOW — ACTIVATION & COLLABORATION FUNNEL
-- ============================================================================
-- Paste into the Supabase SQL editor. Monthly is a fine cadence.
--
-- Checked into the repo on purpose: these queries are the deliverable, not the
-- emitters. Keeping them here means they get reviewed and updated in the same
-- commit as a schema change, instead of rotting in a browser tab.
--
-- READ THIS FIRST — two honest caveats that apply throughout:
--   * `analytics_events` only covers the INSTRUMENTED ERA (from the day this
--     shipped). `profiles`/`boards`/`tasks`/`invitations` cover all of history.
--     Never divide an event count by an all-time table count.
--   * Queries 1, 2 and the first half of 5 read only domain tables, so they
--     return real answers immediately, before any event has been recorded.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Signups over time
--    Q: are we getting more signups week over week?
--    Source: profiles.created_at (written server-side by the handle_new_user
--    trigger on auth.users). Works over all history.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('week', created_at)::date AS week,
  count(*)                             AS signups
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
  round(100.0 * count(t.at) / nullif(count(b.at), 0), 1)               AS pct_of_board_creators_who_made_a_task,
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
--    `links_created` is all-time; the two event columns are instrumented-era only.
-- ----------------------------------------------------------------------------
WITH created AS (
  SELECT count(*) AS n, min(created_at) AS first_link FROM invitations
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
  created.n                                                     AS links_created_all_time,
  opened.n                                                      AS link_opens_directional,
  opened.on_a_live_link,
  opened.on_a_dead_link,
  opened.by_logged_out_visitors,
  accepted.n                                                    AS accepts,
  round(100.0 * accepted.n / nullif(opened.on_a_live_link, 0), 1) AS pct_accept_per_live_link_open,
  round(accepted.median_seconds, 0)                             AS median_seconds_from_link_to_accept
FROM created, opened, accepted;


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
)
SELECT
  (SELECT since FROM window_start) AS instrumented_since,
  (SELECT count(*) FROM analytics_events WHERE name = 'invite_accepted') AS joined_via_link,
  (SELECT count(*) FROM board_members bm, window_start
     WHERE bm.role <> 'OWNER' AND bm.joined_at >= window_start.since)    AS non_owner_memberships_in_window;
-- `non_owner_memberships_in_window - joined_via_link` approximates owner
-- add-by-email. It is an approximation, not an identity: a member who left and
-- rejoined counts once in the membership table but twice in the events.


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
         date_trunc('week', created_at)::date AS signup_week,
         (created_at AT TIME ZONE 'UTC')::date AS signup_day
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
```

- [ ] **Step 2: Verify each query parses and runs**

Run each statement against the local database. Prettier does not format `.sql`, and
Vitest excludes `prisma/`, so the only real check is execution:

```bash
mise exec -- pnpm prisma db execute --file prisma/analytics/funnel.sql --schema prisma/schema.prisma
```

Expected: exits 0 with `Script executed successfully.` A syntax error names the
statement — fix it and re-run. (This proves the SQL parses and runs; it does not
show result rows. For actual numbers, paste the file into the Supabase SQL editor at
http://127.0.0.1:54423 and run the queries one at a time.)

- [ ] **Step 3: Commit**

```bash
git add prisma/analytics/funnel.sql
git commit -m "docs(analytics): add funnel SQL read layer"
```

---

### Task 9: End-to-end verification against the success criteria

**Files:** none created; this task produces evidence, and a commit only if a fix is needed.

**Interfaces:**

- Consumes: everything above.
- Produces: a verification report covering all seven items in section 11 of the spec.

- [ ] **Step 1: Run the full gate and capture real output**

```bash
mise exec -- pnpm typecheck
mise exec -- pnpm lint
mise exec -- pnpm test
mise exec -- pnpm format:check
mise exec -- pnpm prisma migrate status
```

Expected: typecheck silent/0; lint 0 with zero warnings; all Vitest suites pass;
`All matched files use Prettier code style!`; `Database schema is up to date!`.

If `format:check` names a file this feature touched, run `mise exec -- pnpm format`,
re-run the check, and fold the result into the relevant commit — do **not** leave it
for a trailing cleanup commit.

- [ ] **Step 2: Verify criterion 2 — one row per expected event, no PII**

Walk the funnel in the running app (register → create board → create task → create
invite link → open it in a second browser profile → accept), then:

```bash
mise exec -- pnpm prisma studio
```

Inspect `analytics_events`. Confirm: exactly one `signed_up`, one
`invite_link_created`, at least one `invite_link_opened`, exactly one
`invite_accepted`. Then confirm no PII leaked, which a query answers better than the
eye — paste into the Supabase SQL editor:

```sql
SELECT name, properties FROM analytics_events ORDER BY occurred_at DESC LIMIT 50;
```

Every value must be a uuid, an enum member, a boolean, or a number. No `@`, no
board or task title, no `/join/` path, no token.

- [ ] **Step 3: Verify criteria 3 and 4 — dedupe actually dedupes**

Re-click the already-accepted invite link, then reload `/boards` twice.

```sql
SELECT name, count(*) FROM analytics_events
WHERE name IN ('invite_accepted', 'daily_active') GROUP BY 1;
```

Expected: `invite_accepted` count unchanged from Step 2; `daily_active` = 1.

- [ ] **Step 4: Verify criterion 5 — board deletion preserves history**

Note the row count, delete the board through the UI, then re-count:

```sql
SELECT count(*) FROM analytics_events WHERE board_id = '<the deleted board id>';
```

Expected: unchanged, and the rows still hold the deleted board's id. (This is the
whole reason `board_id` carries no foreign key.)

- [ ] **Step 5: Verify criterion 6 — a failing write cannot break a mutation**

The unit test `trackEvent never throws when the database write rejects` (Task 3)
covers this. Re-run it and paste the output:

```bash
mise exec -- pnpm test test/analytics.test.ts
```

- [ ] **Step 6: Request code review**

**REQUIRED SUB-SKILL:** `superpowers:requesting-code-review`. Scope the review to the
diff from `main` excluding the Prettier commit.

- [ ] **Step 7: Report**

Report each success criterion with the command output that proves it. State plainly
anything that could not be verified — an unverified criterion is not a passing one.

---

## Notes for the implementer

**Deliberately NOT instrumented, and why** (do not "helpfully" add these):

- `board_created` / `task_created` — fully derivable from `boards.created_at` and
  `tasks.created_at`. Emitting them is pure duplication.
- Anything client-side or derived from `getBoardData` — `hooks/use-realtime.ts`
  re-invokes it on the client's own writes, on tab refocus, on `online`, and on every
  `SUBSCRIBED` reconnect. Any such event inflates without bound.
- Landing-page attribution, an in-app dashboard, error-rate telemetry — explicit
  non-goals in spec section 2.

**Known follow-ups surfaced by the spec but out of scope** (do not fix here; mention
them in the final report):

- `activity_logs` metadata drift: `createBoard` writes `metadata.boardTitle` while
  `activity-feed.tsx` reads `meta.title`, so board-created entries render as
  _"created board 'Untitled'"_.
- `CLAUDE.md`'s "Known Gaps" claims only `boardReducer` is tested; nine suites exist.
