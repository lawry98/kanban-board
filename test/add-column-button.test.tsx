import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BoardWithDetails, ColumnWithTasks } from '@/types';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { createColumn, toastError, toastSuccess } = vi.hoisted(() => ({
  createColumn: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
// Required, not optional: without this the test imports the real `'use server'`
// module and, through it, the real Prisma client.
vi.mock('@/app/actions/column-actions', () => ({ createColumn }));

import { AddColumnButton } from '@/components/board/add-column-button';
import { BoardProvider, useBoardContext } from '@/contexts/board-context';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

function makeColumn(id: string, title: string, position: number): ColumnWithTasks {
  return {
    id,
    boardId: 'board-1',
    title,
    color: null,
    position,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks: [],
  };
}

/** Only the fields `BoardProvider` and `AddColumnButton` read; the rest is cast. */
const board = {
  id: 'board-1',
  title: 'QA board',
  columns: [makeColumn('todo', 'To do', 1000)],
  members: [],
} as unknown as BoardWithDetails;

/** Renders the column titles from board state — what `BoardContent` maps over. */
function ColumnTitles() {
  const { state } = useBoardContext();
  return (
    <ul aria-label="Columns">
      {state.columns.map((column) => (
        <li key={column.id}>{column.title}</li>
      ))}
    </ul>
  );
}

function renderButton() {
  const user = userEvent.setup();
  render(
    <BoardProvider board={board} currentUserId="user-1" userRole="OWNER">
      <ColumnTitles />
      <AddColumnButton />
    </BoardProvider>,
  );
  return user;
}

async function openForm(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Add column' }));
  return screen.getByPlaceholderText('Column name');
}

async function addColumn(title: string): Promise<void> {
  const user = renderButton();
  await user.type(await openForm(user), `${title}{Enter}`);
}

async function expectFocusBackOnAddColumn() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add column' })).toHaveFocus());
  expect(screen.queryByPlaceholderText('Column name')).not.toBeInTheDocument();
}

function columnTitles(): string[] {
  return within(screen.getByRole('list', { name: 'Columns' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('AddColumnButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the created column without waiting for a realtime resync', async () => {
    createColumn.mockResolvedValue({ data: makeColumn('review', 'Review', 2000) });

    await addColumn('Review');

    await waitFor(() => expect(columnTitles()).toEqual(['To do', 'Review']));
    expect(createColumn).toHaveBeenCalledWith({ boardId: 'board-1', title: 'Review' });
    expect(toastSuccess).toHaveBeenCalledWith('Column created');
    await expectFocusBackOnAddColumn();
  });

  it('names the column name input', async () => {
    const user = renderButton();
    // Not just its placeholder: that vanishes once typing starts.
    expect(await openForm(user)).toHaveAttribute('aria-label', 'Column name');
  });

  it('closes and returns focus to Add column on Escape', async () => {
    const user = renderButton();
    await user.type(await openForm(user), 'Review{Escape}');

    await expectFocusBackOnAddColumn();
    expect(createColumn).not.toHaveBeenCalled();
  });

  it('closes and returns focus to Add column on Cancel', async () => {
    const user = renderButton();
    await user.type(await openForm(user), 'Review');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await expectFocusBackOnAddColumn();
    expect(createColumn).not.toHaveBeenCalled();
  });

  it('stays open while Tab moves from an empty name to Cancel', async () => {
    const user = renderButton();
    await openForm(user);

    await user.tab(); // past the disabled submit button
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await user.keyboard('{Enter}');

    await expectFocusBackOnAddColumn();
  });

  it('closes when focus leaves the form with an empty name', async () => {
    const user = renderButton();
    await openForm(user);

    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Column name')).not.toBeInTheDocument(),
    );
  });

  it('keeps focus in the read-only input while the create is in flight', async () => {
    let finish!: (result: { error: string }) => void;
    createColumn.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await addColumn('Review');

    // Read-only, not disabled: a disabled input drops focus to <body>.
    const input = screen.getByPlaceholderText('Column name');
    expect(input).toHaveAttribute('readonly');
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();

    await act(async () => finish({ error: 'A board can have at most 8 columns' }));
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveFocus();
  });

  it('leaves focus where the user put it when a later empty form closes on blur', async () => {
    let finish!: (result: { data: ColumnWithTasks }) => void;
    createColumn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(
      <BoardProvider board={board} currentUserId="user-1" userRole="OWNER">
        <AddColumnButton />
        <button>Elsewhere</button>
      </BoardProvider>,
    );

    // Esc while the create is in flight; the create then lands and closes the form again.
    await user.type(await openForm(user), 'Review{Enter}{Escape}');
    await expectFocusBackOnAddColumn();
    await act(async () => finish({ data: makeColumn('review', 'Review', 2000) }));

    await openForm(user);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    await user.click(elsewhere);

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Column name')).not.toBeInTheDocument(),
    );
    expect(elsewhere).toHaveFocus();
  });

  it('adds nothing and keeps the form open when the create fails', async () => {
    createColumn.mockResolvedValue({ error: 'A board can have at most 8 columns' });

    await addColumn('Review');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('A board can have at most 8 columns'),
    );
    expect(columnTitles()).toEqual(['To do']);
    expect(screen.getByPlaceholderText('Column name')).toHaveValue('Review');
    expect(screen.getByPlaceholderText('Column name')).toHaveFocus();
  });

  it('toasts and lets the user retry when the create rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    createColumn.mockRejectedValueOnce(new Error('offline'));

    await addColumn('Review');

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to create column'));
    expect(consoleError).toHaveBeenCalled();
    const input = screen.getByPlaceholderText('Column name');
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Review');
  });
});
