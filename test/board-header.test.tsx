import { useEffect, type Dispatch } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BoardAction, BoardMemberWithProfile, BoardWithDetails } from '@/types';
import type { Role } from '@prisma/client';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { updateBoard, deleteBoard, toastError, toastSuccess } = vi.hoisted(() => ({
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
// Required, not optional: without this the test imports the real `'use server'`
// module and, through it, the real Prisma client.
vi.mock('@/app/actions/board-actions', () => ({ updateBoard, deleteBoard }));
// The dialogs have their own tests and pull in more server actions.
vi.mock('@/components/board/members-dialog', () => ({ MembersDialog: () => null }));
vi.mock('@/components/board/share-board-dialog', () => ({ ShareBoardDialog: () => null }));

import { BoardHeader } from '@/components/board/board-header';
import { BoardProvider, useBoardContext } from '@/contexts/board-context';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

function makeMember(role: Role): BoardMemberWithProfile {
  return {
    id: 'member-1',
    boardId: 'board-1',
    userId: 'user-1',
    role,
    joinedAt: EPOCH,
    profile: {
      id: 'user-1',
      email: 'user-1@example.com',
      fullName: 'Olive Owner',
      avatarUrl: null,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
  };
}

function makeBoard(role: Role): BoardWithDetails {
  /** Only the fields `BoardProvider` and `BoardHeader` read; the rest is cast. */
  return {
    id: 'board-1',
    title: 'QA board',
    description: null,
    columns: [],
    members: [makeMember(role)],
  } as unknown as BoardWithDetails;
}

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

function renderHeader(role: Role = 'OWNER') {
  const board = makeBoard(role);
  const captured: { dispatch?: Dispatch<BoardAction> } = {};
  const user = userEvent.setup();
  render(
    <BoardProvider board={board} currentUserId="user-1" userRole={role}>
      <CaptureDispatch
        onDispatch={(dispatch) => {
          captured.dispatch = dispatch;
        }}
      />
      <BoardHeader onOpenActivity={vi.fn()} />
    </BoardProvider>,
  );
  return { board, captured, user };
}

function heading(): HTMLElement {
  return screen.getByRole('heading', { level: 1 });
}

/** A promise the test settles by hand, to observe state while a request is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function rename(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'QA board' }));
  const input = screen.getByRole('textbox');
  await user.clear(input);
  await user.type(input, `${title}{Enter}`);
}

describe('BoardHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title from board state and follows a realtime SYNC_STATE rename', () => {
    const { board, captured } = renderHeader();
    expect(heading()).toHaveTextContent('QA board');

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

    expect(heading()).toHaveTextContent('Renamed elsewhere');
  });

  it('renames optimistically and keeps the title the server returns', async () => {
    const request = deferred<{ data: BoardWithDetails }>();
    updateBoard.mockReturnValue(request.promise);
    const { board, user } = renderHeader();

    await rename(user, 'Roadmap');

    // The request has not resolved yet, but the header already shows the new title.
    expect(heading()).toHaveTextContent('Roadmap');
    expect(updateBoard).toHaveBeenCalledTimes(1);
    expect(updateBoard).toHaveBeenCalledWith('board-1', { title: 'Roadmap' });

    await act(async () => request.resolve({ data: { ...board, title: 'Roadmap' } }));

    expect(heading()).toHaveTextContent('Roadmap');
    expect(toastSuccess).toHaveBeenCalledWith('Board updated');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('reverts the title and toasts when the rename fails', async () => {
    const request = deferred<{ error: string }>();
    updateBoard.mockReturnValue(request.promise);
    const { user } = renderHeader();

    await rename(user, 'Roadmap');
    expect(heading()).toHaveTextContent('Roadmap');

    await act(async () => request.resolve({ error: 'Failed to update board' }));

    await waitFor(() => expect(heading()).toHaveTextContent('QA board'));
    expect(toastError).toHaveBeenCalledWith('Failed to update board');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('cancels with Escape without saving', async () => {
    const { user } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'QA board' }));
    await user.type(screen.getByRole('textbox'), ' draft{Escape}');

    expect(updateBoard).not.toHaveBeenCalled();
    expect(heading()).toHaveTextContent('QA board');
  });

  it('shows a viewer the title as plain text, not a rename button', () => {
    renderHeader('VIEWER');

    expect(heading()).toHaveTextContent('QA board');
    expect(screen.queryByRole('button', { name: 'QA board' })).not.toBeInTheDocument();
  });
});
