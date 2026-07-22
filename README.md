# Kanban Board

A real-time collaborative Kanban board — drag-and-drop task management with live multi-user sync, board membership and permissions, and activity logging.

Built with Next.js 16 (App Router), TypeScript, Prisma 7, and Supabase (Postgres, Auth, Realtime). Styled with Tailwind v4 and shadcn/ui.

## Architecture at a glance

- **Data**: all reads/writes go through **Prisma**. Supabase is used only for **Auth** (`@supabase/ssr`, cookie-based) and **Realtime** (`postgres_changes`).
- **Mutations**: Server Actions in `app/actions/`, each Zod-validated and authorized through `lib/auth/require-access.ts`. That guard layer is the sole authorization boundary for application data.
- **State**: React Context + `useReducer` (`contexts/board-context.tsx`) with optimistic updates; `hooks/use-realtime.ts` keeps clients in sync.

For conventions and the reasoning behind the authorization model, read [`CLAUDE.md`](./CLAUDE.md).

## Prerequisites

- [mise](https://mise.jdx.dev/) — pins the toolchain (see `mise.toml`): Node 24.17.0, pnpm 11.8.0. Run `mise install` once.
  (Or install Node ≥24 and pnpm 11 yourself.)
- A [Supabase](https://supabase.com/) project (or the Supabase CLI for a local stack).

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
#    then fill in the values (see below)

# 3. Generate the Prisma client (dev does NOT do this for you)
pnpm prisma generate

# 4. Apply the database schema + RLS/Realtime migration
pnpm prisma migrate deploy      # or `pnpm prisma migrate dev` while iterating

# 5. Start the dev server
pnpm dev                        # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable                        | Purpose                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Runtime connection — Supabase **transaction pooler**, port 6543 (`?pgbouncer=true`) |
| `DIRECT_URL`                    | Migrations — Supabase **direct** connection, port 5432                              |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (Auth + Realtime)                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                                                                   |
| `NEXT_PUBLIC_APP_URL`           | App origin, e.g. `http://localhost:3000`                                            |
| `SUPABASE_CA_CERT`              | Optional — PEM CA for the legacy direct-connection certificate                      |

Values are validated at startup by `lib/env.ts`, so a missing variable fails fast with a clear message.

### Supabase configuration

In the Supabase dashboard, add your callback URL to the Auth redirect allowlist so `/auth/callback` completes the OAuth code exchange:

```
http://localhost:3000/auth/callback        # and your production URL
```

## Quality gates

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm format:check     # prettier --check
pnpm test             # vitest run
```

All four run in CI (`.github/workflows/ci.yml`) on push and pull request.

## Deployment

Deploys to Vercel. `pnpm build` runs `prisma generate && next build`. Set the environment variables in the Vercel project, point `DATABASE_URL` at the transaction pooler, and set the Node version to 24.x. Run `pnpm prisma migrate deploy` against the production database as part of your release process.
