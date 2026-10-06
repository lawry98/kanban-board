# CLAUDE.md — Real-Time Collaborative Kanban Board

## Project Overview

A real-time collaborative Kanban board built with Next.js, TypeScript, and Supabase Realtime: drag-and-drop task management, live sync via WebSockets, board membership/permissions, activity logging, and optimistic UI updates.

**Goal**: Clean, minimalist UI with solid functionality. Linear/Notion-inspired — polished and purposeful, not flashy.

> This document describes the codebase **as it actually is**. If you change a fact here (a path, a command, a convention), change it in the same commit as the code. A convention doc that lies is worse than no doc.

---

## Tech Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Framework        | Next.js 16 (App Router)                         |
| Language         | TypeScript (strict mode)                        |
| Styling          | Tailwind CSS v4                                 |
| UI Components    | shadcn/ui, Magic UI                             |
| State Management | React Context + `useReducer`                    |
| ORM              | Prisma 7 (driver adapter: `@prisma/adapter-pg`) |
| Database         | Supabase (PostgreSQL)                           |
| Realtime         | Supabase Realtime (`postgres_changes`)          |
| Auth             | Supabase Auth (`@supabase/ssr`, cookie-based)   |
| Validation       | Zod 4                                           |
| Testing          | Vitest + React Testing Library                  |
| Package Manager  | pnpm (via mise)                                 |
| Deployment       | Vercel                                          |
| Linting          | ESLint 9 (flat config) + Prettier               |
| Error monitoring | Sentry (`@sentry/nextjs`, inert without env)    |
| Scripts          | tsx (`pnpm db:seed`)                            |

---

## Project Structure

Code lives at the **repository root** — there is no `src/` directory. The `@/*` path alias maps to `./*` (see `tsconfig.json`).

```
app/                              # Next.js App Router
├── (auth)/                       # Auth route group (login, register, forgot/reset password, auth-code-error);
│                                 #   each page except login has a metadata-only layout.tsx setting its title;
│                                 #   login uses the group default "Sign In" from (auth)/layout.tsx
├── (dashboard)/                  # Protected route group
│   ├── board/[boardId]/          # Individual board view
│   └── boards/                   # Board listing
├── actions/                      # Server Actions (auth, board, column, task, invitation, analytics)
├── auth/callback/route.ts        # OAuth code-exchange callback
├── layout.tsx · page.tsx         # Root layout + landing page
├── error.tsx · global-error.tsx  # Error boundaries (both call Sentry.captureException)
├── not-found.tsx                 # Root 404 (also what signed-in users get for unknown routes)
components/
├── ui/                           # shadcn/ui + Magic UI primitives (generated — do not edit)
├── board/                        # Board feature: column, task-card, task-due-date, task-detail-dialog,
│                                 #   board-header, connection-indicator, activity-feed, add-column-button, create-board-dialog
├── landing/                      # Marketing sections
└── layout/                       # navbar, user-menu
contexts/board-context.tsx        # Board state: reducer + provider (exports `boardReducer`)
hooks/
├── use-realtime.ts               # Supabase Realtime subscription + resync; returns `RealtimeStatus`
├── use-today.ts                  # Viewer's local calendar day (null during SSR), rolls over at midnight
└── use-optimistic-update.ts      # Optimistic-update helper (exported; not yet wired in — see Known Gaps)
lib/
├── prisma.ts                     # Singleton Prisma client (PrismaPg adapter, SSL + pool config)
├── db-tls.ts                     # DB TLS policy + bundled Supabase Root 2021 CA
├── env.ts                        # Zod-validated environment variables (incl. optional Sentry DSNs)
├── sentry-options.ts             # Sentry init options shared by server/edge/client (what is NOT collected)
├── dates.ts                      # Due-date (calendar day) parse/format/isOverdue — pure, no I/O
├── invitations.ts                # Invite TTL, expiry and email-binding checks — pure, no I/O
├── rate-limit.ts                 # Postgres fixed-window limiter (`enforceRateLimit`); fails open
├── csp.ts                        # Per-request nonce Content-Security-Policy builder — pure
├── auth/require-access.ts        # Authorization guards + ActionResult + toActionError + logActivity
├── auth/redirects.ts             # ROUTES, DEFAULT_REDIRECT, `sanitizeNext` (the one `next`-param guard)
├── analytics/events.ts           # Closed AnalyticsEventInput union + dedupe-key builders (no I/O)
├── analytics/track.ts            # Server-only best-effort event emitter (never throws)
├── supabase/{client,server,middleware}.ts   # Auth + Realtime clients only
├── validations/{board,column,task,invitation,analytics}.ts   # Zod schemas
├── utils.ts · constants.ts
proxy.ts                          # Next 16 middleware (renamed from middleware.ts): route protection,
                                  #   per-request CSP + nonce, login `next` param
instrumentation.ts                # Next register(): loads sentry.server/edge config; exports onRequestError
instrumentation-client.ts         # Browser Sentry init (only when NEXT_PUBLIC_SENTRY_DSN is set)
sentry.{server,edge}.config.ts    # Server/edge Sentry init (only when a DSN is set)
scripts/db-seed.ts · scripts/seed/   # `pnpm db:seed` entry + demo-board data and insert-only seeder
types/{board,index}.ts            # Shared types (Prisma-derived — see Types)
prisma/{schema.prisma,migrations/,analytics/funnel.sql}   # funnel.sql is a hand-run read layer, not a migration
test/setup.ts                     # Vitest setup (jest-dom)
```

---

## Commands

```bash
# Development
pnpm dev                    # Dev server (next dev --turbopack). NOTE: does NOT run `prisma generate` —
                            #   run it once after install / after any schema change.
pnpm build                  # prisma generate && next build
pnpm start                  # Production server

# Code Quality
pnpm lint · pnpm lint:fix
pnpm format · pnpm format:check
pnpm typecheck              # tsc --noEmit

# Testing
pnpm test                   # vitest run (single pass — CI mode)
pnpm test:watch             # vitest (watch)
pnpm test:coverage          # vitest run --coverage

# Database (Prisma)
pnpm prisma generate        # Generate Prisma Client (required before first dev run)
pnpm prisma migrate dev     # Create + apply a migration in dev
pnpm prisma migrate deploy  # Apply migrations in production
pnpm prisma studio          # Prisma Studio GUI
pnpm prisma format          # Format schema.prisma

# Demo data (opt-in, inserts only — never updates or deletes)
ALLOW_DEMO_SEED=1 pnpm db:seed --email <email>     # or --user-id <uuid>; user must already exist
```

`pnpm db:seed` creates the "Demo — Website Launch" board (4 columns, 12 tasks) and is idempotent per user. The opt-in must be on the command line (it is checked before `.env.local` loads); the script prints the target DB host first, because a shell-exported `DATABASE_URL` beats `.env.local`. `pnpm prisma db seed` stays unconfigured — `pnpm db:seed` is the entry point.

CI (`.github/workflows/ci.yml`) runs `prisma generate` → typecheck → `lint --max-warnings=0` → `format:check` → test → `build` (placeholder env). Any lint warning fails CI.

`next.config.ts` sets `agentRules: false`: since Next 16.3, `next dev` otherwise writes a generated block into this file whenever it detects an AI agent. Keep it off.

---

## Code Style & Conventions

### TypeScript

- **Strict mode**. No `any` (rule is an error); if truly unavoidable, `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a reason.
- `interface` for object shapes; `type` for unions/intersections/utilities.
- `as const` for literal types.
- **Always type parameters and return types of exported functions.** Server Actions return `ActionResult<T>` (see below).
- Discriminated unions for state modeling.
- `import type { ... }` for type-only imports (enforced: `consistent-type-imports`).

### React & Next.js

- **Server Components by default.** Add `'use client'` only for interactivity, hooks, or browser APIs — keep it on the leaf, not high in the tree.
- Server Actions live in `app/actions/*.ts`.
- Use `<Image>`, `<Link>`, and the metadata API — never raw `<img>`, and never raw `<a>` for internal links (same-page `#hash` anchors are the accepted exception).
- Named exports for components; default exports only for Next.js page/layout/route files.
- One component per file; kebab-case filename ↔ PascalCase component (`task-card.tsx` → `TaskCard`).

### State Management

- React Context + `useReducer` for board state. `boardReducer` is exported from `contexts/board-context.tsx` and unit-tested.
- Actions are a discriminated union (`BoardAction` in `types/index.ts`). `BoardState` is `{ meta, columns, members }` — `meta` is the board's title and description; the header reads `meta.title` (the description is carried but not rendered). The `board` prop is only the server snapshot the reducer was seeded from, which Realtime does not keep current: use it for `id`. The reducer is pure; `SYNC_STATE` reconciles `meta`, columns and members by value/id and preserves unchanged object references so memoized cards can bail out of re-render.
- Optimistic updates: dispatch immediately, call the action, revert via `SYNC_STATE` on error. **Snapshot state at call time**, not render time.

### Naming

| Item             | Convention              | Example           |
| ---------------- | ----------------------- | ----------------- |
| Files & folders  | kebab-case              | `task-card.tsx`   |
| Components       | PascalCase              | `TaskCard`        |
| Hooks            | `use-` file → `useX`    | `use-realtime.ts` |
| Types/Interfaces | PascalCase              | `BoardState`      |
| Constants        | UPPER_SNAKE_CASE        | `MAX_COLUMNS`     |
| DB columns       | snake_case (via `@map`) | `created_at`      |

### Imports

- Absolute imports via `@/` (maps to repo root, `./*`).
- Group as React/Next → external → `@/` internal → relative → `import type`, separated by blank lines. **This ordering is a convention, not enforced** — `eslint-plugin-import` is not installed. Follow it by hand.

---

## Authorization (read this before touching `app/actions/`)

All authorization lives in **`lib/auth/require-access.ts`**. It is the _only_ thing protecting data on the Prisma path; RLS never runs there (grants + RLS guard only the Supabase Data API — see "Grants + RLS" below). Five rules:

1. **Never trust a parent id from the client. Derive it from the child row.** To act on a task, call `requireTaskAccess(taskId)` — it loads the task, derives `boardId` from it, and authorizes that. Do **not** accept a `boardId` parameter alongside a `taskId`/`columnId` and check the parent; that is the exact shape that produced four cross-board IDORs. Helpers: `requireBoardAccess`, `requireColumnAccess`, `requireTaskAccess`. When a second client-supplied id is genuinely needed (moving a task to a target column), prove it with `requireColumnOnBoard(columnId, boardId)`.
2. **Parse every input with Zod.** Client-data parameters are typed `unknown` on purpose and `.parse()`d at the top of the action — typing them as an input interface gives zero runtime safety across the Server Action boundary and misleads the reader. Schemas live in `lib/validations/`.
3. **Never leak raw errors.** Every `catch` returns `toActionError(context, err, fallback)`, which `console.error`s the real error server-side and returns a sanitized string. Raw Prisma/Zod text must never reach the client.
4. **`ActionResult<T> = { data: T } | { error: string }`** is the contract; annotate every action's return type. Activity logging goes through `logActivity()` — best-effort, never fails the mutation.
5. **Every mutation calls `enforceRateLimit(user.id, bucket)` (`lib/rate-limit.ts`) right after its guard**, keyed by user id, so a failed guard never counts. The standard bucket is `mutation` (120 per minute); `invitationCreate` (10 per hour), `invitationAccept` (10 per 10 min) and `memberAdd` (20 per hour) replace it for actions that hand out or redeem access. Reads (`getBoardData`, `getActivityLogs`, `getInvitations`) and `signOut` are not limited. Over the limit it throws `RateLimitError`, a `PublicError`, so `toActionError` passes its message through. It **fails open**: a limiter error is logged and the call proceeds. A new limit goes in `RATE_LIMITS`.

### Data Access Pattern (Server Action)

```typescript
'use server';

import { prisma } from '@/lib/prisma';
import {
  requireColumnAccess,
  toActionError,
  logActivity,
  EDITOR_ROLES,
  type ActionResult,
} from '@/lib/auth/require-access';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createTaskSchema } from '@/lib/validations/task';

export async function createTask(input: unknown): Promise<ActionResult<Task>> {
  try {
    const { columnId, title } = createTaskSchema.parse(input);
    // Board is derived from the column — the client cannot smuggle a foreign boardId.
    const { user, column } = await requireColumnAccess(columnId, EDITOR_ROLES);
    await enforceRateLimit(user.id, 'mutation');

    const task = await prisma.task.create({
      data: { columnId, boardId: column.boardId, title, createdBy: user.id, position: /* … */ },
    });

    await logActivity({ boardId: column.boardId, userId: user.id, action: 'TASK_CREATED', /* … */ });
    return { data: task };
  } catch (err) {
    return toActionError('createTask', err, 'Failed to create task');
  }
}
```

---

## Database & ORM (Prisma + Supabase)

| Concern             | Tool                  |
| ------------------- | --------------------- |
| All DB reads/writes | **Prisma**            |
| Authentication      | **Supabase Auth**     |
| Realtime sync       | **Supabase Realtime** |

**Never use `supabase.from('table').select()` for data.** The Supabase client is for Auth + Realtime only.

### Prisma client

`lib/prisma.ts` is a singleton using the `PrismaPg` driver adapter with explicit TLS verification and serverless pool sizing (`max: 1`). Supabase signs its pooler and direct-host certificates with a **private** root (Supabase Root 2021 CA) that is not in Node's trust store, so `lib/db-tls.ts` bundles that CA and pins it — without it every query fails with `self-signed certificate in certificate chain`. Never "fix" that error with `rejectUnauthorized: false`. Import `prisma` from `@/lib/prisma` everywhere — never `new PrismaClient()`. Server contexts only; never import it into a `'use client'` component.

The datasource connection is supplied by the adapter (`DATABASE_URL`) and by `prisma.config.ts` (`DIRECT_URL`) — the `schema.prisma` `datasource` block intentionally declares only `provider`.

### Schema conventions

- `schema.prisma` is the single source of truth. `@map`/`@@map` keep models PascalCase / tables snake_case.
- `createdAt`/`updatedAt` on every model where meaningful; explicit `@relation`; `@@index` on FKs and on `(parentId, position)` composites used for ordering.
- **`position` is `Float`** (fractional ordering): a move writes the midpoint between neighbours — a single-row update, no column-wide renumber. After ~50 repeated bisections into the same gap a rebalance would be needed; not yet implemented (fine at current scale).
- **`dueDate` is `@db.Date`** — a calendar day, not an instant. Clients send it as `YYYY-MM-DD` (`z.iso.date()`); Prisma models it as a `Date` at UTC midnight, which is what reaches the client, so go through `lib/dates.ts`: `parseCalendarDate` to write, `formatCalendarDate`/`formatDueDate` to read. Never `format(new Date(task.dueDate))` (local time shows the previous day west of UTC), and never compute "today" during render — `useToday()` is the viewer's local day and is `null` on the server.
- Migrations: `pnpm prisma migrate dev --name <descriptive-name>`. **Never edit an applied migration** — add a new one. Supabase-specific DDL (RLS, triggers, publication, `REPLICA IDENTITY`) is hand-written raw SQL in the migration.

### Realtime

`hooks/use-realtime.ts` subscribes per board — `tasks`, `columns` and `board_members` filtered `board_id=eq.<boardId>`, `boards` filtered `id=eq.<boardId>` — and, on any `postgres_changes` event, debounces (300 ms) and re-fetches the whole board via `getBoardData`, dispatching `SYNC_STATE` (columns, members, and `meta`, so a remote rename reaches the header). Syncs are sequence-numbered (a stale in-flight fetch cannot clobber newer state) and re-run on `SUBSCRIBED` (reconnect catch-up), tab refocus, and `online`. Deletes require `REPLICA IDENTITY FULL` (set in the migration) or their `board_id` filter never matches. The hook returns a `RealtimeStatus` (`connecting` until the first `SUBSCRIBED`, `live`, `reconnecting` during an outage; `navigator.onLine` false forces `reconnecting`) that `ConnectionIndicator` renders in the board header.

**A published table also needs `GRANT SELECT … TO authenticated`.** Realtime authorizes every `postgres_changes` event by running a SELECT as the _subscriber's_ role (`authenticated`) under RLS. Migration-created tables start with no grants, so without an explicit grant `authenticated` cannot read the table and **zero events are delivered** — writes commit, but collaborators see nothing until a manual refetch. The grants for `tasks`/`columns`/`board_members` are (re)asserted in `20261002053019_lock_down_data_api`; the `boards` grant lives in `20261006051512_publish_boards_realtime`, which sorts after the lockdown; RLS still gates which rows are visible. Publishing a new table: follow the rules under "Grants + RLS" below.

**The channel must join as the user, never as `anon`.** Realtime fixes a `postgres_changes` subscription's claims at join, so an anon join still reports `SUBSCRIBED` and then RLS silently drops every event. supabase-js makes that the default on a fresh page: `subscribe()` copies the socket's token into the join synchronously, before the client's async session lookup resolves, and with no session it falls back to the anon key. So the hook does `await supabase.auth.getSession()`, then `await supabase.realtime.setAuth(session.access_token)`, and only then subscribes. With no session it `console.error`s and waits. `onAuthStateChange` resubscribes when a session appears or the user changes; a same-user token refresh needs nothing, because supabase-js pushes it to the joined channel. `CHANNEL_ERROR`, `TIMED_OUT` and a server-initiated `CLOSED` (e.g. an expired JWT) tear the channel down and resubscribe with a fresh session after a capped backoff (1 s doubling to 30 s), with one toast per outage; refocus and `online` resubscribe at once. realtime-js disconnects the socket the moment its last channel is removed and silently drops a join sent while that disconnect is in flight, so the hook always has the next channel in place before it removes the old one. To check a live board, every `realtime.subscription` row for it must have `claims_role = authenticated` and a `claims->>'sub'`.

> Known limitation: a client's **own** writes echo back and trigger a resync (no origin filtering yet). The better design — server-emitted broadcast carrying an origin id, applied as a delta — is noted in the hook and deliberately out of scope for now.

### `analytics_events` — deliberately NOT published

`analytics_events` (`lib/analytics/track.ts`) is, like `rate_limits` below, deliberately not published: it does **not** follow the Realtime posture above. It is not in `supabase_realtime` and has RLS on with no policy and no grants (deny-all over the Data API), because Prisma (the `postgres` owner, `BYPASSRLS`) is its only reader and writer — nothing subscribes to it. Two more deliberate choices, so a future edit doesn't "fix" them into consistency with the rest of the schema: `board_id` carries **no foreign key**, so a board deletion (which cascades `invitations`/`board_members`/`columns`/`tasks`) cannot erase a churned cohort's activation history; `user_id` is `ON DELETE SET NULL`, so an erasure request leaves the events intact but unattributable rather than deleting them.

Two rules when adding an event: put its property keys in `EVENT_PROPERTY_KEYS` (`lib/analytics/events.ts`) — `trackEvent` picks against that allowlist at write time, so a key missing from it is silently dropped rather than persisted — and remember that `trackEvent` keeps a per-instance memo of `dedupe_key`s it has already written. The memo only skips provably redundant round-trips (the dashboard layout re-renders on every `revalidatePath` response, not just on navigation); the UNIQUE index on `dedupe_key` remains the actual correctness guarantee.

### `rate_limits` — deliberately NOT published

`rate_limits` (`lib/rate-limit.ts`) has the same posture as `analytics_events`: not published, RLS on with no policy and no grants, Prisma its only reader and writer, and only through `$queryRaw` (the atomic upsert-and-reset is raw SQL; the `RateLimit` model just keeps the table in the schema). One row per `(bucket, user_id)`, reset in place when its window lapses, so the table is bounded by users × buckets and needs no pruning. `user_id` carries **no foreign key** on purpose: an FK violation (a user acting before their `profiles` row exists) would make the fail-open limiter silently skip exactly that user. `window_start` is `timestamptz`, unlike the repo's `TIMESTAMP(3)` convention, so window arithmetic against `now()` doesn't depend on the pooler's session time zone.

### Grants + RLS — the Data API barrier

Three paths reach the database, and each has exactly one barrier:

| Path                                                     | Connects as                                                    | Its only barrier                                             |
| -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Prisma — every Server Action and Server Component        | `postgres` (table owner, `BYPASSRLS`)                          | the `require-access.ts` guards; grants and RLS never apply   |
| Supabase **Data API** — REST `/rest/v1`, GraphQL, `/rpc` | `anon` (the public anon key) or `authenticated` (a user's JWT) | **table grants + RLS**; Zod and the guards never run         |
| Realtime `postgres_changes`                              | `authenticated`                                                | `GRANT SELECT` + the SELECT policies (not on DELETE — below) |

The anon key ships in the browser bundle, so anyone can call the Data API, even though the app itself never does. `20261002053019_lock_down_data_api` and the migrations after it set the posture; keep it:

- `anon` holds no privilege on any `public` table or sequence.
- `authenticated` holds `SELECT` on `tasks`, `columns`, `board_members` and `boards` (the Realtime tables) and nothing else.
- RLS is on for every table and only `SELECT` policies exist. RLS with no policy (`invitations`, `analytics_events`, `rate_limits`, `_prisma_migrations`) is deny-all.
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` makes migration-created tables start with no grants. Supabase keeps the old defaults `FOR ROLE supabase_admin`, which a migration can't change, so create tables only through migrations.

When you add a table, enable RLS in the same migration and grant nothing. To publish it to Realtime, add `GRANT SELECT … TO authenticated` and a `SELECT` policy gated by `public.is_board_member(...)`, in a migration that sorts **after** the lockdown (the lockdown revokes grants made before it). Writes belong in Server Actions: a write grant or write policy reopens the path that skips Zod and the guards. A new `public` function is callable over `/rpc`, because Supabase's defaults still grant `EXECUTE` to `anon` and `authenticated` explicitly (`REVOKE … FROM PUBLIC` alone leaves those grants in place). Its migration should `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` and then grant back only what a policy needs. The two existing functions keep those grants because they're harmless over `/rpc`: `is_board_member` only reports the caller's own membership, and `handle_new_user` only runs as a trigger.

Realtime does not apply RLS to DELETE events (Postgres can't check a deleted row), so any signed-in subscriber whose filter matches gets them. With RLS on, the payload carries only the primary key, so a deleted row's id is the most that leaks.

In the dashboard (Integrations → Data API → Settings), keep `public` out of **Exposed schemas** and keep **Automatically expose new tables** off. That toggle is the default-privileges grant the lockdown removed, so turning it on undoes part of the lockdown. Both are defense in depth; the grants above are the barrier either way.

RLS is still not a second layer for Prisma traffic. Making it one would need a dedicated non-owner role and per-transaction JWT claims; that decision was deferred.

---

## Authentication

- `@supabase/ssr`, cookie-based. **Always `getUser()`** (server-verified) for authorization — never `getSession()`.
- Route protection is **deny-by-default** in `proxy.ts`: only `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PREFIXES` are open; everything else requires a session. Add a new dashboard route and it is protected automatically.
- The signed-in bounce off `/login` and `/register` in `proxy.ts` only fires on document requests (`GET`/`HEAD`, via `isDocumentRequest`): a Server Action POSTs to the current URL, and an unconditional bounce would silently 307 that POST away before its body ever ran. Deny-by-default above is unaffected — it stays method-agnostic, and `test/proxy.test.ts` pins both.
- `proxy.ts` sends a signed-out document request to `/login?next=<path+query>`, and the signed-in bounce off `/login` and `/register` honors a safe `next` (never another auth route). A Server Action POST gets no `next`.
- **`sanitizeNext` (`lib/auth/redirects.ts`) is the single `next`-param guard**, used by `proxy.ts`, the OAuth callback (`app/auth/callback/route.ts`) and the login/register pages. It accepts same-origin relative paths only: control characters and backslashes are rejected outright, the rest is origin-checked by parsing it as a URL, and the parser's normalised path is what gets used. Never concatenate a raw `next` into a redirect.
- Invite links expire 7 days after creation (`INVITATION_TTL_DAYS`; legacy rows with a null `expiresAt` lapse 7 days after `createdAt`). An invite bound to an `email` can only be accepted by a signed-in user whose confirmed email matches (`lib/invitations.ts`); nothing in the UI sets `email` yet.
- Env vars are validated in `lib/env.ts`; server-only secrets are never `NEXT_PUBLIC_`.

### Security headers & CSP

- Static headers (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy`) live in `next.config.ts`. The **CSP is per request**: `proxy.ts` builds it with `lib/csp.ts`, sets it on the response, and forwards it plus an `x-nonce` header to the render. **Never add a CSP in `next.config.ts`** — a static header has no nonce, and two CSP headers are both enforced.
- `script-src` is `'self'` + the request nonce + `'strict-dynamic'` (`'unsafe-eval'` in dev only). `style-src` keeps `'unsafe-inline'` with no nonce, on purpose: a nonce would void `'unsafe-inline'`, and sonner, Radix and `@hello-pangea/dnd` inject un-nonced `<style>` tags while SSR style attributes can't carry one. `connect-src` allows the Supabase origin over https and wss (Realtime). GitHub OAuth is a top-level navigation and needs no directive.
- The root layout reads `headers()` for the nonce, so **every route renders dynamically**: a prerendered page carries no nonce and `'strict-dynamic'` would block its scripts. Don't opt a route back into static rendering.
- **Mode: Report-Only.** `CSP_REPORT_ONLY = true` in `lib/csp.ts` selects the `Content-Security-Policy-Report-Only` header; `false` enforces it (and adds `upgrade-insecure-requests` in production). It ships Report-Only because no browser pass over every flow (auth, OAuth, board, drag-and-drop, Realtime, avatars) has been done. There is no `report-uri`, so violations show only in the browser console. Clickjacking stays covered by `X-Frame-Options: DENY`. `proxy.ts` strips client-sent CSP request headers before setting its own.
- A new inline script or third-party origin must be added to the builder in `lib/csp.ts`; `test/csp.test.ts` pins the policy.

---

## UI & Styling

- Clean and minimalist; generous whitespace; stick to the shadcn default theme. Subtle, purposeful motion only, and every animation must respect `prefers-reduced-motion`.
- Use the **shadcn MCP** and **Magic UI MCP** to look up component APIs before implementing — don't guess props. Install via `pnpm dlx shadcn@latest add <component>`.
- Primitives in `components/ui/` are generated — **do not edit them**; extend from elsewhere. They are excluded from lint/format.
- Always merge classes with `cn()` (`@/lib/utils`); use `cva` for variants.
- Mobile-first; `dark:` variants; avoid arbitrary values (`[123px]`) unless there's no token.

---

## Testing

- Tests live anywhere as `*.{test,spec}.{ts,tsx}` (Vitest `include` is repo-wide, excluding `node_modules`/`.next`). Setup: `test/setup.ts`. The `@` alias resolves to the repo root, matching `tsconfig`.
- Test behavior, not implementation: reducer transitions, hook side effects, validation schemas, pure utils. Mock Prisma via `vi.mock('@/lib/prisma')`. Action tests also stub `enforceRateLimit` (spread `importOriginal` so the real `RateLimitError` survives).
- Don't test shadcn/Magic UI primitives, Next internals, or the Supabase SDK itself.
- Highest-value targets: `boardReducer` (done), the action authorization branches, the Zod schemas, and the optimistic revert path.

---

## Error Handling

- `try/catch` every async op. Server Actions return `toActionError(...)`; components surface `{ error }` via `sonner` toasts and must not treat a failed load as an empty state.
- `console.error` for logging (the `no-console` rule allows `warn`/`error`). Never expose raw DB errors.
- **Sentry** (`@sentry/nextjs`): `toActionError` reports unexpected errors via `Sentry.captureException` (tag `action: context`) and flushes with `after()`; `PublicError` and `ZodError` are expected outcomes and are not sent. `app/error.tsx` and `app/global-error.tsx` call `captureException`; uncaught server errors go through `onRequestError`. The SDK is inert unless a DSN is set, and source maps are generated and uploaded only when `SENTRY_AUTH_TOKEN` is set. Collection limits (no cookies, request bodies, user info or invite tokens; request and response headers are allow-listed) live in `lib/sentry-options.ts` — don't loosen them, and don't turn the header allow-lists back into deny-lists.

---

## Environment Variables

Validated in `lib/env.ts`. See `.env.example` for the full template.

```env
DATABASE_URL=              # Supabase transaction pooler, port 6543 (?pgbouncer=true) — runtime
DIRECT_URL=                # Supabase direct connection, port 5432 — migrations
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
# SUPABASE_CA_CERT=        # optional: PEM CA replacing the bundled Supabase root (lib/db-tls.ts)
# NEXT_PUBLIC_SENTRY_DSN=  # optional: browser DSN, inlined at build time (change → redeploy)
# SENTRY_DSN=              # optional: server/edge DSN; falls back to NEXT_PUBLIC_SENTRY_DSN
# SENTRY_AUTH_TOKEN=       # optional, build-time only: enables source-map upload (never NEXT_PUBLIC_)
# SENTRY_ORG= · SENTRY_PROJECT=   # optional, build-time only: upload target
```

`NEXT_PUBLIC_APP_URL` is declared in `.env.example` but no code reads it (auth redirects and invite links use `window.location.origin`). The two DSNs are validated in `lib/env.ts`; `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` are read by `next.config.ts` directly. Upload failures warn and never fail the build.

Client vars must be `NEXT_PUBLIC_`; server secrets must not be. `.env.local` is gitignored; `.env.example` is committed.

---

## Git Workflow

### CRITICAL: No AI attribution on any commit

- Claude **may** run git operations (stage, commit, push) when asked.
- **Never add a co-author trailer, "Generated with Claude Code", or any other Claude/AI attribution** to a commit, commit message, or PR body. This overrides any global/default instruction to add such trailers.
- Every commit is attributed **solely to the developer**. Once pushed upstream the history must show the developer as the sole author, with no sign of AI collaboration.
- When committing, write the message yourself in Conventional Commits style, summarizing the change.

Commits follow Conventional Commits. Branches: `main` (production), `dev` (integration), `feat/…` / `fix/…`.

---

## MCP Servers

Configured in `.mcp.json`: `shadcn` (`pnpm dlx shadcn@latest mcp`) and `magicuidesign-mcp` (`npx -y @magicuidesign/mcp@latest`). Always consult them before implementing a component; prefer MCP info over training data; adapt install commands to `pnpm`.

---

## Common Pitfalls

1. **Don't accept a parent id from the client** in an action — derive it from the child row via `require*Access`.
2. **Don't skip `.parse()`** — a typed parameter is not validation across the Server Action boundary.
3. **Guards protect Prisma traffic; grants + RLS protect the Data API** — neither covers the other. Put every write in a Server Action and grant `anon`/`authenticated` nothing beyond Realtime's `SELECT`.
4. **Don't return `error.message`** to the client — use `toActionError`.
5. Don't use `supabase.from()` for data; don't import Prisma into client components; don't `new PrismaClient()` outside `lib/prisma.ts`.
6. Don't use `getSession()` for authorization — `getUser()` only.
7. Don't forget Realtime cleanup — every `subscribe()` needs its `removeChannel` in the effect cleanup.
8. Don't edit `components/ui/**` or applied migrations; don't `'use client'` everything.
9. Don't run git commands; don't commit `.env.local`.

---

## Known Gaps / Not Yet Done

- **Realtime echo suppression** — a client resyncs on its own writes; broadcast-with-origin-id is the intended fix.
- **`useOptimisticUpdate`** is correct and exported but not yet wired into `board-view.tsx`, which still hand-rolls its revert.
- **Test coverage is minimal** — `boardReducer`, `useRealtime`, the board header and connection indicator, the activity feed, the analytics event/dedupe helpers, `proxy`'s route-protection (incl. unknown routes passing through to the 404 when signed in), login `next` handling and CSP headers, the CSP builder, the rate limiter, invite expiry/email binding, board-page metadata, the DB TLS policy, due-date handling (helpers, schema, task actions, dialog, card — pinned per time zone via `test/time-zone.ts`), the demo seed, Sentry env parsing, `toActionError` reporting, the 404 page, both error boundaries and the auth page titles are covered; most Server Actions and components are not.
- **Browser tab title doesn't follow a live rename** — it comes from `generateMetadata` in `app/(dashboard)/board/[boardId]/page.tsx`, which is server-rendered.
- **CSP is Report-Only, not enforced** — flip `CSP_REPORT_ONLY` in `lib/csp.ts` after a browser pass over every flow finds no violations; see "Security headers & CSP".
- **RLS is not a second layer for Prisma traffic** — see "Grants + RLS" for what promoting it would require.
- **`pnpm audit --prod` is not clean** — 2 high (`mysql2`, `deepmerge-ts`) remain, both pinned exactly by the Prisma 7 CLI. `prisma` is a devDependency that `--prod` reaches only through `@prisma/client`'s optional peer; the app never loads it at runtime. 7.10.0 is the newest 7.x (Prisma 8 is still in RC), so they stay until a Prisma release moves the pins. Don't paper over them with `overrides`.
