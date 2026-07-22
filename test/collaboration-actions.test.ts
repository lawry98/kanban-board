import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invitation: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    boardMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import {
  acceptInvitation,
  createInvitation,
  getInvitations,
  revokeInvitation,
} from '@/app/actions/invitation-actions';
import { changeMemberRole, leaveBoard } from '@/app/actions/board-actions';
import { Prisma } from '@prisma/client';

// Valid UUIDs — the actions `uuidSchema.parse()` every client-supplied id.
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_ID = '44444444-4444-4444-8444-444444444444';
const INVITATION_ID = '55555555-5555-4555-8555-555555555555';

// The real Prisma return types are structurally huge and irrelevant to these
// authorization-branch tests, so drive the mocks through a permissive handle.
const db = prisma as unknown as {
  invitation: { findUnique: Mock; findMany: Mock; create: Mock; update: Mock };
  boardMember: { findFirst: Mock; create: Mock; update: Mock; count: Mock; delete: Mock };
  activityLog: { create: Mock };
  $transaction: Mock;
};
const mockedCreateClient = createClient as unknown as Mock;

function signInAs(id = USER_ID): void {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id, email: 'me@example.com' } },
        error: null,
      }),
    },
  });
}

function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    boardId: BOARD_A,
    role: 'EDITOR',
    token: 'tok_abc',
    email: null,
    invitedBy: USER_ID,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    boardId: BOARD_A,
    userId: USER_ID,
    role: 'OWNER',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs();
  // Default: run a $transaction callback against the same mocked client as `tx`.
  db.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  db.activityLog.create.mockResolvedValue({});
});

describe('acceptInvitation', () => {
  it('rejects a revoked link', async () => {
    db.invitation.findUnique.mockResolvedValue(
      makeInvitation({ revokedAt: new Date('2026-01-02T00:00:00.000Z') }),
    );

    const result = await acceptInvitation('tok_abc');

    expect(result).toEqual({ error: 'This invite link is no longer valid' });
    expect(db.boardMember.create).not.toHaveBeenCalled();
  });

  it('rejects an expired link', async () => {
    db.invitation.findUnique.mockResolvedValue(
      makeInvitation({ expiresAt: new Date(Date.now() - 60_000) }),
    );

    const result = await acceptInvitation('tok_abc');

    expect(result).toEqual({ error: 'This invite link is no longer valid' });
    expect(db.boardMember.create).not.toHaveBeenCalled();
  });

  it('is idempotent for an existing member — no duplicate membership created', async () => {
    db.invitation.findUnique.mockResolvedValue(makeInvitation());
    db.boardMember.findFirst.mockResolvedValue({ id: 'member-existing' });

    const result = await acceptInvitation('tok_abc');

    expect(result).toEqual({ data: { boardId: BOARD_A } });
    expect(db.boardMember.create).not.toHaveBeenCalled();
  });

  it('rejects a missing/blank token without hitting the database', async () => {
    const result = await acceptInvitation('');

    expect(result).toEqual({ error: 'This invite link is no longer valid' });
    expect(db.invitation.findUnique).not.toHaveBeenCalled();
  });

  it('creates the membership at the invite role and logs MEMBER_ADDED', async () => {
    db.invitation.findUnique.mockResolvedValue(makeInvitation({ role: 'VIEWER' }));
    db.boardMember.findFirst.mockResolvedValue(null); // not yet a member
    db.boardMember.create.mockResolvedValue({ id: 'member-new' });

    const result = await acceptInvitation('tok_abc');

    expect(result).toEqual({ data: { boardId: BOARD_A } });
    expect(db.boardMember.create).toHaveBeenCalledWith({
      data: { boardId: BOARD_A, userId: USER_ID, role: 'VIEWER' },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'MEMBER_ADDED' }) }),
    );
  });

  it('treats a P2002 unique-violation race as already-a-member', async () => {
    db.invitation.findUnique.mockResolvedValue(makeInvitation());
    db.boardMember.findFirst.mockResolvedValue(null);
    db.boardMember.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await acceptInvitation('tok_abc');

    expect(result).toEqual({ data: { boardId: BOARD_A } });
  });
});

describe('revokeInvitation', () => {
  it('derives the board from the invitation row (anti-IDOR), not from any client id', async () => {
    // The invitation lives on BOARD_B; authorization must be checked against BOARD_B.
    db.invitation.findUnique.mockResolvedValue(makeInvitation({ boardId: BOARD_B }));
    // Caller is not an owner of BOARD_B → requireBoardMember finds nothing.
    db.boardMember.findFirst.mockResolvedValue(null);

    const result = await revokeInvitation(INVITATION_ID);

    expect(result).toEqual({ error: 'Forbidden' });
    // The authorization lookup used the invitation's own board, never a smuggled one.
    expect(db.boardMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ boardId: BOARD_B }) }),
    );
    expect(db.invitation.update).not.toHaveBeenCalled();
  });

  it('rejects a token for a non-existent invitation', async () => {
    db.invitation.findUnique.mockResolvedValue(null);

    const result = await revokeInvitation(INVITATION_ID);

    expect(result).toEqual({ error: 'Invite link not found' });
  });
});

describe('createInvitation', () => {
  it('persists role + inviter and returns a generated token (owner-only)', async () => {
    db.boardMember.findFirst.mockResolvedValue(makeMember({ role: 'OWNER' }));
    db.invitation.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: INVITATION_ID, ...data }),
    );

    const result = await createInvitation(BOARD_A, { role: 'EDITOR' });

    expect('data' in result && result.data).toBeTruthy();
    const created = db.invitation.create.mock.calls[0][0].data;
    expect(created.boardId).toBe(BOARD_A);
    expect(created.role).toBe('EDITOR');
    expect(created.invitedBy).toBe(USER_ID);
    // Unguessable server-generated token, never client input.
    expect(typeof created.token).toBe('string');
    expect(created.token.length).toBeGreaterThan(16);
  });

  it('rejects a non-owner caller before creating anything', async () => {
    db.boardMember.findFirst.mockResolvedValue(null);

    const result = await createInvitation(BOARD_A, { role: 'EDITOR' });

    expect(result).toEqual({ error: 'Forbidden' });
    expect(db.invitation.create).not.toHaveBeenCalled();
  });
});

describe('getInvitations', () => {
  it('queries only active links (non-revoked, non-expired) for the board', async () => {
    db.boardMember.findFirst.mockResolvedValue(makeMember({ role: 'OWNER' }));
    db.invitation.findMany.mockResolvedValue([]);

    const result = await getInvitations(BOARD_A);

    expect(result).toEqual({ data: [] });
    const where = db.invitation.findMany.mock.calls[0][0].where;
    expect(where.boardId).toBe(BOARD_A);
    expect(where.revokedAt).toBeNull();
    // Expiry filter: null (never expires) OR still in the future.
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toContainEqual({ expiresAt: null });
  });
});

describe('changeMemberRole', () => {
  it('rejects a non-owner caller', async () => {
    // requireBoardAccess(OWNER_ROLES): caller has no owner membership.
    db.boardMember.findFirst.mockResolvedValueOnce(null);

    const result = await changeMemberRole(BOARD_A, TARGET_ID, { role: 'VIEWER' });

    expect(result).toEqual({ error: 'Forbidden' });
    expect(db.boardMember.update).not.toHaveBeenCalled();
  });

  it("refuses to change an OWNER's role", async () => {
    // 1) auth: caller is an owner. 2) tx: the target is also an owner.
    db.boardMember.findFirst
      .mockResolvedValueOnce(makeMember({ role: 'OWNER' }))
      .mockResolvedValueOnce(
        makeMember({
          id: 'member-2',
          userId: TARGET_ID,
          role: 'OWNER',
          profile: { email: 'o@x.io' },
        }),
      );

    const result = await changeMemberRole(BOARD_A, TARGET_ID, { role: 'VIEWER' });

    expect(result).toEqual({ error: "Owners' roles can't be changed here" });
    expect(db.boardMember.update).not.toHaveBeenCalled();
  });

  it('rejects an OWNER target role in the payload before any lookup', async () => {
    db.boardMember.findFirst.mockResolvedValueOnce(makeMember({ role: 'OWNER' }));

    const result = await changeMemberRole(BOARD_A, TARGET_ID, { role: 'OWNER' });

    expect(result.error).toBeDefined();
    expect(db.boardMember.update).not.toHaveBeenCalled();
  });

  it('updates a non-owner member and logs MEMBER_ROLE_CHANGED with their email', async () => {
    const updated = makeMember({ id: 'member-2', userId: TARGET_ID, role: 'VIEWER' });
    db.boardMember.findFirst
      .mockResolvedValueOnce(makeMember({ role: 'OWNER' })) // caller is owner
      .mockResolvedValueOnce(
        makeMember({
          id: 'member-2',
          userId: TARGET_ID,
          role: 'EDITOR',
          profile: { email: 'target@x.io' },
        }),
      );
    db.boardMember.update.mockResolvedValue(updated);

    const result = await changeMemberRole(BOARD_A, TARGET_ID, { role: 'VIEWER' });

    expect(result).toEqual({ data: updated });
    expect(db.boardMember.update).toHaveBeenCalledWith({
      where: { id: 'member-2' },
      data: { role: 'VIEWER' },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'MEMBER_ROLE_CHANGED',
          metadata: { email: 'target@x.io', role: 'VIEWER' },
        }),
      }),
    );
  });
});

describe('leaveBoard', () => {
  it('refuses to let the last owner leave', async () => {
    // requireBoardMember: caller is an owner of the board.
    db.boardMember.findFirst.mockResolvedValue(makeMember({ role: 'OWNER' }));
    // Only one owner remains.
    db.boardMember.count.mockResolvedValue(1);

    const result = await leaveBoard(BOARD_A);

    expect(result).toEqual({
      error: 'Cannot leave as the last owner — promote another owner first',
    });
    expect(db.boardMember.delete).not.toHaveBeenCalled();
  });

  it('lets a non-owner leave — deletes their membership and logs MEMBER_REMOVED', async () => {
    db.boardMember.findFirst.mockResolvedValue(makeMember({ id: 'member-self', role: 'EDITOR' }));
    db.boardMember.delete.mockResolvedValue({ id: 'member-self' });

    const result = await leaveBoard(BOARD_A);

    // redirect() is mocked to a no-op, so the action returns past it.
    expect(result).toEqual({ data: { id: BOARD_A } });
    expect(db.boardMember.count).not.toHaveBeenCalled(); // no last-owner check for a non-owner
    expect(db.boardMember.delete).toHaveBeenCalledWith({ where: { id: 'member-self' } });
    expect(db.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'MEMBER_REMOVED' }) }),
    );
  });
});
