import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

async function addColumn(title: string): Promise<void> {
  const user = userEvent.setup();
  render(
    <BoardProvider board={board} currentUserId="user-1" userRole="OWNER">
      <ColumnTitles />
      <AddColumnButton />
    </BoardProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Add column' }));
  await user.type(screen.getByPlaceholderText('Column name'), `${title}{Enter}`);
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

  it('shows the created column without waiting for a realtime resync', async () => {
    createColumn.mockResolvedValue({ data: makeColumn('review', 'Review', 2000) });

    await addColumn('Review');

    await waitFor(() => expect(columnTitles()).toEqual(['To do', 'Review']));
    expect(createColumn).toHaveBeenCalledWith({ boardId: 'board-1', title: 'Review' });
    expect(toastSuccess).toHaveBeenCalledWith('Column created');
  });

  it('adds nothing and keeps the form open when the create fails', async () => {
    createColumn.mockResolvedValue({ error: 'A board can have at most 8 columns' });

    await addColumn('Review');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('A board can have at most 8 columns'),
    );
    expect(columnTitles()).toEqual(['To do']);
    expect(screen.getByPlaceholderText('Column name')).toHaveValue('Review');
  });
});
