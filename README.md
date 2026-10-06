# Kanban Board

A real-time collaborative Kanban board — drag-and-drop task management with live multi-user sync, board membership and permissions, and activity logging.

Built with Next.js 16 (App Router), TypeScript, Prisma 7, and Supabase (Postgres, Auth, Realtime). Styled with Tailwind v4 and shadcn/ui.

## Live demo

> **Placeholder:** there is no deployment yet. `YOUR-APP` and `YOUR-INVITE-TOKEN` below are stand-ins. Replace them after the first deploy (see the [deploy checklist](#deploy-checklist)).

<!-- TODO: replace the two placeholders below once the app is deployed and the invite link exists. -->

- App: `https://YOUR-APP.vercel.app` _(placeholder — replace after first deploy)_
- Demo invite link: `https://YOUR-APP.vercel.app/join/YOUR-INVITE-TOKEN` _(placeholder — replace with the Editor link from the maintainer steps below)_

### How a reviewer gets in

1. Open the app and create an account at `/register` (name, email, password), or use **Continue with GitHub**. The demo does not send confirmation emails: you are signed in straight away and land on `/boards`, or back on the invite if you came from it.
2. Open the demo invite link and click **Join board**. You join "Demo — Website Launch" as an **Editor**. Opening the link while signed out also works: it offers **Sign in** and **Create an account** and brings you back to the invite. Prefer your own data? Skip the link and create a board from `/boards`.
3. Open the board in two browser windows (a private window signed in as a second account shows it best). Move a card or edit a task in one; the other updates within a second or two.

The demo board is shared by every reviewer. Edits are last-write-wins: if two people change the same field, the later save overwrites the earlier one, and you may find cards moved or renamed by someone else.

**Other demo members see your name and email.** They appear in the board's member list, in the assignee picker, and in the activity feed (`added <email> as editor`). With GitHub sign-in that is your GitHub name, email and avatar. If that bothers you, sign up with an alias address, or skip the invite and create your own board.

### Maintainer: create the demo board and invite link

1. Sign up in the deployed app with your own account (the seed only populates an existing user).
2. Run the seed against the production database (see [Demo data](#demo-data)):
   ```bash
   DATABASE_URL='<production pooler URL>' ALLOW_DEMO_SEED=1 pnpm db:seed --email <your email>
   ```
   An inline `DATABASE_URL=…` lands in your shell history. To avoid that, `export` it first from a file or a password manager and drop the inline value; `unset DATABASE_URL` afterwards, or later commands in that shell hit production. Or prefix the command with a space, if your shell ignores such lines (zsh `setopt HIST_IGNORE_SPACE`, bash `HISTCONTROL=ignorespace`).
3. Open "Demo — Website Launch", click **Share**, stay on the **Invite link** tab, leave the role on **Editor — can create and edit tasks**, and click **Create link**. Copy the link with the copy icon and paste it into this README. The link is public by design, so anyone who reads this README can join. If someone vandalises the board, revoke the link from the same dialog, reset the board (see [Demo data](#demo-data)) and publish a new link.

## Screenshots

<!-- TODO: capture these (the seeded demo board has good content), save them under docs/screenshots/, then replace each line below with an image tag: ![alt text](docs/screenshots/<file>.png) -->

_Screenshot placeholder: board view — add `docs/screenshots/board.png`_

_Screenshot placeholder: task detail dialog — add `docs/screenshots/task-detail.png`_

_Screenshot placeholder: live sync in two windows — add `docs/screenshots/live-sync.png`_

_Screenshot placeholder: mobile — add `docs/screenshots/mobile.png`_

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

# 6. Optional: sign up in the app, then load the demo board (see "Demo data")
ALLOW_DEMO_SEED=1 pnpm db:seed --email you@example.com
```

### Environment variables (`.env.local`)

| Variable                        | Purpose                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                  | Runtime connection — Supabase **transaction pooler**, port 6543 (`?pgbouncer=true`)        |
| `DIRECT_URL`                    | Migrations — Supabase **direct** connection, port 5432                                     |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (Auth + Realtime)                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                                                                          |
| `NEXT_PUBLIC_APP_URL`           | App origin, e.g. `http://localhost:3000`. Listed in `.env.example`; no code reads it today |
| `SUPABASE_CA_CERT`              | Optional — PEM CA for the legacy direct-connection certificate                             |
| `NEXT_PUBLIC_SENTRY_DSN`        | Optional — Sentry DSN for the browser. Inlined at build time                               |
| `SENTRY_DSN`                    | Optional — Sentry DSN for server and edge; falls back to `NEXT_PUBLIC_SENTRY_DSN`          |
| `SENTRY_AUTH_TOKEN`             | Optional, build time only — uploads source maps. Never prefix with `NEXT_PUBLIC_`          |
| `SENTRY_ORG`, `SENTRY_PROJECT`  | Optional, build time only — Sentry org and project slugs the source maps go to             |

Values are validated at startup by `lib/env.ts`, so a missing required variable fails fast with a clear message. The three build-time `SENTRY_*` values are read by `next.config.ts` and are not validated there. See [Error monitoring](#error-monitoring-optional).

### Supabase configuration

In the Supabase dashboard (Authentication → URL Configuration), add `http://localhost:3000/**` to the Redirect URLs so email links and OAuth return to your dev server through `/auth/callback`. Production and preview URLs are covered in the [deploy checklist](#deploy-checklist).

## Demo data

`pnpm db:seed` creates one board for an existing user:

- Title "Demo — Website Launch", with that user as its owner.
- 4 columns (To Do, In Progress, Review, Done) and 12 tasks.
- Tasks carry labels and priorities, most have a due date set relative to the day you run the seed (a few are overdue on purpose), and 7 of the 12 are assigned to the target user.
- A matching activity feed. No analytics events are written, so seeded data does not count as product activation.

Pick the user with exactly one of:

```bash
ALLOW_DEMO_SEED=1 pnpm db:seed --email you@example.com
ALLOW_DEMO_SEED=1 pnpm db:seed --user-id <uuid>
```

- **Opt-in.** `ALLOW_DEMO_SEED=1` must be on the command line. The script checks it before `.env.local` loads, so a value in that file does not count. Without it the script refuses to run.
- **Target database.** The first line it prints (to stderr) is `Seeding database at <host>:<port>`. A `DATABASE_URL` exported in your shell or set inline beats `.env.local`, so check that line before trusting the target. `.env.local` must still provide the two `NEXT_PUBLIC_SUPABASE_*` values, which `lib/env.ts` validates on import.
- **The user must already exist.** Sign up in the app first; otherwise the script reports `No profile found` and writes nothing.
- **Idempotent.** It only inserts. If that user already has a board titled "Demo — Website Launch", the script prints `Demo board already exists: <id> (nothing written).` and stops. A fresh run prints `Created demo board <id> with 4 columns and 12 tasks.` It never updates or deletes a row.
- **Reset.** As the owner, open the board's `⋯` menu, choose **Delete board**, then run the seed again. Deleting a board also deletes its invite links, so create a new one and update the README.

`pnpm prisma db seed` is not configured; `pnpm db:seed` is the entry point.

## Error monitoring (optional)

Sentry covers the server, edge and browser. It is inert only when no DSN and no `SENTRY_AUTH_TOKEN` are set: without a DSN the SDK is never initialised, without the token no source maps are generated or uploaded, and with neither `pnpm build` passes unchanged. A token on its own still generates and uploads source maps.

| Variable                 | Effect                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN` | Turns on browser reporting. Inlined into the client bundle at build time: change it, then redeploy     |
| `SENTRY_DSN`             | Turns on server and edge reporting. Falls back to `NEXT_PUBLIC_SENTRY_DSN`, so one value can serve all |
| `SENTRY_AUTH_TOKEN`      | Enables source-map upload during `next build`. Without it no source maps are generated or uploaded     |
| `SENTRY_ORG`             | Sentry org slug for the upload (used with the token)                                                   |
| `SENTRY_PROJECT`         | Sentry project slug for the upload (used with the token)                                               |

- **What is reported:** uncaught server errors, unexpected errors caught by Server Actions (`toActionError` in `lib/auth/require-access.ts`; expected outcomes such as validation failures and "Forbidden" are not sent), and the error boundaries (`app/error.tsx`, `app/global-error.tsx`). Traces are sampled at 10% in production. There is no Session Replay.
- **Privacy:** cookies, request bodies, user info and invite tokens are kept out of Sentry events, and only an allow-list of request and response headers (such as `user-agent` and `content-type`) is sent. The options live in `lib/sentry-options.ts`.
- **Build failures:** if the source-map upload fails (bad token, Sentry outage), the build logs `Sentry build step failed (continuing)` as a warning and carries on. The generated source maps are deleted from the build output once the upload step finishes, whether it succeeded or failed, so none are served publicly.

## Quality gates

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm format:check     # prettier --check
pnpm test             # vitest run
```

All four run in CI (`.github/workflows/ci.yml`) on push and pull request.

## Deploy checklist

Target: Vercel, with Supabase for the database and auth. Do these in order.

1. **Import the repo** into Vercel as a Next.js project. In the project settings set the Node.js version to **24.x**. The build command stays `pnpm build` (`prisma generate && next build`); it does not run migrations.
2. **Add environment variables** (Project → Settings → Environment Variables), scoped as below. `NEXT_PUBLIC_*` values are inlined into the bundle at build time, so changing one needs a new deployment.

   | Variable                        | Required | Environments        | Notes                                                                                          |
   | ------------------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                  | Yes      | Production, Preview | Transaction pooler, port 6543, ending `?pgbouncer=true`                                        |
   | `DIRECT_URL`                    | Yes      | Production, Preview | Port 5432. Read by `prisma.config.ts` during `prisma generate`, so the build needs it defined  |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Production, Preview | Inlined at build time                                                                          |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Production, Preview | Inlined at build time                                                                          |
   | `NEXT_PUBLIC_APP_URL`           | No       | Production          | In `.env.example` but unused by code. Auth redirects and invite links use the browser's origin |
   | `SUPABASE_CA_CERT`              | No       | Production, Preview | Only if Supabase rotates its root CA or you use a non-Supabase Postgres                        |
   | `NEXT_PUBLIC_SENTRY_DSN`        | No       | Production          | Add to Preview only if you want preview errors reported. Inlined at build time                 |
   | `SENTRY_DSN`                    | No       | Production          | Server and edge. Falls back to `NEXT_PUBLIC_SENTRY_DSN`                                        |
   | `SENTRY_AUTH_TOKEN`             | No       | Production          | Build time only. Mark it Sensitive. Without it, no source maps are uploaded                    |
   | `SENTRY_ORG`, `SENTRY_PROJECT`  | No       | Production          | Build time only                                                                                |

   Preview deployments read the Preview-scoped values. If those point at the production database, previews read and write production data.

3. **Apply migrations** to the production database before the first deploy, and before any release that adds a migration. They include the RLS, grants and Realtime publication setup, without which live sync delivers no events.

   ```bash
   DIRECT_URL='<production direct URL>' pnpm prisma migrate deploy
   ```

   The shell-history advice under [the seed command](#maintainer-create-the-demo-board-and-invite-link) applies here too.

   If the direct host (`db.<ref>.supabase.co`) is IPv6-only and your network has no IPv6 route, use the session pooler instead: the same pooler host as `DATABASE_URL`, port 5432, without the query string. `prisma.config.ts` does not override a `DIRECT_URL` that is already set in your shell.

4. **Configure Supabase Auth** (Authentication → URL Configuration):
   - Site URL: `https://<prod-domain>`
   - Redirect URLs (one entry each):
     - `https://<prod-domain>/**`
     - `https://*-<vercel-team-slug>.vercel.app/**` for preview deployments
     - `http://localhost:3000/**` for local development

   In these patterns `*` matches any run of characters except `.` and `/`, and `**` matches anything. So the preview pattern matches one hostname label such as `<project>-<hash>-<team-slug>.vercel.app` and every path and query beneath it. The sign-in, register and forgot-password pages build their redirect from `window.location.origin` and append `?next=…` to `/auth/callback`, so any domain on the list works without code or env changes. Email links and GitHub sign-in only return to a domain that is on the list. Supabase recommends the exact callback path rather than `**` for the production entry; if you narrow it, re-test password reset, GitHub sign-in and, if you kept it on, the confirmation email.

   Source: Supabase docs, [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) (sections "Use wildcards in redirect URLs" and "Vercel preview URLs").

5. **Turn off email confirmation** for the demo project: Authentication → Sign In / Providers → Email, switch off **Confirm email**, save. Supabase's built-in email sender only delivers to members of the project's organization (anyone else gets `Email address not authorized`) and sends only a few messages per hour, so reviewers could never confirm an account. With confirmation off, sign-up returns a session and the register page sends the user straight to `/boards`, or back to the invite when they came from one.
   - Trade-off: email addresses are not verified, so anyone can register with any address.
   - Alternative: keep **Confirm email** on and set up custom SMTP on the Authentication → [Custom SMTP](https://supabase.com/dashboard/project/_/auth/smtp) page.
   - Without custom SMTP, password-reset emails also reach organization members only.

   Source: Supabase docs, [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [General configuration](https://supabase.com/docs/guides/auth/general-configuration) ("Confirm Email").

6. **Enable GitHub sign-in.** The login and register pages offer **Continue with GitHub**, which fails until the provider is enabled.
   - In GitHub (Settings → Developer settings → OAuth Apps → New OAuth App), set the Homepage URL to `https://<prod-domain>` and the Authorization callback URL to `https://<project-ref>.supabase.co/auth/v1/callback`. That is Supabase's callback, not the app's `/auth/callback`; Supabase shows the exact value on the GitHub provider panel. Generate a client secret.
   - In Supabase (Authentication → Sign In / Providers → GitHub), enable the provider and paste the client ID and secret.

   Source: Supabase docs, [Login with GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github).

7. **Deploy**, then set the real URL in the [Live demo](#live-demo) section above.
8. **Create the demo board and invite link.** Sign up on the deployed app, then follow [Maintainer: create the demo board and invite link](#maintainer-create-the-demo-board-and-invite-link).
9. **Smoke test** on the deployed URL:
   - Sign up at `/register` with a fresh address: you land on `/boards` with no confirmation email.
   - Sign in with GitHub in a private window and land on `/boards`.
   - While signed in, open `/does-not-exist`: the "Page not found" page renders.
   - Open the demo board in two windows and edit a task in one; the other updates.
   - Open the invite link in a private window: it shows the join prompt for the demo board.
