import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BoardMemberWithProfile, BoardWithDetails } from '@/types';
import type { Role } from '@prisma/client';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { addBoardMember, getInvitations, toastError, toastSuccess } = vi.hoisted(() => ({
  addBoardMember: vi.fn(),
  getInvitations: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
// Required, not optional: without these the test imports the real `'use server'`
// modules and, through them, the real Prisma client.
vi.mock('@/app/actions/board-actions', () => ({ addBoardMember }));
vi.mock('@/app/actions/invitation-actions', () => ({
  getInvitations,
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

import { ShareBoardDialog } from '@/components/board/share-board-dialog';
import { BoardProvider, useBoardContext } from '@/contexts/board-context';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

function makeMember(id: string, userId: string, fullName: string, role: Role) {
  return {
    id,
    boardId: 'board-1',
    userId,
    role,
    joinedAt: EPOCH,
    profile: {
      id: userId,
      email: `${userId}@example.com`,
      fullName,
      avatarUrl: null,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
  } satisfies BoardMemberWithProfile;
}

/** Only the fields `BoardProvider` and `ShareBoardDialog` read; the rest is cast. */
const board = {
  id: 'board-1',
  title: 'QA board',
  columns: [],
  members: [makeMember('member-1', 'user-1', 'Olive Owner', 'OWNER')],
} as unknown as BoardWithDetails;

/** Renders member names from board state — what `MembersDialog` maps over. */
function MemberNames() {
  const { state } = useBoardContext();
  return (
    <ul aria-label="Members">
      {state.members.map((member) => (
        <li key={member.id}>{member.profile.fullName}</li>
      ))}
    </ul>
  );
}

async function addByEmail(email: string): Promise<void> {
  const user = userEvent.setup();
  render(
    <BoardProvider board={board} currentUserId="user-1" userRole="OWNER">
      <MemberNames />
      <ShareBoardDialog boardId="board-1" open onOpenChange={vi.fn()} />
    </BoardProvider>,
  );

  await user.click(screen.getByRole('tab', { name: 'Add by email' }));
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Add member' }));
}

function memberNames(): string[] {
  // `hidden: true` because the open modal dialog marks its siblings — this probe
  // included — `aria-hidden`.
  return within(screen.getByRole('list', { name: 'Members', hidden: true }))
    .queryAllByRole('listitem', { hidden: true })
    .map((item) => item.textContent ?? '');
}

describe('ShareBoardDialog — add by email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitations.mockResolvedValue({ data: [] });
  });

  it('shows the added member without waiting for a realtime resync', async () => {
    addBoardMember.mockResolvedValue({
      data: makeMember('member-2', 'user-2', 'Ada Lovelace', 'EDITOR'),
    });

    await addByEmail('ada@example.com');

    await waitFor(() => expect(memberNames()).toEqual(['Olive Owner', 'Ada Lovelace']));
    expect(addBoardMember).toHaveBeenCalledWith('board-1', {
      email: 'ada@example.com',
      role: 'EDITOR',
    });
    expect(toastSuccess).toHaveBeenCalledWith('ada@example.com added to the board');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('adds nothing and keeps the email when the add fails', async () => {
    addBoardMember.mockResolvedValue({ error: 'No account found for that email address' });

    await addByEmail('nobody@example.com');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('No account found for that email address'),
    );
    expect(memberNames()).toEqual(['Olive Owner']);
    expect(screen.getByLabelText('Email')).toHaveValue('nobody@example.com');
  });
});
