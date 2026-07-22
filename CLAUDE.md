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

---

## Project Structure

Code lives at the **repository root** — there is no `src/` directory. The `@/*` path alias maps to `./*` (see `tsconfig.json`).

```
app/                              # Next.js App Router
├── (auth)/                       # Auth route group (login, register)
├── (dashboard)/                  # Protected route group
│   ├── board/[boardId]/          # Individual board view
│   └── boards/                   # Board listing
├── actions/                      # Server Actions (auth, board, column, task)
├── auth/callback/route.ts        # OAuth code-exchange callback
├── layout.tsx · page.tsx         # Root layout + landing page
components/
├── ui/                           # shadcn/ui + Magic UI primitives (generated — do not edit)
├── board/                        # Board feature: column, task-card, task-detail-dialog,
│                                 #   board-header, activity-feed, add-column-button, create-board-dialog
├── landing/                      # Marketing sections
└── layout/                       # navbar, user-menu
contexts/board-context.tsx        # Board state: reducer + provider (exports `boardReducer`)
hooks/
├── use-realtime.ts               # Supabase Realtime subscription + resync
└── use-optimistic-update.ts      # Optimistic-update helper (exported; not yet wired in — see Known Gaps)
lib/
├── prisma.ts                     # Singleton Prisma client (PrismaPg adapter, SSL + pool config)
├── env.ts                        # Zod-validated environment variables
├── auth/require-access.ts        # Authorization guards + ActionResult + toActionError + logActivity
├── supabase/{client,server,middleware}.ts   # Auth + Realtime clients only
├── validations/{board,column,task}.ts       # Zod schemas
├── utils.ts · constants.ts
proxy.ts                          # Next 16 middleware (renamed from middleware.ts): route protection
types/{board,index}.ts            # Shared types (Prisma-derived — see Types)
prisma/{schema.prisma,migrations/}
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
```

There is **no seed script** — `pnpm prisma db seed` is not configured (see Known Gaps).

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
- Actions are a discriminated union (`BoardAction` in `types/index.ts`). The reducer is pure; `SYNC_STATE` reconciles by id and preserves unchanged object references so memoized cards can bail out of re-render.
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

All authorization lives in **`lib/auth/require-access.ts`**. It is the _only_ thing protecting application data (RLS does not — see below). Four rules:

1. **Never trust a parent id from the client. Derive it from the child row.** To act on a task, call `requireTaskAccess(taskId)` — it loads the task, derives `boardId` from it, and authorizes that. Do **not** accept a `boardId` parameter alongside a `taskId`/`columnId` and check the parent; that is the exact shape that produced four cross-board IDORs. Helpers: `requireBoardAccess`, `requireColumnAccess`, `requireTaskAccess`. When a second client-supplied id is genuinely needed (moving a task to a target column), prove it with `requireColumnOnBoard(columnId, boardId)`.
2. **Parse every input with Zod.** Client-data parameters are typed `unknown` on purpose and `.parse()`d at the top of the action — typing them as an input interface gives zero runtime safety across the Server Action boundary and misleads the reader. Schemas live in `lib/validations/`.
3. **Never leak raw errors.** Every `catch` returns `toActionError(context, err, fallback)`, which `console.error`s the real error server-side and returns a sanitized string. Raw Prisma/Zod text must never reach the client.
4. **`ActionResult<T> = { data: T } | { error: string }`** is the contract; annotate every action's return type. Activity logging goes through `logActivity()` — best-effort, never fails the mutation.

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
import { createTaskSchema } from '@/lib/validations/task';

export async function createTask(input: unknown): Promise<ActionResult<Task>> {
  try {
    const { columnId, title } = createTaskSchema.parse(input);
    // Board is derived from the column — the client cannot smuggle a foreign boardId.
    const { user, column } = await requireColumnAccess(columnId, EDITOR_ROLES);

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

`lib/prisma.ts` is a singleton using the `PrismaPg` driver adapter with explicit TLS verification and serverless pool sizing (`max: 1`). Import `prisma` from `@/lib/prisma` everywhere — never `new PrismaClient()`. Server contexts only; never import it into a `'use client'` component.

The datasource connection is supplied by the adapter (`DATABASE_URL`) and by `prisma.config.ts` (`DIRECT_URL`) — the `schema.prisma` `datasource` block intentionally declares only `provider`.

### Schema conventions

- `schema.prisma` is the single source of truth. `@map`/`@@map` keep models PascalCase / tables snake_case.
- `createdAt`/`updatedAt` on every model where meaningful; explicit `@relation`; `@@index` on FKs and on `(parentId, position)` composites used for ordering.
- **`position` is `Float`** (fractional ordering): a move writes the midpoint between neighbours — a single-row update, no column-wide renumber. After ~50 repeated bisections into the same gap a rebalance would be needed; not yet implemented (fine at current scale).
- Migrations: `pnpm prisma migrate dev --name <descriptive-name>`. **Never edit an applied migration** — add a new one. Supabase-specific DDL (RLS, triggers, publication, `REPLICA IDENTITY`) is hand-written raw SQL in the migration.

### Realtime

`hooks/use-realtime.ts` subscribes per board and, on any `postgres_changes` event, debounces (300 ms) and re-fetches the whole board via `getBoardData`, dispatching `SYNC_STATE`. Syncs are sequence-numbered (a stale in-flight fetch cannot clobber newer state) and re-run on `SUBSCRIBED` (reconnect catch-up), tab refocus, and `online`. Deletes require `REPLICA IDENTITY FULL` (set in the migration) or their `board_id` filter never matches.

> Known limitation: a client's **own** writes echo back and trigger a resync (no origin filtering yet). The better design — server-emitted broadcast carrying an origin id, applied as a delta — is noted in the hook and deliberately out of scope for now.

### Row Level Security — what it does and does NOT do

**RLS does not protect application data.** Prisma connects as the `postgres` role, which owns the tables and has `BYPASSRLS`, so no policy is ever evaluated for app traffic. The RLS policies exist for **one** reason: to let Supabase Realtime authorize `postgres_changes`. Authorization for all reads and writes is the `require-access.ts` guards and nothing else. Do not add a policy and assume it defends anything at the query layer — it doesn't. (Making RLS a real second layer would require a dedicated non-superuser role and per-transaction JWT claims; that decision was deferred.)

---

## Authentication

- `@supabase/ssr`, cookie-based. **Always `getUser()`** (server-verified) for authorization — never `getSession()`.
- Route protection is **deny-by-default** in `proxy.ts`: only `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PREFIXES` are open; everything else requires a session. Add a new dashboard route and it is protected automatically.
- The OAuth callback (`app/auth/callback/route.ts`) only accepts same-origin relative `next` targets (open-redirect guard).
- Env vars are validated in `lib/env.ts`; server-only secrets are never `NEXT_PUBLIC_`.

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
- Test behavior, not implementation: reducer transitions, hook side effects, validation schemas, pure utils. Mock Prisma via `vi.mock('@/lib/prisma')`.
- Don't test shadcn/Magic UI primitives, Next internals, or the Supabase SDK itself.
- Highest-value targets: `boardReducer` (done), the action authorization branches, the Zod schemas, and the optimistic revert path.

---

## Error Handling

- `try/catch` every async op. Server Actions return `toActionError(...)`; components surface `{ error }` via `sonner` toasts and must not treat a failed load as an empty state.
- `console.error` for logging (the `no-console` rule allows `warn`/`error`). Never expose raw DB errors.

---

## Environment Variables

Validated in `lib/env.ts`. See `.env.example` for the full template.

```env
DATABASE_URL=              # Supabase transaction pooler, port 6543 (?pgbouncer=true) — runtime
DIRECT_URL=                # Supabase direct connection, port 5432 — migrations
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
# SUPABASE_CA_CERT=        # optional: PEM CA for the legacy direct-connection cert
```

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
3. **Don't assume RLS protects data** — it doesn't; the guards do.
4. **Don't return `error.message`** to the client — use `toActionError`.
5. Don't use `supabase.from()` for data; don't import Prisma into client components; don't `new PrismaClient()` outside `lib/prisma.ts`.
6. Don't use `getSession()` for authorization — `getUser()` only.
7. Don't forget Realtime cleanup — every `subscribe()` needs its `removeChannel` in the effect cleanup.
8. Don't edit `components/ui/**` or applied migrations; don't `'use client'` everything.
9. Don't run git commands; don't commit `.env.local`.

---

## Known Gaps / Not Yet Done

- **No seed script** — `pnpm prisma db seed` is unconfigured; a fresh DB comes up empty.
- **Realtime echo suppression** — a client resyncs on its own writes; broadcast-with-origin-id is the intended fix.
- **`useOptimisticUpdate`** is correct and exported but not yet wired into `board-view.tsx`, which still hand-rolls its revert.
- **Test coverage is minimal** — only `boardReducer` is covered so far.
- **No Content-Security-Policy** — needs a per-request nonce in `proxy.ts` (see the TODO in `next.config.ts`).
- **RLS is not a real authorization layer** — see the RLS section for what promoting it would require.
- CI runs lint without `--max-warnings=0`; turn that on once any remaining warnings are cleared.
