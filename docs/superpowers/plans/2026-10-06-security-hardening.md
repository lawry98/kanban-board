# Pre-launch Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five remaining pre-launch gaps: non-expiring/unbound invites, board-title leak via metadata, no Server Action rate limiting, no CSP, and login losing the original destination.

**Architecture:** Pure helpers in `lib/` (`invitations.ts`, `rate-limit.ts`, `csp.ts`, hardened `auth/redirects.ts`) carry the logic and are unit-tested; Server Actions, the board page, `proxy.ts` and the root layout call them. The limiter is a Postgres fixed-window counter (one row per bucket+user, atomic upsert, fail-open). The CSP is a per-request nonce policy built in `proxy.ts` and threaded to Next through the request headers.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), TypeScript strict, Prisma 7 + `@prisma/adapter-pg`, Supabase Auth/Realtime, Zod 4, Vitest + RTL, date-fns 4.

**Spec:** the user's task brief (in the controller session); its requirements are restated verbatim in Global Constraints and in each task.

## Global Constraints

- `CLAUDE.md` at the repo root is authoritative: parse every client input with Zod (`unknown` params), derive parent ids via `require*Access`, every `catch` returns `toActionError(...)`, return `ActionResult<T>`, `import type` for types, `@/` imports, named exports, no `any`, no `supabase.from()`, never edit `components/ui/**` or applied migrations.
- A `'use server'` file may only export async functions, and every export is a public endpoint — shared constants/helpers go in `lib/`.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass; lint runs with `--max-warnings=0`. Test output must be pristine (silence expected `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})` where a test triggers it on purpose).
- Invite default expiry: **7 days**. An invite with an `email` may only be accepted by a signed-in user with that email.
- Rate limiter: keyed by user id, store = Postgres table with atomic upsert counter, RLS on, **no** anon/authenticated grants, **fail open** on any limiter error. Limits (decided): `mutation` 120 per 60 s; `invitationCreate` 10 per 3600 s; `invitationAccept` 10 per 600 s; `memberAdd` 20 per 3600 s.
- Migration SQL: additive + idempotent (`IF NOT EXISTS`; `DROP POLICY IF EXISTS` before any `CREATE POLICY`), no `DROP TABLE/COLUMN`, no data rewrite, never `GRANT` to anon. Folder name `prisma/migrations/<UTC YYYYMMDDHHMMSS>_rate_limits/`. **Implementers never apply migrations** (no `migrate deploy/dev/reset`, no `db push`) — the controller applies them.
- CSP must allow Supabase (https **and** wss origin of `NEXT_PUBLIC_SUPABASE_URL`) and GitHub OAuth (a top-level navigation — needs no directive).
- `next` redirect targets: same-origin relative path only, validated by `sanitizeNext` in `lib/auth/redirects.ts`.
- Git: other implementers work in this same worktree concurrently. Commit ONLY your task's files: `git add <your new files>` then `git commit -m "<msg>" -- <every path you changed>` (the `--` pathspec form commits only those paths). If `.git/index.lock` exists, wait 2 s and retry. Conventional Commits. **No co-author trailer, no "Generated with", no AI attribution of any kind.** Never `git stash`, never `git add -A`/`git add .`, never touch files outside your task list.
- When running `pnpm typecheck`/`pnpm lint` mid-wave, errors in files outside your task list belong to a concurrent implementer — ignore them, but your files must be clean.

---

## File Map

| File | Task | Responsibility |
|---|---|---|
| `lib/invitations.ts` (new) | 1 | TTL constant, expiry math, `isInvitationActive`, `activeInvitationWhere`, `invitationEmailMatches` — pure |
| `app/actions/invitation-actions.ts` | 1, 5 | stamp expiry, email binding (T1); limiter call sites (T5) |
| `app/join/[token]/page.tsx` | 1 | use shared `isInvitationActive` (drop local copy) |
| `components/board/share-board-dialog.tsx` | 1 | expiry text |
| `app/(dashboard)/board/[boardId]/page.tsx` | 2 | `cache()`d authorized loader shared by metadata + page |
| `lib/rate-limit.ts` (new) | 3 | `enforceRateLimit`, `RateLimitError`, `RATE_LIMITS` |
| `prisma/migrations/<ts>_rate_limits/migration.sql` (new), `prisma/schema.prisma` | 3 | `rate_limits` table + model |
| `app/actions/{board,task,column,analytics}-actions.ts` | 3 | limiter call sites |
| `lib/csp.ts` (new) | 4 | nonce + policy builder — pure |
| `lib/supabase/middleware.ts` | 4 | accept forwarded request headers |
| `proxy.ts` | 4, 6 | CSP on every response (T4); `next` param + bounce (T6) |
| `app/layout.tsx` | 4 | read nonce (forces dynamic) → ThemeProvider |
| `next.config.ts` | 4 | replace CSP TODO with pointer |
| `lib/auth/redirects.ts` | 6 | harden `sanitizeNext` |
| `app/(auth)/login/page.tsx` | 6 | carry `next` on the Sign-up link |
| `CLAUDE.md`, `prisma/schema.prisma` (Invitation comments) | 7 | docs truthfulness |

Execution waves: **W1** Tasks 1, 2, 3, 4 in parallel (disjoint files) → **W2** Task 5 (needs 1 + 3) and Task 6 (needs 4) in parallel → **W3** Task 7.

---

### Task 1: Invite expiry + email binding

**Files:**
- Create: `lib/invitations.ts`
- Create: `test/invitations.test.ts`
- Modify: `app/actions/invitation-actions.ts` (createInvitation ~L38-69, getInvitations ~L72-90, acceptInvitation ~L123-197; delete local `isInvitationActive` ~L26-31)
- Modify: `app/join/[token]/page.tsx` (delete local `isActive` ~L20-24, use shared helper ~L52)
- Modify: `components/board/share-board-dialog.tsx` (expiry hint + per-row expiry)
- Test: `test/collaboration-actions.test.ts`, `test/share-board-dialog.test.tsx`

**Interfaces:**
- Produces (Task 5 and docs rely on these exact names):
  - `INVITATION_TTL_DAYS = 7` (exported const)
  - `invitationExpiry(from?: Date): Date`
  - `effectiveExpiry(inv: Pick<Invitation, 'expiresAt' | 'createdAt'>): Date`
  - `isInvitationActive(inv: Pick<Invitation, 'revokedAt' | 'expiresAt' | 'createdAt'>, now?: Date): boolean`
  - `activeInvitationWhere(now?: Date): Prisma.InvitationWhereInput`
  - `invitationEmailMatches(invitationEmail: string | null, user: Pick<User, 'email' | 'email_confirmed_at'>): boolean`
- Error copy (exact): mismatch → `'This invite was sent to a different email address. Sign in with that account to join.'`; inactive → unchanged `'This invite link is no longer valid'`.

Decisions baked in: legacy rows with `expiresAt = null` lapse `INVITATION_TTL_DAYS` after `createdAt` (computed at read time — no data rewrite); a bound invite requires a **confirmed** email (`email_confirmed_at` set), compared trimmed + lowercased; the mismatch message never echoes the bound address; the email check runs after the active check and before the role re-check / existing-member shortcut.

- [ ] **Step 1: Write failing unit tests** `test/invitations.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import {
  INVITATION_TTL_DAYS,
  activeInvitationWhere,
  effectiveExpiry,
  invitationEmailMatches,
  invitationExpiry,
  isInvitationActive,
} from '@/lib/invitations';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-06T12:00:00.000Z');

function inv(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date | null; createdAt: Date }> = {}) {
  return { revokedAt: null, expiresAt: new Date(NOW.getTime() + DAY), createdAt: NOW, ...overrides };
}

describe('invitationExpiry', () => {
  it('is INVITATION_TTL_DAYS after the given instant', () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiry(NOW).getTime()).toBe(NOW.getTime() + 7 * DAY);
  });
});

describe('isInvitationActive', () => {
  it('accepts a live, unrevoked link', () => {
    expect(isInvitationActive(inv(), NOW)).toBe(true);
  });
  it('rejects a revoked link even before expiry', () => {
    expect(isInvitationActive(inv({ revokedAt: NOW }), NOW)).toBe(false);
  });
  it('rejects a link at or past its expiry', () => {
    expect(isInvitationActive(inv({ expiresAt: NOW }), NOW)).toBe(false);
    expect(isInvitationActive(inv({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(false);
  });
  it('lapses a legacy null-expiry link INVITATION_TTL_DAYS after creation', () => {
    const fresh = inv({ expiresAt: null, createdAt: new Date(NOW.getTime() - 6 * DAY) });
    const stale = inv({ expiresAt: null, createdAt: new Date(NOW.getTime() - 7 * DAY) });
    expect(isInvitationActive(fresh, NOW)).toBe(true);
    expect(isInvitationActive(stale, NOW)).toBe(false);
    expect(effectiveExpiry(fresh).getTime()).toBe(fresh.createdAt.getTime() + 7 * DAY);
  });
});

describe('activeInvitationWhere', () => {
  it('mirrors isInvitationActive as a Prisma filter', () => {
    expect(activeInvitationWhere(NOW)).toEqual({
      revokedAt: null,
      OR: [
        { expiresAt: { gt: NOW } },
        { expiresAt: null, createdAt: { gt: new Date(NOW.getTime() - 7 * DAY) } },
      ],
    });
  });
});

describe('invitationEmailMatches', () => {
  const confirmed = '2026-01-01T00:00:00Z';
  it('lets anyone accept an unbound invite', () => {
    expect(invitationEmailMatches(null, { email: undefined, email_confirmed_at: undefined })).toBe(true);
  });
  it('matches the confirmed email case- and whitespace-insensitively', () => {
    expect(invitationEmailMatches('ann@example.com', { email: ' Ann@Example.COM ', email_confirmed_at: confirmed })).toBe(true);
  });
  it('rejects a different email', () => {
    expect(invitationEmailMatches('ann@example.com', { email: 'bob@example.com', email_confirmed_at: confirmed })).toBe(false);
  });
  it('rejects an unconfirmed or missing email', () => {
    expect(invitationEmailMatches('ann@example.com', { email: 'ann@example.com', email_confirmed_at: undefined })).toBe(false);
    expect(invitationEmailMatches('ann@example.com', { email: undefined, email_confirmed_at: confirmed })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run test/invitations.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** `lib/invitations.ts`

```ts
import type { Invitation, Prisma } from '@prisma/client';
import type { User } from '@supabase/supabase-js';

/** How long a newly created invite link stays usable. */
export const INVITATION_TTL_DAYS = 7;

const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** The expiry stamped on a link created at `from`. */
export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_MS);
}

/**
 * When a link stops working. Rows created before expiry was stamped have a null
 * `expiresAt`; they lapse INVITATION_TTL_DAYS after creation, so no link is
 * open-ended and no stored row has to be rewritten.
 */
export function effectiveExpiry(invitation: Pick<Invitation, 'expiresAt' | 'createdAt'>): Date {
  return invitation.expiresAt ?? invitationExpiry(invitation.createdAt);
}

/** An invite is usable only while neither revoked nor past its (effective) expiry. */
export function isInvitationActive(
  invitation: Pick<Invitation, 'revokedAt' | 'expiresAt' | 'createdAt'>,
  now: Date = new Date(),
): boolean {
  if (invitation.revokedAt) return false;
  return effectiveExpiry(invitation).getTime() > now.getTime();
}

/** The query twin of `isInvitationActive`: selects the links that are live at `now`. */
export function activeInvitationWhere(now: Date = new Date()): Prisma.InvitationWhereInput {
  return {
    revokedAt: null,
    OR: [
      { expiresAt: { gt: now } },
      { expiresAt: null, createdAt: { gt: new Date(now.getTime() - INVITATION_TTL_MS) } },
    ],
  };
}

/**
 * Whether `user` may accept an invite bound to `invitationEmail`. An unbound invite
 * is open to any signed-in user. A bound one needs a CONFIRMED primary email that
 * matches: with email confirmation off, anyone could register the invited address,
 * and `new_email` (a pending change) is deliberately not consulted.
 */
export function invitationEmailMatches(
  invitationEmail: string | null,
  user: Pick<User, 'email' | 'email_confirmed_at'>,
): boolean {
  if (!invitationEmail) return true;
  if (!user.email || !user.email_confirmed_at) return false;
  return user.email.trim().toLowerCase() === invitationEmail.trim().toLowerCase();
}
```

- [ ] **Step 4: Run** `pnpm vitest run test/invitations.test.ts` — expect PASS.

- [ ] **Step 5: Write failing action tests** in `test/collaboration-actions.test.ts` (follow its existing mock pattern — real `require-access` guards, mocked `@/lib/prisma` + `@/lib/supabase/server`):
  - Change `signInAs(id = USER_ID, email = 'me@example.com')` so the mocked user is `{ id, email, email_confirmed_at: '2026-01-01T00:00:00Z' }`; add a way to pass an unconfirmed user (e.g. a third param or a separate helper).
  - Change `makeInvitation`'s default `expiresAt` from `null` to a future date (`new Date(Date.now() + 24 * 60 * 60 * 1000)`), because a null expiry with `createdAt: 2026-01-01` is now a lapsed legacy link. Keep `createdAt` as is.
  - `createInvitation` stamps `expiresAt` 7 days ahead: use `vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))`, call it, then `expect(db.invitation.create.mock.calls[0][0].data.expiresAt).toEqual(new Date('2026-10-13T12:00:00Z'))`; `vi.useRealTimers()` in cleanup.
  - `getInvitations` passes `activeInvitationWhere`-shaped filter: update the existing `where.OR` assertion (currently expects `{ expiresAt: null }`) to expect `revokedAt: null`, `boardId`, and an `OR` containing `{ expiresAt: { gt: expect.any(Date) } }` and `{ expiresAt: null, createdAt: { gt: expect.any(Date) } }`.
  - `acceptInvitation` rejects, returning `{ error: 'This invite link is no longer valid' }` and never calling `db.boardMember.create`: (a) `expiresAt` in the past, (b) `revokedAt` set, (c) legacy `expiresAt: null` with `createdAt` 8 days ago. Check whether (a)/(b) already exist; add only what's missing.
  - `acceptInvitation` with `email: 'ann@example.com'`: (d) signed in as `bob@example.com` → `{ error: 'This invite was sent to a different email address. Sign in with that account to join.' }`, no `boardMember.create`, no `boardMember.findFirst`; (e) signed in as `ANN@example.com` (confirmed) → joins (`{ data: { boardId: BOARD_A } }`, `boardMember.create` called); (f) signed in as `ann@example.com` but unconfirmed → mismatch error.
  - (g) the mismatch error text does not contain `ann@example.com`.

- [ ] **Step 6: Run** `pnpm vitest run test/collaboration-actions.test.ts` — expect the new tests FAIL.

- [ ] **Step 7: Implement in `app/actions/invitation-actions.ts`**
  - Delete the local `isInvitationActive`; `import { activeInvitationWhere, invitationEmailMatches, invitationExpiry, isInvitationActive } from '@/lib/invitations';` (keep import groups per CLAUDE.md).
  - `createInvitation`: add `expiresAt: invitationExpiry(),` to `prisma.invitation.create({ data })`.
  - `getInvitations`: `where: { boardId: id, ...activeInvitationWhere() }`.
  - `acceptInvitation`, immediately after the existing `if (!invitation || !isInvitationActive(invitation)) throw …` block:

```ts
    // A bound invite is for one person, not whoever holds the link. Checked before
    // the existing-member shortcut so the answer doesn't depend on membership.
    if (!invitationEmailMatches(invitation.email, user)) {
      throw new PublicError(
        'This invite was sent to a different email address. Sign in with that account to join.',
      );
    }
```

- [ ] **Step 8: Join page** `app/join/[token]/page.tsx`: delete the local `isActive` function; `import { isInvitationActive } from '@/lib/invitations';`; `const linkActive = invitation !== null && isInvitationActive(invitation);`. The `findUnique` uses `include`, so `createdAt` is already on the row — confirm it typechecks. Change nothing else on this page.

- [ ] **Step 9: Share dialog test (failing first)** in `test/share-board-dialog.test.tsx`: add a case where the mocked `getInvitations` resolves `{ data: [<one invitation with expiresAt = now + 7 days, createdAt = now>] }`; open the dialog on the link tab (follow how the file renders the dialog; check which tab is default) and assert `screen.getByText('Expires in 7 days')` and `screen.getByText('Links expire after 7 days.')`. Run it — expect FAIL.

- [ ] **Step 10: Share dialog implementation** `components/board/share-board-dialog.tsx`:
  - `import { formatDistanceToNowStrict, format } from 'date-fns';` and `import { INVITATION_TTL_DAYS, effectiveExpiry } from '@/lib/invitations';` (`lib/invitations.ts` has only type imports from Prisma, so no Prisma runtime enters the client bundle — confirm).
  - Under the create-link controls add `<p className="text-muted-foreground text-xs">Links expire after {INVITATION_TTL_DAYS} days.</p>`.
  - In each link row, render below the existing single-line flex row (wrap the row content in a `flex flex-col gap-1` container; keep the existing controls and their aria-labels unchanged): `<p className="text-muted-foreground text-xs" title={format(expiry, 'PPpp')}>Expires {formatDistanceToNowStrict(expiry, { addSuffix: true })}</p>` with `const expiry = effectiveExpiry(invitation)`. (`formatDistanceToNowStrict(+7d, { addSuffix: true })` → `"in 7 days"`.)
  - Don't edit `components/ui/**`.

- [ ] **Step 11: Run** `pnpm vitest run test/invitations.test.ts test/collaboration-actions.test.ts test/share-board-dialog.test.tsx test/analytics.test.ts` — all PASS, output pristine. Then `pnpm typecheck` and `pnpm lint` (your files clean).

- [ ] **Step 12: Commit**

```bash
git add lib/invitations.ts test/invitations.test.ts
git commit -m "feat(invitations): expire invite links after 7 days and bind emailed invites" -- lib/invitations.ts test/invitations.test.ts app/actions/invitation-actions.ts 'app/join/[token]/page.tsx' components/board/share-board-dialog.tsx test/collaboration-actions.test.ts test/share-board-dialog.test.tsx
```

---

### Task 2: Board metadata authorization

**Files:**
- Modify: `app/(dashboard)/board/[boardId]/page.tsx` (whole file is ~64 lines)
- Create: `test/board-page.test.ts`

**Interfaces:**
- Produces: nothing exported beyond the existing default page + `generateMetadata`. The loader is a module-private `const`.

Today `generateMetadata` runs `prisma.board.findUnique({ where: { id: boardId }, select: { title: true } })` with no auth, so a signed-in non-member who knows a board id reads its title in `<title>`. The page itself checks membership inline.

- [ ] **Step 1: Write failing tests** `test/board-page.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { board: { findUnique: vi.fn() }, boardMember: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
// The client view is irrelevant here and drags in dnd/realtime.
vi.mock('@/app/(dashboard)/board/[boardId]/board-view', () => ({ BoardView: () => null }));

import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import BoardPage, { generateMetadata } from '@/app/(dashboard)/board/[boardId]/page';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const db = prisma as unknown as { board: { findUnique: Mock }; boardMember: { findFirst: Mock } };
const props = { params: Promise.resolve({ boardId: BOARD_ID }) };

function signInAs(user: { id: string } | null): void {
  (createClient as unknown as Mock).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('board page generateMetadata', () => {
  it("uses the board's title for a member", async () => {
    signInAs({ id: 'u1' });
    db.boardMember.findFirst.mockResolvedValue({ id: 'm1', role: 'VIEWER' });
    db.board.findUnique.mockResolvedValue({ id: BOARD_ID, title: 'Secret roadmap' });
    expect(await generateMetadata(props)).toEqual({ title: 'Secret roadmap' });
  });

  it("returns 'Board' to a non-member without ever loading the board", async () => {
    signInAs({ id: 'intruder' });
    db.boardMember.findFirst.mockResolvedValue(null);
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it("returns 'Board' when signed out", async () => {
    signInAs(null);
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
    expect(db.board.findUnique).not.toHaveBeenCalled();
  });

  it("returns 'Board' when the lookup fails", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    signInAs({ id: 'u1' });
    db.boardMember.findFirst.mockRejectedValue(new Error('db down'));
    expect(await generateMetadata(props)).toEqual({ title: 'Board' });
  });
});

describe('board page', () => {
  it('404s a non-member', async () => {
    signInAs({ id: 'intruder' });
    db.boardMember.findFirst.mockResolvedValue(null);
    await expect(BoardPage(props)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('sends a signed-out visitor to /login', async () => {
    signInAs(null);
    await expect(BoardPage(props)).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
```

Restore the console spy (`afterEach(() => vi.restoreAllMocks())`). If the `@/app/(dashboard)/...` path doesn't resolve in Vitest, use a relative import from `test/` instead and report it.

- [ ] **Step 2: Run** `pnpm vitest run test/board-page.test.ts` — expect the non-member/signed-out metadata tests to FAIL.

- [ ] **Step 3: Implement** — rewrite `page.tsx` around one cached loader. Keep the board `include` identical to today's (columns→tasks with `PUBLIC_PROFILE_SELECT` assignee/creator; `members: { include: MEMBER_PROFILE_INCLUDE }` — same value as today's `{ profile: true }`; `creator: { select: PUBLIC_PROFILE_SELECT }`).

```tsx
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { MEMBER_PROFILE_INCLUDE, PUBLIC_PROFILE_SELECT } from '@/types/board';
import { BoardView } from './board-view';

import type { Role } from '@prisma/client';
import type { BoardWithDetails } from '@/types';

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
}

type BoardForViewer =
  | { status: 'ok'; userId: string; role: Role; board: BoardWithDetails }
  | { status: 'unauthenticated' }
  | { status: 'not-found' };

/**
 * The board as the signed-in viewer may see it, or why they can't. `cache()` makes
 * generateMetadata and the page share one authorization per request, so a
 * non-member gets neither the board nor its title.
 */
const loadBoardForViewer = cache(async (boardId: string): Promise<BoardForViewer> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'unauthenticated' };

  const membership = await prisma.boardMember.findFirst({ where: { boardId, userId: user.id } });
  if (!membership) return { status: 'not-found' };

  const board = await prisma.board.findUnique({ where: { id: boardId }, include: { /* unchanged */ } });
  if (!board) return { status: 'not-found' };

  return { status: 'ok', userId: user.id, role: membership.role, board };
});

export async function generateMetadata({ params }: BoardPageProps): Promise<Metadata> {
  const { boardId } = await params;
  try {
    const result = await loadBoardForViewer(boardId);
    return { title: result.status === 'ok' ? result.board.title : 'Board' };
  } catch (error) {
    // The page renders the real failure; the tab title just stays generic.
    console.error('board generateMetadata error:', error);
    return { title: 'Board' };
  }
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;
  const result = await loadBoardForViewer(boardId);

  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status === 'not-found') notFound();

  return <BoardView board={result.board} currentUserId={result.userId} userRole={result.role} />;
}
```

Write the full `include` (not the `/* unchanged */` placeholder). If `BoardWithDetails` doesn't match the include's inferred type, report it rather than casting.

- [ ] **Step 4: Run** `pnpm vitest run test/board-page.test.ts` — PASS; `pnpm typecheck`, `pnpm lint` clean for your files.

- [ ] **Step 5: Commit**

```bash
git add test/board-page.test.ts
git commit -m "fix(board): stop leaking board titles to non-members via page metadata" -- 'app/(dashboard)/board/[boardId]/page.tsx' test/board-page.test.ts
```

---

### Task 3: Postgres rate limiter + non-invitation call sites

**Files:**
- Create: `lib/rate-limit.ts`, `test/rate-limit.test.ts`
- Create: `prisma/migrations/<UTC YYYYMMDDHHMMSS>_rate_limits/migration.sql` (timestamp from `date -u +%Y%m%d%H%M%S` at creation)
- Modify: `prisma/schema.prisma` (append `RateLimit` model — touch nothing else in the file)
- Modify: `app/actions/board-actions.ts`, `app/actions/task-actions.ts`, `app/actions/column-actions.ts`, `app/actions/analytics-actions.ts`
- Test: `test/task-actions.test.ts`, `test/task-actions-due-date.test.ts`
- Do NOT touch: `app/actions/invitation-actions.ts`, `test/collaboration-actions.test.ts`, `test/analytics.test.ts` (Task 5 owns those).

**Interfaces:**
- Produces (Task 5 uses):
  - `enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void>` — throws `RateLimitError` when over the limit; resolves (fails open) on any limiter error
  - `RateLimitError extends PublicError` with `readonly retryAfterSeconds: number`; message `Too many requests, try again in ${n}s` (n < 60) or `Too many requests, try again in ${Math.ceil(n / 60)} min`
  - `RATE_LIMITS` — `{ mutation: {limit:120, windowSeconds:60}, invitationCreate: {limit:10, windowSeconds:3600}, invitationAccept: {limit:10, windowSeconds:600}, memberAdd: {limit:20, windowSeconds:3600} }`
  - `type RateLimitBucket = keyof typeof RATE_LIMITS`

- [ ] **Step 1: Write failing tests** `test/rate-limit.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }));
// require-access (PublicError) imports the Supabase server client, which validates env at import.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { PublicError, toActionError } from '@/lib/auth/require-access';
import { RATE_LIMITS, RateLimitError, enforceRateLimit } from '@/lib/rate-limit';

const queryRaw = prisma.$queryRaw as unknown as Mock;
const USER = 'user-1';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('enforceRateLimit', () => {
  it.each(Object.entries(RATE_LIMITS))('%s: allows `limit` calls, then blocks', async (bucket, { limit }) => {
    let hits = 0;
    queryRaw.mockImplementation(async () => [{ hits: ++hits, retry_after: 30 }]);
    for (let i = 0; i < limit; i++) {
      await expect(enforceRateLimit(USER, bucket as keyof typeof RATE_LIMITS)).resolves.toBeUndefined();
    }
    await expect(enforceRateLimit(USER, bucket as keyof typeof RATE_LIMITS)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('carries retry-after and a sanitized message through toActionError', async () => {
    queryRaw.mockResolvedValue([{ hits: 121, retry_after: 42 }]);
    const err = await enforceRateLimit(USER, 'mutation').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublicError);
    expect((err as RateLimitError).retryAfterSeconds).toBe(42);
    expect(toActionError('x', err, 'fallback')).toEqual({ error: 'Too many requests, try again in 42s' });
  });

  it('formats long waits in minutes', () => {
    expect(new RateLimitError(3540).message).toBe('Too many requests, try again in 59 min');
  });

  it('fails open when the store errors, logging the bucket', async () => {
    queryRaw.mockRejectedValue(new Error('relation "rate_limits" does not exist'));
    await expect(enforceRateLimit(USER, 'invitationAccept')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invitationAccept'), expect.any(Error));
  });

  it('fails open on a synchronous throw, an empty result, or a garbled row', async () => {
    queryRaw.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    queryRaw.mockResolvedValueOnce([]);
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
    queryRaw.mockResolvedValueOnce([{ hits: 'nope', retry_after: null }]);
    await expect(enforceRateLimit(USER, 'mutation')).resolves.toBeUndefined();
  });

  it('coerces bigint counters', async () => {
    queryRaw.mockResolvedValue([{ hits: 121n, retry_after: 5n }]);
    await expect(enforceRateLimit(USER, 'mutation')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('binds every value as a parameter, never interpolated SQL', async () => {
    queryRaw.mockResolvedValue([{ hits: 1, retry_after: 60 }]);
    await enforceRateLimit(USER, 'mutation');
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(expect.arrayContaining(['mutation', USER, 60]));
    expect(strings.join('')).not.toContain(USER);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run test/rate-limit.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `lib/rate-limit.ts`

```ts
import { prisma } from '@/lib/prisma';
import { PublicError } from '@/lib/auth/require-access';

interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Per-user fixed windows. `mutation` covers every write action; the others replace it
 * (never add to it) for the actions that hand out or redeem access, or that reveal
 * whether an email has an account.
 */
export const RATE_LIMITS = {
  mutation: { limit: 120, windowSeconds: 60 },
  invitationCreate: { limit: 10, windowSeconds: 60 * 60 },
  invitationAccept: { limit: 10, windowSeconds: 10 * 60 },
  memberAdd: { limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

function formatRetryAfter(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
}

/** A `PublicError`, so `toActionError` passes the message through unchanged. */
export class RateLimitError extends PublicError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many requests, try again in ${formatRetryAfter(retryAfterSeconds)}`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface CounterRow {
  hits: number | bigint;
  retry_after: number | bigint;
}

/**
 * Counts one call against `bucket` for `userId` and throws `RateLimitError` once the
 * window's limit is exceeded. Call it right after the action's auth guard.
 *
 * Fails OPEN: if the counter can't be read or written, the call is allowed and the
 * error logged, so a limiter outage never blocks users. The block decision sits
 * outside the try so fail-open can never swallow a `RateLimitError`.
 *
 * One row per (bucket, user), reset in place when its window lapses: the upsert is
 * atomic (ON CONFLICT locks the row), timing uses the database clock, and the table
 * stays bounded at users × buckets.
 */
export async function enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];

  let row: CounterRow | undefined;
  try {
    const rows = await prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "rate_limits" AS rl ("bucket", "user_id", "hits", "window_start")
      VALUES (${bucket}, ${userId}, 1, now())
      ON CONFLICT ("bucket", "user_id") DO UPDATE SET
        "hits" = CASE
          WHEN rl."window_start" <= now() - make_interval(secs => ${windowSeconds}::int) THEN 1
          ELSE rl."hits" + 1
        END,
        "window_start" = CASE
          WHEN rl."window_start" <= now() - make_interval(secs => ${windowSeconds}::int) THEN now()
          ELSE rl."window_start"
        END
      RETURNING
        "hits",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM
          ("window_start" + make_interval(secs => ${windowSeconds}::int) - now())))::int) AS "retry_after"
    `;
    row = rows[0];
  } catch (error) {
    console.error(`rateLimit(${bucket}) failed open (non-fatal):`, error);
    return;
  }

  const hits = Number(row?.hits);
  if (!Number.isFinite(hits) || hits <= limit) return;
  throw new RateLimitError(Math.max(1, Number(row?.retry_after) || windowSeconds));
}
```

(`::int` on `retry_after` is required: `EXTRACT` returns `numeric`, which Prisma would hand back as a `Decimal`. `hits` is int4 → JS number.)

- [ ] **Step 4: Run** `pnpm vitest run test/rate-limit.test.ts` — PASS.

- [ ] **Step 5: Schema + migration.** Append to `prisma/schema.prisma`:

```prisma
/// Fixed-window counters for lib/rate-limit.ts, written only via $queryRaw. One row
/// per (bucket, user), reset in place, so the table is bounded by users × buckets.
/// Deny-all over the Data API (RLS on, no policy, no grants), like analytics_events.
/// Deliberately no relation to Profile: see the migration.
model RateLimit {
  bucket      String
  userId      String   @map("user_id")
  hits        Int
  windowStart DateTime @map("window_start") @db.Timestamptz(3)

  @@id([bucket, userId])
  @@map("rate_limits")
}
```

Create `prisma/migrations/<UTC ts>_rate_limits/migration.sql`:

```sql
-- ============================================================================
-- SERVER ACTION RATE LIMITS
-- ============================================================================
--
-- Fixed-window counters for lib/rate-limit.ts. One row per (bucket, user),
-- reset in place when its window lapses, so the table is bounded by
-- users x buckets and needs no pruning.
--
-- Data API posture matches analytics_events: Prisma (the `postgres` owner,
-- BYPASSRLS) is the only reader and writer. RLS on with no policy and no
-- grants is deny-all for anon/authenticated. NOT published to supabase_realtime.
--
-- user_id deliberately has NO foreign key to profiles: an FK violation (e.g. a
-- user acting before their profiles row exists) would make the fail-open
-- limiter silently skip exactly that user.
--
-- window_start is timestamptz (unlike the repo's TIMESTAMP(3) convention) so the
-- window arithmetic against now() is independent of the pooler session TimeZone.
--
-- Idempotent: every statement is safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "rate_limits" (
    "bucket" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket", "user_id")
);

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

-- Explicit, not inherited: on a database where the lockdown migration's default
-- privileges are not in effect, Supabase's defaults would grant this new table
-- to anon/authenticated.
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;
```

Verify the schema and SQL agree (read-only — this does NOT apply anything):

```bash
export DIRECT_URL="$(node --env-file=.env.local -e 'const u=new URL(process.env.DATABASE_URL);u.port="5432";u.search="";process.stdout.write(u.toString())')"
pnpm -s prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: exactly the `CREATE TABLE "rate_limits"` + primary key (Prisma's own rendering). Any other statement = drift from another session's migration — report it, don't fix it. Then `pnpm prisma generate` and `pnpm prisma format --check` (or `pnpm prisma format` then confirm only your model changed). Never print `.env.local` or the URL.

- [ ] **Step 6: Wiring tests (failing first).** In `test/task-actions.test.ts` and `test/task-actions-due-date.test.ts` add, next to the other `vi.mock`s:

```ts
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: vi.fn(async () => {}),
}));
```

In `test/task-actions.test.ts` add: `moveTask` calls `enforceRateLimit(USER_ID, 'mutation')` (use the file's own user-id constant); when `enforceRateLimit` rejects with `new RateLimitError(10)`, `moveTask` returns `{ error: 'Too many requests, try again in 10s' }` and `db.task.update` is not called; same pair for `createTask` (no `task.create`). Signed out → `enforceRateLimit` not called. Run — FAIL.

- [ ] **Step 7: Call sites.** Add `import { enforceRateLimit } from '@/lib/rate-limit';` and one line `await enforceRateLimit(user.id, '<bucket>');` immediately after the guard that first yields `user`, inside the existing `try`. Destructure `user` from the guard where it's currently discarded.

| Action | Guard | Bucket |
|---|---|---|
| `board-actions.ts` `createBoard` | `requireAuth()` (before input parse) | `mutation` |
| `updateBoard` | `requireBoardAccess(id, EDITOR_ROLES)` | `mutation` |
| `deleteBoard` | `requireBoardAccess(id, OWNER_ROLES)` (keep `redirect` outside the try) | `mutation` |
| `addBoardMember` | `requireBoardAccess(id, OWNER_ROLES)` | `memberAdd` |
| `removeBoardMember` | `requireBoardAccess(id, OWNER_ROLES)` | `mutation` |
| `changeMemberRole` | `requireBoardAccess(id, OWNER_ROLES)` | `mutation` |
| `leaveBoard` | after `requireBoardMember` | `mutation` |
| `task-actions.ts` `createTask` | `requireColumnAccess(…, EDITOR_ROLES)` | `mutation` |
| `updateTask` / `moveTask` / `deleteTask` | `requireTaskAccess(…, EDITOR_ROLES)` | `mutation` |
| `column-actions.ts` `createColumn` | `requireBoardAccess(boardId, EDITOR_ROLES)` | `mutation` |
| `updateColumn` / `deleteColumn` | `requireColumnAccess(id, EDITOR_ROLES)` | `mutation` |
| `reorderColumns` | right after `requireAuth()` | `mutation` |
| `analytics-actions.ts` `trackSignedUp` | `requireAuth()` | `mutation` |

Not limited (reads, or no user): `getBoardData`, `getActivityLogs`, `auth-actions.ts` `signOut`.

- [ ] **Step 8: Run** `pnpm vitest run test/rate-limit.test.ts test/task-actions.test.ts test/task-actions-due-date.test.ts` — PASS, pristine. `pnpm typecheck`, `pnpm lint` clean for your files.

- [ ] **Step 9: Commit**

```bash
git add lib/rate-limit.ts test/rate-limit.test.ts prisma/migrations/<ts>_rate_limits/migration.sql
git commit -m "feat(security): rate-limit mutation server actions with a Postgres fixed window" -- lib/rate-limit.ts test/rate-limit.test.ts prisma/migrations/<ts>_rate_limits/migration.sql prisma/schema.prisma app/actions/board-actions.ts app/actions/task-actions.ts app/actions/column-actions.ts app/actions/analytics-actions.ts test/task-actions.test.ts test/task-actions-due-date.test.ts
```

---

### Task 4: Per-request nonce Content-Security-Policy

**Files:**
- Create: `lib/csp.ts`, `test/csp.test.ts`, `test/supabase-middleware.test.ts`
- Modify: `proxy.ts`, `lib/supabase/middleware.ts`, `app/layout.tsx`, `next.config.ts` (comment only), `test/proxy.test.ts`

**Interfaces:**
- Produces (Task 6 edits proxy.ts after you):
  - `NONCE_HEADER = 'x-nonce'`, `CSP_HEADER = 'Content-Security-Policy'`
  - `generateNonce(): string`
  - `buildContentSecurityPolicy(opts: { nonce: string; supabaseUrl: string; isDev: boolean }): string`
  - `updateSession(request: NextRequest, requestHeaders?: Headers): Promise<SessionResult>`
  - in `proxy.ts`: a module-private `withCsp(response: NextResponse, csp: string): NextResponse` wrapping every return

How Next 16 applies the nonce (verified in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and `next/dist/server/app-render/app-render.js:209`): it parses the `Content-Security-Policy` (or `-Report-Only`) **request** header, extracts `'nonce-…'` from `script-src`, and stamps it on every framework script/style it emits. Pages must render dynamically — a prerendered page carries no nonce, and `'strict-dynamic'` then blocks all its scripts. Today `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth-code-error` and `/_not-found` prerender statically; reading `headers()` in the root layout makes every route dynamic.

Policy decisions: `style-src 'self' 'unsafe-inline'` (no nonce — browsers ignore `'unsafe-inline'` when a nonce is present): sonner 2 injects an un-nonced `<style>` at import, Radix scroll-lock / ScrollArea and `@hello-pangea/dnd` inject styles, and server-rendered `style=` attributes can't carry nonces. Script injection stays blocked by the nonce + `'strict-dynamic'`. `img-src` allowlists GitHub/Google avatar hosts and the Supabase public-storage path (Radix `AvatarImage` is a raw `<img>`). GitHub OAuth is a top-level navigation (`window.location.assign`), so it needs no directive; `form-action 'self'` holds because every form submits via JS. Keep the proxy `matcher` unchanged (the docs' `missing: [next-router-prefetch…]` filter is client-controlled and would let a request skip the auth gate).

- [ ] **Step 1: Failing tests** `test/csp.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, generateNonce } from '@/lib/csp';

const SUPABASE = 'https://abcd.supabase.co';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  const prod = directives(buildContentSecurityPolicy({ nonce: 'abc123', supabaseUrl: SUPABASE, isDev: false }));
  const dev = directives(buildContentSecurityPolicy({ nonce: 'abc123', supabaseUrl: SUPABASE, isDev: true }));

  it('allows scripts only by nonce + strict-dynamic in production', () => {
    expect(prod.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });
  it("adds 'unsafe-eval' only in development", () => {
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(prod.get('script-src')).not.toContain("'unsafe-eval'");
  });
  it('never allows inline scripts', () => {
    expect(prod.get('script-src')).not.toContain("'unsafe-inline'");
  });
  it('allows Supabase over https and wss', () => {
    expect(prod.get('connect-src')).toEqual(["'self'", SUPABASE, 'wss://abcd.supabase.co']);
  });
  it('locks down framing, plugins, base and form targets', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('form-action')).toEqual(["'self'"]);
  });
  it('upgrades insecure requests only in production', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(true);
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
  });
  it('maps a local http Supabase to ws', () => {
    const local = directives(buildContentSecurityPolicy({ nonce: 'n', supabaseUrl: 'http://127.0.0.1:54321', isDev: true }));
    expect(local.get('connect-src')).toEqual(["'self'", 'http://127.0.0.1:54321', 'ws://127.0.0.1:54321']);
  });
});

describe('generateNonce', () => {
  it('returns a fresh base64 value each call', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(generateNonce()).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run test/csp.test.ts` — FAIL.

- [ ] **Step 3: Implement** `lib/csp.ts`

```ts
/**
 * Per-request Content-Security-Policy, set by proxy.ts. Next reads the nonce from the
 * CSP *request* header and stamps it on its own scripts; `x-nonce` is for app code
 * (the root layout hands it to next-themes' inline script).
 */
export const NONCE_HEADER = 'x-nonce';

/**
 * Enforced. Swap for 'Content-Security-Policy-Report-Only' to observe without
 * blocking; Next extracts the nonce from either.
 */
export const CSP_HEADER = 'Content-Security-Policy';

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

interface CspOptions {
  nonce: string;
  supabaseUrl: string;
  isDev: boolean;
}

export function buildContentSecurityPolicy({ nonce, supabaseUrl, isDev }: CspOptions): string {
  const supabase = new URL(supabaseUrl).origin;
  const supabaseSocket = supabase.replace(/^http/, 'ws');

  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // 'strict-dynamic' lets nonce-trusted Next chunks load the rest. React needs eval in dev only.
    ['script-src', "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // No nonce here on purpose (it would void 'unsafe-inline'): sonner, Radix and
    // @hello-pangea/dnd inject un-nonced <style> tags, and SSR style attributes can't carry one.
    ['style-src', "'self'", "'unsafe-inline'"],
    // Avatars are raw <img> (Radix AvatarImage), not next/image.
    [
      'img-src',
      "'self'",
      'blob:',
      'data:',
      'https://avatars.githubusercontent.com',
      'https://lh3.googleusercontent.com',
      `${supabase}/storage/v1/object/public/`,
    ],
    ['font-src', "'self'"],
    // Supabase REST/Auth over https; Realtime over wss.
    ['connect-src', "'self'", supabase, supabaseSocket],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];

  const policy = directives.map((d) => d.join(' '));
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
```

- [ ] **Step 4: Run** `pnpm vitest run test/csp.test.ts` — PASS.

- [ ] **Step 5: `lib/supabase/middleware.ts`** — add a second parameter and use it for the forwarded request headers; update the doc comment:

```ts
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers = request.headers,
): Promise<SessionResult> {
  // `requestHeaders` reach Server Components (proxy.ts adds the CSP + nonce here).
  // Must be a Headers instance, or NextResponse.next throws.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // …rest unchanged
```

Test `test/supabase-middleware.test.ts`: mock `@/lib/env` (`{ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } }`) and `@supabase/ssr` (`createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })`); call `updateSession(req, headers)` where `headers` has `x-nonce: n1`; assert `response.headers.get('x-middleware-request-x-nonce') === 'n1'` and `response.headers.get('x-middleware-override-headers')` contains `x-nonce`. (If Next names these internals differently in 16.3, inspect `node_modules/next/dist/server/web/spec-extension/response.js` and assert on what it actually sets.) Write it first, watch it fail, then make the change.

- [ ] **Step 6: Proxy tests (failing first)** — in `test/proxy.test.ts` add `vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } }));` and a `describe('content security policy')`:
  - a passthrough response carries `Content-Security-Policy` containing `'strict-dynamic'` and a `'nonce-<value>'`, and it is still the identical `passthrough` object;
  - `mockedUpdateSession.mock.calls[0][1]` is a `Headers` whose `x-nonce` equals the nonce in the response CSP and whose `content-security-policy` equals the response CSP exactly;
  - a redirect (signed-out GET `/boards`) also carries the CSP header;
  - two requests get different nonces;
  - a client-supplied `x-nonce: attacker` request header is overwritten (forwarded value ≠ `attacker`).

- [ ] **Step 7: Implement in `proxy.ts`**

```ts
import { CSP_HEADER, NONCE_HEADER, buildContentSecurityPolicy, generateNonce } from '@/lib/csp';
import { env } from '@/lib/env';

/** Every response the proxy returns carries the policy — redirects included. */
function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === 'development',
  });

  // Overwrites any client-sent values. Next reads the nonce from the CSP request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const { response, user } = await updateSession(request, requestHeaders);
  // …existing branches unchanged, each `return X` → `return withCsp(X, csp)`
}
```

Keep `config.matcher` exactly as is.

- [ ] **Step 8: `app/layout.tsx`** — make the root layout async, read the nonce, pass it to next-themes:

```tsx
import { headers } from 'next/headers';
import { NONCE_HEADER } from '@/lib/csp';
…
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request renders every route per request — required, because a
  // prerendered page carries no nonce and 'strict-dynamic' would block its scripts.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  …
        <ThemeProvider nonce={nonce} attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

- [ ] **Step 9: `next.config.ts`** — replace the CSP TODO comment (~L13-16) with: the CSP is set per request in `proxy.ts` (nonce-based, `lib/csp.ts`); never add one here — a static header has no nonce, and two CSP headers are both enforced. Change no config values.

- [ ] **Step 10: Run** `pnpm vitest run test/csp.test.ts test/proxy.test.ts test/supabase-middleware.test.ts` — PASS, pristine. `pnpm typecheck`, `pnpm lint` clean for your files. Then `pnpm build` and confirm in the route table that `/login` and `/register` are now dynamic (`ƒ`), not static (`○`). (If the build fails only because of a concurrent implementer's file, note it and move on.)

- [ ] **Step 11: Commit**

```bash
git add lib/csp.ts test/csp.test.ts test/supabase-middleware.test.ts
git commit -m "feat(security): add per-request nonce Content-Security-Policy" -- lib/csp.ts test/csp.test.ts test/supabase-middleware.test.ts proxy.ts lib/supabase/middleware.ts app/layout.tsx next.config.ts test/proxy.test.ts
```

---

### Task 5: Rate-limit the invitation actions

**Prerequisites:** Tasks 1 and 3 committed.

**Files:**
- Modify: `app/actions/invitation-actions.ts`
- Test: `test/collaboration-actions.test.ts`, `test/analytics.test.ts`

**Interfaces:**
- Consumes: `enforceRateLimit(userId, bucket)`, `RateLimitError` from `@/lib/rate-limit` (Task 3); Task 1's `acceptInvitation` flow (`requireAuth()` → token lookup → `isInvitationActive` → `invitationEmailMatches` → …).

- [ ] **Step 1: Failing tests.** Add to both `test/collaboration-actions.test.ts` and `test/analytics.test.ts`:

```ts
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: vi.fn(async () => {}),
}));
```

In `test/collaboration-actions.test.ts` (`const mockedLimit = enforceRateLimit as unknown as Mock`):
  - `createInvitation` (as owner) calls `mockedLimit` with `(USER_ID, 'invitationCreate')`; when it rejects with `new RateLimitError(600)`, returns `{ error: 'Too many requests, try again in 10 min' }` and `db.invitation.create` is not called.
  - `acceptInvitation('tok_abc')` calls it with `(USER_ID, 'invitationAccept')`; when blocked, `db.invitation.findUnique` is not called (the token is never looked up) and the error is returned.
  - `revokeInvitation` calls it with `(USER_ID, 'mutation')`.
  - `addBoardMember` calls it with `(USER_ID, 'memberAdd')`; `removeBoardMember` / `changeMemberRole` with `'mutation'` (one assertion each is enough).
  - Signed out (`getUser` returns no user): `acceptInvitation` does not call `mockedLimit`.
  - The limiter is never called with the token: `expect(JSON.stringify(mockedLimit.mock.calls)).not.toContain('tok_abc')`.

Run `pnpm vitest run test/collaboration-actions.test.ts` — the invitation-bucket tests FAIL (board-actions ones already pass from Task 3).

- [ ] **Step 2: Implement** in `app/actions/invitation-actions.ts`: `import { enforceRateLimit } from '@/lib/rate-limit';`
  - `createInvitation`: `await enforceRateLimit(user.id, 'invitationCreate');` right after `requireBoardAccess(id, OWNER_ROLES)` (before `createInvitationSchema.parse`).
  - `revokeInvitation`: `const { user } = await requireBoardAccess(invitation.boardId, OWNER_ROLES); await enforceRateLimit(user.id, 'mutation');`
  - `acceptInvitation`: `await enforceRateLimit(user.id, 'invitationAccept');` right after `const user = await requireAuth();`, before `prisma.invitation.findUnique`.
  - `getInvitations` (read): no limit.

- [ ] **Step 3: Run** `pnpm vitest run test/collaboration-actions.test.ts test/analytics.test.ts` — PASS, pristine (no `rateLimit(...) failed open` noise). `pnpm typecheck`, `pnpm lint`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(security): apply stricter rate limits to invite create and accept" -- app/actions/invitation-actions.ts test/collaboration-actions.test.ts test/analytics.test.ts
```

---

### Task 6: Return to the original page after login

**Prerequisites:** Task 4 committed (you edit the CSP-aware `proxy.ts`; keep every `withCsp(...)` wrapper).

**Files:**
- Modify: `lib/auth/redirects.ts` (`sanitizeNext`), `proxy.ts`, `app/(auth)/login/page.tsx` (Sign-up link only)
- Test: `test/collaboration-validations.test.ts` (sanitizeNext block), `test/proxy.test.ts`, `test/auth-callback-route.test.ts`, create `test/login-page.test.tsx`

**Interfaces:**
- Consumes: `withCsp` in `proxy.ts` (Task 4); `ROUTES`, `DEFAULT_REDIRECT`, `sanitizeNext` in `lib/auth/redirects.ts`.
- Produces: `sanitizeNext(next: string | null | undefined): string` — same signature, stricter.

Context: login/register are client components that already read `?next`, run `sanitizeNext`, and forward it on password login (`router.push(next)`), GitHub OAuth (`redirectTo: …/auth/callback?next=…`) and email confirmation; the OAuth callback already sanitizes. Only `proxy.ts` never sets `next`. **Live bug:** `sanitizeNext('/\t/evil.com')` passes the current guard, and the URL parser strips tab/CR/LF, so `new URL('/\t/evil.com', origin)` → `https://evil.com/` (open redirect via `/login?next=%2F%09%2Fevil.com`, both password login and OAuth). Fix it first.

- [ ] **Step 1: Failing sanitizeNext tests** — extend the `describe('sanitizeNext')` block in `test/collaboration-validations.test.ts`:

```ts
  it('rejects control characters the URL parser would strip into //host', () => {
    for (const evil of ['/\t/evil.com', '/\n/evil.com', '/\r\n/evil.com', '/\t\\evil.com', '/\u0000/x']) {
      expect(sanitizeNext(evil)).toBe('/boards');
      expect(new URL(sanitizeNext(evil), 'https://app.example.com').origin).toBe('https://app.example.com');
    }
  });

  it('rejects any backslash and dot-segment tricks that normalize to //host', () => {
    expect(sanitizeNext('/foo\\bar')).toBe('/boards');
    expect(sanitizeNext('/..//evil.com')).toBe('/boards');
    expect(sanitizeNext('/.//evil.com')).toBe('/boards');
  });

  it('keeps encoded slashes as a same-origin path', () => {
    expect(new URL(sanitizeNext('/%2F%2Fevil.com'), 'https://app.example.com').origin).toBe('https://app.example.com');
  });

  it('preserves query and hash', () => {
    expect(sanitizeNext('/board/xyz?tab=1#c')).toBe('/board/xyz?tab=1#c');
  });
```

Run `pnpm vitest run test/collaboration-validations.test.ts` — FAIL.

- [ ] **Step 2: Harden** `lib/auth/redirects.ts` — replace `sanitizeNext` (update its doc comment to describe the control-char/normalization defenses):

```ts
/** Parse base for `sanitizeNext`; `.invalid` can never resolve. */
const SENTINEL_ORIGIN = 'http://n.invalid';

export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return DEFAULT_REDIRECT;
  // The URL parser silently strips tab/CR/LF, so '/\t/evil.com' would become
  // '//evil.com'. Reject every C0 control, DEL and backslash outright.
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return DEFAULT_REDIRECT;

  let url: URL;
  try {
    url = new URL(next, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (url.origin !== SENTINEL_ORIGIN) return DEFAULT_REDIRECT;

  const normalized = url.pathname + url.search + url.hash;
  // '/..//x' and '/.//x' normalize to '//x', protocol-relative if reused as a path.
  return normalized.startsWith('//') ? DEFAULT_REDIRECT : normalized;
}
```

(The regex is a literal control-char class — if `no-control-regex` lint fires, add `// eslint-disable-next-line no-control-regex -- matching control chars is the point`.) Run — PASS.

- [ ] **Step 3: Callback regression test** — in `test/auth-callback-route.test.ts` add: `GET(request('?code=abc&next=%2F%09%2Fevil.com'))` with a successful exchange → Location origin is `https://app.example.com` and path `/boards`. Should PASS now (guard already fixed) — confirm it FAILS if you temporarily revert the guard, then restore.

- [ ] **Step 4: Proxy tests (failing first)** in `test/proxy.test.ts` (keep every existing test; helper `const nextParam = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('next');`):
  - signed-out GET `/board/abc?tab=1` → path `/login`, `next` = `/board/abc?tab=1`;
  - signed-out HEAD `/board/abc` → carries `next=/board/abc`;
  - signed-out GET `/boards` → exactly `/login` (no `next` — it's the default destination);
  - signed-out POST `/board/abc` → exactly `/login`, no `next`;
  - signed-out GET of raw `new NextRequest(\`${ORIGIN}//evil.com\`)` → `/login`, no `next`;
  - signed-in GET `/login?next=%2Fboard%2Fabc` → `/board/abc`; same for `/register?next=%2Fboard%2Fabc`;
  - signed-in GET `/login?next=` each of `%2F%09%2Fevil.com`, `%2F%2Fevil.com`, `https%3A%2F%2Fevil.com` → path `/boards` and Location origin `https://app.example.com`;
  - signed-in GET `/login?next=%2Flogin` → `/boards` (no bounce back onto an auth page);
  - signed-in POST `/login?next=%2Fboard%2Fabc` → passes through by identity;
  - redirects still carry the CSP header.

- [ ] **Step 5: Implement in `proxy.ts`** (import `DEFAULT_REDIRECT`, `sanitizeNext` from `@/lib/auth/redirects`):

```ts
/** Login URL for a signed-out visitor, remembering where a navigation was headed. */
function loginUrl(request: NextRequest): URL {
  const url = new URL(LOGIN_ROUTE, request.url);
  // Only a navigation can come back here: a Server Action POST is a fetch the
  // browser never lands on. Path + query only — never the origin.
  if (isDocumentRequest(request.method)) {
    const { pathname, search } = request.nextUrl;
    const next = sanitizeNext(pathname + search);
    if (next !== DEFAULT_REDIRECT) url.searchParams.set('next', next);
  }
  return url;
}

/** Where a signed-in visitor to /login or /register goes: their `next`, if safe. */
function postLoginUrl(request: NextRequest): URL {
  const target = new URL(sanitizeNext(request.nextUrl.searchParams.get('next')), request.url);
  return isAuthRoute(target.pathname) ? new URL(DEFAULT_AUTHENTICATED_ROUTE, request.url) : target;
}
```

Use `loginUrl(request)` in the signed-out branch and `postLoginUrl(request)` in the signed-in bounce, both still through `redirectWithCookies` and `withCsp`.

- [ ] **Step 6: Login page Sign-up link.** In `app/(auth)/login/page.tsx`, the "Sign up" link carries `next` only when the URL had one: `href={searchParams.get('next') ? \`${ROUTES.register}?next=${encodeURIComponent(next)}\` : ROUTES.register}` (use the already-sanitized `next`; fix the typed-route type the same way `app/join/[token]/page.tsx` builds its `?next=` links). Change nothing else on the page.

- [ ] **Step 7: Login page test** `test/login-page.test.tsx` — mirror `test/register-page.test.tsx`'s mocks (`next/navigation` with a controllable `useSearchParams` and `useRouter().push`, and `@/lib/supabase/client` `createClient`):
  - `?next=%2Fboard%2Fabc`: submit valid credentials (`signInWithPassword` resolves `{ error: null }`) → `push('/board/abc')`;
  - `?next=%2F%09%2Fevil.com` → `push('/boards')`;
  - GitHub button → `signInWithOAuth` called with `options.redirectTo` ending in `/auth/callback?next=%2Fboard%2Fabc`;
  - Sign-up link `href` is `/register?next=%2Fboard%2Fabc` with `?next`, and `/register` without.

- [ ] **Step 8: Run** `pnpm vitest run test/collaboration-validations.test.ts test/proxy.test.ts test/auth-callback-route.test.ts test/login-page.test.tsx test/register-page.test.tsx` — PASS, pristine. `pnpm typecheck`, `pnpm lint`.

- [ ] **Step 9: Commit**

```bash
git add test/login-page.test.tsx
git commit -m "fix(auth): return to the original page after login and close a next-param open redirect" -- lib/auth/redirects.ts proxy.ts 'app/(auth)/login/page.tsx' test/collaboration-validations.test.ts test/proxy.test.ts test/auth-callback-route.test.ts test/login-page.test.tsx
```

---

### Task 7: Keep CLAUDE.md and schema comments truthful

**Prerequisites:** Tasks 1–6 committed.

**Files:**
- Modify: `CLAUDE.md`, `prisma/schema.prisma` (Invitation model comments only)

CLAUDE.md says a doc that lies is worse than none, and requires doc changes in the same change set. Read each changed module before describing it; describe the code as it is.

- [ ] **Step 1: `prisma/schema.prisma` Invitation comments:** `email` — now enforced on accept (a bound invite only for that confirmed email; nothing in the UI sets it yet). `expiresAt` — stamped `INVITATION_TTL_DAYS` (7) after creation by `createInvitation`; legacy null rows lapse 7 days after `createdAt` (`lib/invitations.ts`). No field/attribute changes. Run `pnpm prisma format` then confirm `git diff prisma/schema.prisma` shows only comment lines.

- [ ] **Step 2: CLAUDE.md edits:**
  - Project Structure: add `lib/invitations.ts` (invite TTL/expiry/email-binding — pure), `lib/rate-limit.ts` (Postgres fixed-window limiter, fails open), `lib/csp.ts` (per-request nonce CSP builder — pure); update the `proxy.ts` line (route protection + per-request CSP + `next` param); `lib/auth/redirects.ts` if not listed.
  - Authorization: add rule 5 — every mutation calls `enforceRateLimit(user.id, bucket)` right after its guard (`mutation` default; `invitationCreate`, `invitationAccept`, `memberAdd` are stricter); reads and `signOut` are not limited; it throws `RateLimitError` (a `PublicError`, so `toActionError` passes the message) and fails open. Add the call to the Data Access Pattern example.
  - Database: a short `rate_limits` paragraph beside `analytics_events` (not published; RLS on, no policy, no grants; no FK on `user_id` on purpose; one row per bucket+user reset in place; written only via `$queryRaw`); add `rate_limits` to the "RLS with no policy … is deny-all" list.
  - Authentication: proxy sends signed-out document requests to `/login?next=<path+query>` and the signed-in bounce honors a safe `next`; `sanitizeNext` (`lib/auth/redirects.ts`) is the single guard (rejects control chars/backslashes, origin-checks via URL parsing); invites expire after 7 days and email-bound invites need the matching confirmed email.
  - Security headers: new short subsection or bullet — CSP is per request in `proxy.ts`: script nonce + `'strict-dynamic'`, `style-src 'unsafe-inline'` and why, Supabase https/wss, root layout reads `headers()` so every route renders dynamically; never add a CSP in `next.config.ts`; state whether it's enforced or Report-Only (ask the controller's dispatch for the final mode).
  - Known Gaps: remove "No Content-Security-Policy"; update the test-coverage line to include rate limiter, CSP, invitations, board metadata, login `next`.

- [ ] **Step 3:** `pnpm format:check` (fix with `pnpm format` only on your two files if needed).

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document rate limiting, CSP, invite expiry and login redirects" -- CLAUDE.md prisma/schema.prisma
```
