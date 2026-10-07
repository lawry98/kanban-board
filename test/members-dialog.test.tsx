import { useEffect, type Dispatch } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BoardAction, BoardMemberWithProfile, BoardWithDetails } from '@/types';
import type { Role } from '@prisma/client';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { changeMemberRole, removeBoardMember, toastError, toastSuccess } = vi.hoisted(() => ({
  changeMemberRole: vi.fn(),
  removeBoardMember: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
// Required, not optional: without this the test imports the real `'use server'`
// module and, through it, the real Prisma client.
vi.mock('@/app/actions/board-actions', () => ({
  changeMemberRole,
  removeBoardMember,
  leaveBoard: vi.fn(),
}));

import { MembersDialog } from '@/components/board/members-dialog';
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

const owner = makeMember('member-1', 'user-1', 'Olive Owner', 'OWNER');
const editor = makeMember('member-2', 'user-2', 'Ada Lovelace', 'EDITOR');

/** Only the fields `BoardProvider` and `MembersDialog` read; the rest is cast. */
const board = {
  id: 'board-1',
  title: 'QA board',
  columns: [],
  members: [owner, editor],
} as unknown as BoardWithDetails;

beforeAll(() => {
  // Radix Select calls these on open; jsdom implements neither.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

/** Hands the provider's dispatch to the test, standing in for `useRealtime`. */
function CaptureDispatch({
  onDispatch,
}: {
  onDispatch: (dispatch: Dispatch<BoardAction>) => void;
}) {
  const { dispatch } = useBoardContext();
  useEffect(() => onDispatch(dispatch), [dispatch, onDispatch]);
  return null;
}

function renderDialog(currentUserId = 'user-1', userRole: Role = 'OWNER') {
  const captured: { dispatch?: Dispatch<BoardAction> } = {};
  const user = userEvent.setup();
  render(
    <BoardProvider board={board} currentUserId={currentUserId} userRole={userRole}>
      <CaptureDispatch
        onDispatch={(dispatch) => {
          captured.dispatch = dispatch;
        }}
      />
      <MembersDialog open onOpenChange={vi.fn()} />
    </BoardProvider>,
  );
  return { captured, user };
}

function memberRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`No member row for ${name}`);
  return row;
}

function memberNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent ?? '')
    .filter(Boolean);
}

async function chooseRole(user: ReturnType<typeof userEvent.setup>, label: 'Editor' | 'Viewer') {
  await user.click(within(memberRow('Ada Lovelace')).getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('MembersDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the changed role without waiting for a realtime resync', async () => {
    changeMemberRole.mockResolvedValue({ data: { ...editor, role: 'VIEWER' } });
    const { user } = renderDialog();

    await chooseRole(user, 'Viewer');

    await waitFor(() =>
      expect(within(memberRow('Ada Lovelace')).getByRole('combobox')).toHaveTextContent('Viewer'),
    );
    expect(changeMemberRole).toHaveBeenCalledWith('board-1', 'user-2', { role: 'VIEWER' });
    expect(toastSuccess).toHaveBeenCalledWith('Role updated');
  });

  it('keeps the old role when the change fails', async () => {
    changeMemberRole.mockResolvedValue({ error: 'Failed to change member role' });
    const { user } = renderDialog();

    await chooseRole(user, 'Viewer');

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to change member role'));
    expect(within(memberRow('Ada Lovelace')).getByRole('combobox')).toHaveTextContent('Editor');
  });

  it('drops a removed member from the list without waiting for a realtime resync', async () => {
    removeBoardMember.mockResolvedValue({ data: { id: 'member-2' } });
    const { user } = renderDialog();

    await user.click(within(memberRow('Ada Lovelace')).getByRole('button', { name: 'Remove' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(memberNames()).toEqual(['Olive Owner (you)']));
    expect(removeBoardMember).toHaveBeenCalledWith('board-1', 'user-2');
    expect(toastSuccess).toHaveBeenCalledWith('Member removed');
  });

  it('keeps the member listed when the removal fails', async () => {
    removeBoardMember.mockResolvedValue({ error: 'User is not a member of this board' });
    const { user } = renderDialog();

    await user.click(within(memberRow('Ada Lovelace')).getByRole('button', { name: 'Remove' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('User is not a member of this board'),
    );
    expect(memberNames()).toEqual(['Olive Owner (you)', 'Ada Lovelace']);
  });

  it('draws avatar initials in the foreground colour', () => {
    renderDialog();

    // muted-foreground on the fallback's muted background is 4.35:1, under AA's 4.5:1.
    expect(within(memberRow('Ada Lovelace')).getByText('AD')).toHaveClass('text-foreground');
  });

  it('names the board by its live title in the leave confirmation', async () => {
    const { captured, user } = renderDialog('user-2', 'EDITOR');

    act(() =>
      captured.dispatch?.({
        type: 'SYNC_STATE',
        payload: {
          meta: { title: 'Renamed elsewhere', description: null },
          columns: [],
          members: board.members,
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Leave board' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'You will lose access to Renamed elsewhere.',
    );
  });
});
