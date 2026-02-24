# CLAUDE.md — Real-Time Collaborative Kanban Board

## Project Overview

A real-time collaborative Kanban board built with Next.js, TypeScript, and Supabase Realtime. Features include drag-and-drop task management, real-time synchronization via WebSockets, user permissions, activity logging, and optimistic UI updates.

**Goal**: Clean, minimalist UI with solid functionality. Think Linear/Notion-inspired — not flashy, but polished and purposeful.

---

## Tech Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Framework        | Next.js 15+ (App Router)                        |
| Language         | TypeScript (strict mode)                        |
| Styling          | Tailwind CSS v4                                 |
| UI Components    | shadcn/ui, shadcnblocks.com, Magic UI           |
| State Management | React Context + useReducer                      |
| ORM              | Prisma (type-safe DB access)                    |
| Database         | Supabase (PostgreSQL)                           |
| Realtime         | Supabase Realtime (WebSocket channels)          |
| Auth             | Supabase Auth (email/password + OAuth)          |
| Testing          | Vitest + React Testing Library                  |
| Package Manager  | pnpm                                            |
| Deployment       | Vercel                                          |
| Linting          | ESLint 9 (flat config) + Prettier               |

---

## Project Structure

```
prisma/
├── schema.prisma                 # Prisma schema (single source of truth for DB)
├── migrations/                   # Auto-generated migration files
└── seed.ts                       # Database seed script
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (login, register)
│   ├── (dashboard)/              # Protected route group
│   │   ├── board/[boardId]/      # Individual board view
│   │   └── boards/               # Board listing
│   ├── api/                      # API routes (if needed)
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing / redirect
├── components/
│   ├── ui/                       # shadcn/ui primitives (auto-generated)
│   ├── magicui/                  # Magic UI components (auto-generated)
│   ├── board/                    # Board-specific components
│   │   ├── board-header.tsx
│   │   ├── column.tsx
│   │   ├── task-card.tsx
│   │   ├── task-dialog.tsx
│   │   └── drag-overlay.tsx
│   ├── layout/                   # Shell, sidebar, navbar
│   └── shared/                   # Reusable non-UI logic components
├── contexts/                     # React Context providers
│   ├── auth-context.tsx
│   └── board-context.tsx
├── hooks/                        # Custom hooks
│   ├── use-realtime.ts           # Supabase Realtime subscription
│   ├── use-optimistic-update.ts  # Optimistic UI logic
│   └── use-board.ts              # Board CRUD operations
├── lib/
│   ├── prisma.ts                 # Singleton Prisma client instance
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client (Auth + Realtime only)
│   │   ├── server.ts             # Server Supabase client (Auth only)
│   │   └── middleware.ts         # Auth middleware helper
│   ├── utils.ts                  # General utilities (cn, etc.)
│   └── constants.ts              # App-wide constants
├── types/                        # Shared TypeScript types/interfaces
│   ├── board.ts
│   ├── task.ts
│   └── user.ts
└── __tests__/                    # Test files mirroring src structure
```

---

## Commands

```bash
# Development
pnpm dev                    # Start dev server (next dev --turbopack)
pnpm build                  # Production build
pnpm start                  # Start production server

# Code Quality
pnpm lint                   # Run ESLint
pnpm lint:fix               # Run ESLint with auto-fix
pnpm format                 # Run Prettier
pnpm format:check           # Check Prettier formatting
pnpm typecheck              # Run tsc --noEmit

# Testing
pnpm test                   # Run Vitest
pnpm test:watch             # Run Vitest in watch mode
pnpm test:coverage          # Run Vitest with coverage

# Database (Prisma)
pnpm prisma generate          # Generate Prisma Client types
pnpm prisma migrate dev       # Create + apply migration in dev
pnpm prisma migrate deploy    # Apply migrations in production
pnpm prisma db push           # Quick schema push (no migration file, dev only)
pnpm prisma db seed            # Run seed script
pnpm prisma studio            # Open Prisma Studio GUI
pnpm prisma format            # Format schema.prisma file

# Utilities
pnpm clean                  # Remove .next, node_modules/.cache
```

---

## Code Style & Conventions

### TypeScript

- **Strict mode enabled** — no `any` types unless absolutely unavoidable (and add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why).
- Prefer `interface` for object shapes, `type` for unions/intersections/utility types.
- Use `as const` assertions for literal types.
- Always type function parameters and return types for exported functions.
- Use discriminated unions for state modeling (e.g., `{ status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: string }`).

### React & Next.js

- **Server Components by default**. Only add `'use client'` when the component needs interactivity, hooks, or browser APIs.
- Colocate server actions in the same file or a nearby `actions.ts` file.
- Use Next.js `<Image>`, `<Link>`, and metadata API — never raw `<img>` or `<a>` for internal links.
- Wrap async data-fetching in server components; keep client components thin.
- Prefer named exports for components. Default exports only for Next.js page/layout files.
- Component files: one component per file, filename matches component name in kebab-case (`task-card.tsx` → `TaskCard`).

### State Management

- Use React Context + `useReducer` for board-level state (columns, tasks, drag state).
- Keep context providers as close to their consumers as possible — avoid wrapping the entire app.
- Define actions as a discriminated union type:
  ```typescript
  type BoardAction =
    | { type: 'MOVE_TASK'; payload: { taskId: string; fromCol: string; toCol: string; index: number } }
    | { type: 'ADD_TASK'; payload: Task }
    | { type: 'SYNC_STATE'; payload: BoardState };
  ```
- Optimistic updates: dispatch immediately, then sync with Supabase. On error, revert via `SYNC_STATE`.

### Naming Conventions

| Item                  | Convention            | Example                         |
| --------------------- | --------------------- | ------------------------------- |
| Files & folders       | kebab-case            | `task-card.tsx`                 |
| React components      | PascalCase            | `TaskCard`                      |
| Hooks                 | camelCase, `use-` prefix (filename) | `use-realtime.ts` → `useRealtime` |
| Context               | PascalCase + Context  | `BoardContext`                  |
| Types/Interfaces      | PascalCase            | `BoardState`, `Task`            |
| Constants             | UPPER_SNAKE_CASE      | `MAX_COLUMNS`                   |
| Database columns      | snake_case            | `created_at`, `board_id`        |
| CSS variables         | kebab-case            | `--primary-foreground`          |
| Environment variables | NEXT_PUBLIC_ prefix for client | `NEXT_PUBLIC_SUPABASE_URL` |

### Imports

- Use absolute imports via `@/` path alias (maps to `src/`).
- Import order (enforced by ESLint):
  1. React / Next.js
  2. External packages
  3. Internal aliases (`@/components`, `@/lib`, etc.)
  4. Relative imports
  5. Type-only imports (`import type { ... }`)
- Separate each group with a blank line.

---

## UI & Styling Guidelines

### General Philosophy

- **Clean and minimalist**. Every element should earn its place on screen.
- Use whitespace generously. When in doubt, add more padding.
- Stick to the shadcn/ui default theme unless there's a strong reason to deviate.
- Subtle animations only — no gratuitous motion. Use Magic UI components for purposeful visual flair (e.g., animated counters, text reveals, subtle hover effects).
- Prioritize readability and scannability. Use consistent font sizing and hierarchy.

### shadcn/ui

- Use the **shadcn MCP server** to look up component APIs before implementing. Never guess at props.
- Install components via CLI: `pnpm dlx shadcn@latest add <component>`
- All shadcn primitives go in `src/components/ui/` — do NOT modify these files directly. Wrap/extend them in `src/components/shared/` if customization is needed.
- Always use the `cn()` utility from `@/lib/utils` for conditional class merging.

### shadcnblocks.com

- Use blocks from shadcnblocks.com for pre-built sections (hero, pricing, auth forms, etc.).
- The shadcnblocks registry is configured in `components.json`:
  ```json
  {
    "registries": {
      "@shadcnblocks": "https://shadcnblocks.com/r/{name}"
    }
  }
  ```
- Install via: `pnpm dlx shadcn@latest add "@shadcnblocks/<block-name>"`
- Reference shadcnblocks through the shadcn MCP — it discovers the registry automatically.

### Magic UI

- Use the **Magic UI MCP server** for component discovery and implementation details.
- Magic UI components go in `src/components/magicui/`.
- Install via: `pnpm dlx shadcn@latest add "https://magicui.design/r/<component-name>"`
- Use sparingly and purposefully. Good use cases:
  - `blur-fade` for page transitions
  - `number-ticker` for task counts / stats
  - `text-animate` for empty state messages
  - `marquee` for activity feed
  - `dot-pattern` or `grid-pattern` for subtle backgrounds
- Bad use cases: heavy animations on every component, distracting motion on the Kanban board itself.

### Tailwind CSS

- Use Tailwind utility classes directly. Avoid creating custom CSS unless absolutely necessary.
- For complex conditional styles, use `cn()` with `cva` (class-variance-authority) for component variants.
- Responsive design: mobile-first approach (`sm:`, `md:`, `lg:` breakpoints).
- Dark mode: use `dark:` variant classes. Respect system preference by default.
- Do NOT use arbitrary values `[123px]` unless there's no Tailwind equivalent.

---

## Database & ORM (Prisma + Supabase)

### Responsibility Split

| Concern               | Tool                        | Notes                                    |
| --------------------- | --------------------------- | ---------------------------------------- |
| All DB reads/writes   | **Prisma**                  | Type-safe queries, migrations, seeding   |
| Authentication        | **Supabase Auth**           | `@supabase/ssr` with cookies             |
| Realtime sync         | **Supabase Realtime**       | WebSocket channels for live updates      |
| Row Level Security    | **Supabase (PostgreSQL)**   | RLS policies in Prisma migrations via raw SQL |

**Never use `supabase.from('table').select()`** for data queries — all DB access goes through Prisma.

### Prisma Client Singleton

`src/lib/prisma.ts` — use the singleton pattern to prevent hot-reload connection exhaustion:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- Import from `@/lib/prisma` everywhere — never instantiate `new PrismaClient()` elsewhere.
- Use Prisma Client **only in server contexts** (Server Components, Server Actions, API routes).
- Never import Prisma Client in `'use client'` components.

### Prisma Schema Conventions

- `schema.prisma` is the **single source of truth** for the database schema.
- Use `@map` and `@@map` to keep Prisma model names PascalCase while database tables stay snake_case:
  ```prisma
  model Board {
    id        String   @id @default(uuid())
    title     String
    createdAt DateTime @default(now()) @map("created_at")
    updatedAt DateTime @updatedAt @map("updated_at")
    userId    String   @map("user_id")

    columns   Column[]

    @@map("boards")
  }
  ```
- Use `uuid()` for all primary keys.
- Always include `createdAt` and `updatedAt` on every model.
- Define relations explicitly with `@relation`.
- Add indexes on commonly queried foreign keys: `@@index([boardId])`.

### Migrations

- Use `pnpm prisma migrate dev --name <descriptive-name>` to create migrations.
- Migration names should be descriptive: `add-task-priority-field`, `create-board-members-table`.
- For RLS policies, add raw SQL in migrations via `prisma migrate diff` or manually in the generated migration file:
  ```sql
  -- Enable RLS
  ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

  -- Policy: users can only see boards they're members of
  CREATE POLICY "Users can view their boards"
    ON boards FOR SELECT
    USING (user_id = auth.uid());
  ```
- Never edit a migration file that has already been applied. Create a new migration instead.
- Run `pnpm prisma format` before committing schema changes.

### Supabase Client Setup (Auth + Realtime Only)

- **Browser client**: `src/lib/supabase/client.ts` — use `createBrowserClient()` from `@supabase/ssr`. Used for Auth state and Realtime subscriptions only.
- **Server client**: `src/lib/supabase/server.ts` — use `createServerClient()` from `@supabase/ssr` with cookie handling. Used for Auth verification only.
- **Middleware**: `src/middleware.ts` — refresh auth tokens on every request.

### Realtime

- Subscribe to Supabase Realtime channels per board: `supabase.channel('board:<boardId>')`.
- Listen for `postgres_changes` on the `tasks` and `columns` tables filtered by `board_id`.
- On receiving a change, dispatch to the board reducer via `SYNC_STATE`.
- Always clean up subscriptions in `useEffect` cleanup / `unsubscribe()`.
- Note: Realtime relies on Supabase's built-in change detection — this works alongside Prisma writes because Prisma writes to the same PostgreSQL database.

### Row Level Security (RLS)

- **Every table must have RLS enabled**. No exceptions.
- Policies should be defined in Prisma migration files as raw SQL (see Migrations section above).
- Follow least-privilege: users can only read/write boards they're members of.
- RLS protects data at the database level, even though Prisma doesn't go through the PostgREST layer.
- For server-side Prisma queries (Server Actions, API routes), use Supabase Auth to verify the user's identity, then use the `userId` in Prisma `where` clauses as an additional application-level check.

### Optimistic Updates

1. Dispatch local state change immediately (e.g., `MOVE_TASK`).
2. Fire Server Action / API call that uses Prisma to mutate the database.
3. On success: no action needed (Supabase Realtime will confirm).
4. On error: dispatch `SYNC_STATE` with the last known server state and show a toast.

### Data Access Pattern (Server Actions)

```typescript
'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function createTask(boardId: string, data: CreateTaskInput) {
  // 1. Verify auth via Supabase
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // 2. Verify board membership via Prisma
  const member = await prisma.boardMember.findFirst({
    where: { boardId, userId: user.id },
  });
  if (!member) throw new Error('Forbidden');

  // 3. Create task via Prisma
  return prisma.task.create({
    data: {
      title: data.title,
      columnId: data.columnId,
      boardId,
      createdBy: user.id,
      position: data.position,
    },
  });
}
```

---

## Authentication

- Use `@supabase/ssr` for cookie-based auth in the App Router.
- Protect routes via middleware — redirect unauthenticated users to `/login`.
- Support email/password + at least one OAuth provider (GitHub or Google).
- Store user metadata (display name, avatar) in a `profiles` table linked to `auth.users`.
- Never expose Supabase service role key on the client.

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)

- Test files go in `src/__tests__/` mirroring the source structure, OR colocate as `*.test.tsx` next to the component.
- Test behavior, not implementation. Focus on:
  - User interactions (click, drag, type)
  - Rendered output
  - State transitions in reducers
  - Hook return values
- Mock Prisma client in tests using `vi.mock('@/lib/prisma')`. Mock Supabase client for Auth/Realtime tests.
- Use `@testing-library/user-event` for realistic interaction simulation.

### What to Test

- Reducers: every action type, edge cases, and error states.
- Custom hooks: return values and side effects.
- Key components: task card rendering, column interactions, auth forms.
- Utils: all pure utility functions.

### What NOT to Test

- shadcn/ui or Magic UI primitives — trust the library.
- Next.js internals (routing, image optimization, etc.).
- Supabase SDK methods themselves.

---

## Linting & Formatting

### ESLint (v9+ flat config)

Config file: `eslint.config.mjs`

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "next-env.d.ts",
    "src/components/ui/**",
    "src/components/magicui/**",
    "prisma/migrations/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "react/no-array-index-key": "warn",
      "prefer-const": "error",
    },
  },
]);

export default eslintConfig;
```

### Prettier

Config file: `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Ignore file: `.prettierignore`

```
.next
node_modules
pnpm-lock.yaml
prisma/migrations
src/components/ui
src/components/magicui
```

---

## Git Workflow

### CRITICAL: Manual Git Only

- **Do NOT run any git commands** (commit, push, pull, checkout, etc.). All git operations are done manually by the developer.
- **Do NOT add co-author trailers** or any attribution to commits. No `Co-authored-by` lines.
- When asked to "save" or "commit" work, instead summarize what changed so the developer can write their own commit message.

### Commit Convention (for developer reference)

Follow Conventional Commits:

```
feat: add drag-and-drop task reordering
fix: resolve realtime sync race condition
refactor: extract board reducer into separate module
test: add unit tests for task-card component
chore: update dependencies
docs: update README with setup instructions
```

### Branch Strategy

- `main` — production-ready code
- `dev` — integration branch
- Feature branches: `feat/<description>`, `fix/<description>`

---

## MCP Servers

The following MCP servers are configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "pnpm",
      "args": ["dlx", "shadcn@latest", "mcp"]
    },
    "magicui": {
      "command": "npx",
      "args": ["-y", "@magicuidesign/mcp@latest"]
    }
  }
}
```

### Usage Guidelines

- **Always use the shadcn MCP** before implementing any shadcn/ui component to get the latest API, props, and patterns.
- **Always use the Magic UI MCP** before implementing any Magic UI component.
- Prefer MCP-sourced information over training data — it's more current.
- When the MCP provides installation commands, adapt them to use `pnpm`.

---

## Environment Variables

```env
# Prisma
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Supabase (Auth + Realtime)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # Server-only, never expose

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- `DATABASE_URL`: Use Supabase's **connection pooler** (port 6543, Transaction mode) for serverless/Vercel.
- `DIRECT_URL`: Use Supabase's **direct connection** (port 5432) for migrations. Required in `schema.prisma`:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```

- All client-accessible env vars must be prefixed with `NEXT_PUBLIC_`.
- Server-only secrets must NEVER be prefixed with `NEXT_PUBLIC_`.
- Use `.env.local` for local development (gitignored).
- Use Vercel environment variables for production.

---

## Error Handling

- Use try-catch blocks for all async operations (Prisma queries, Server Actions, Supabase Auth calls).
- Surface errors to users via toast notifications (shadcn `sonner` or `toast` component).
- Log errors with `console.error()` — the `no-console` rule allows `warn` and `error`.
- For server-side errors, return structured error responses:
  ```typescript
  return { error: 'Failed to create task', details: error.message };
  ```
- Never expose raw database errors to the client.

---

## Performance Considerations

- Use `React.memo()` on task cards to prevent unnecessary re-renders during drag operations.
- Debounce Realtime broadcast events (e.g., cursor positions) to avoid flooding the channel.
- Use `next/dynamic` for heavy components that aren't needed on initial render.
- Keep bundle size in check — prefer tree-shakeable imports: `import { Button } from '@/components/ui/button'`.
- Use Prisma's `select` and `include` to fetch only the fields you need — avoid fetching entire relation trees.
- Use Supabase connection pooler (`DATABASE_URL` with port 6543) for Vercel serverless functions to avoid connection exhaustion.

---

## Accessibility

- All interactive elements must be keyboard accessible.
- Use proper ARIA attributes for drag-and-drop regions (`role`, `aria-grabbed`, `aria-dropeffect`).
- Ensure color contrast ratios meet WCAG 2.1 AA standards.
- Provide visible focus indicators on all interactive elements.
- Screen reader announcements for real-time updates (use `aria-live` regions).

---

## Common Pitfalls — Avoid These

1. **Don't use `supabase.from('table')` for DB queries** — all data access goes through Prisma. Supabase client is for Auth + Realtime only.
2. **Don't import Prisma Client in `'use client'` components** — Prisma runs server-side only (Server Components, Server Actions, API routes).
3. **Don't instantiate `new PrismaClient()` outside `src/lib/prisma.ts`** — always use the singleton.
4. **Don't use `localStorage` or `sessionStorage`** for auth state — Supabase SSR handles cookies.
5. **Don't create Supabase clients in component bodies** — always use the helpers in `src/lib/supabase/`.
6. **Don't forget Realtime cleanup** — every `subscribe()` needs a corresponding `unsubscribe()` in cleanup.
7. **Don't put `'use client'` on everything** — most components should be server components.
8. **Don't install shadcn components manually** — always use the CLI (`pnpm dlx shadcn@latest add ...`).
9. **Don't modify files in `src/components/ui/` or `src/components/magicui/`** — extend them elsewhere.
10. **Don't commit `.env.local`** — it's in `.gitignore`.
11. **Don't run git commands** — developer handles all git operations manually.
12. **Don't edit applied Prisma migrations** — create a new migration instead.

test
