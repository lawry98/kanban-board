import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DragDropContext } from '@hello-pangea/dnd';

import type { ColumnWithTasks } from '@/types';

const { updateColumn, deleteColumn, createTask, toastError, toastSuccess } = vi.hoisted(() => ({
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
  createTask: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/app/actions/column-actions', () => ({ updateColumn, deleteColumn }));
vi.mock('@/app/actions/task-actions', () => ({ createTask }));
vi.mock('@/contexts/board-context', () => ({ useBoardContext: vi.fn() }));

import { Column } from '@/components/board/column';
import { useBoardContext } from '@/contexts/board-context';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

const COLUMN: ColumnWithTasks = {
  id: 'col-1',
  boardId: 'board-1',
  title: 'To do',
  color: null,
  position: 1000,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  tasks: [],
};

function mockContext(canEdit = true) {
  vi.mocked(useBoardContext).mockReturnValue({
    dispatch: vi.fn(),
    canEdit,
  } as unknown as ReturnType<typeof useBoardContext>);
}

function renderColumn(column: ColumnWithTasks = COLUMN) {
  return render(
    <DragDropContext onDragEnd={() => {}}>
      <Column column={column} onTaskClick={() => {}} />
    </DragDropContext>,
  );
}

/**
 * Lets Radix finish closing the menu: FocusScope hands focus back on a
 * `setTimeout(0)` after unmount, and the old code refocused at 50 ms.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

beforeAll(() => {
  // Radix (ScrollArea, menu positioning) calls these; jsdom implements none of them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  mockContext();
  updateColumn.mockResolvedValue({ data: { ...COLUMN, title: 'Doing' } });
});

describe('Column menu', () => {
  it('names the menu button after its column', () => {
    renderColumn();
    expect(screen.getByRole('button', { name: 'To do column actions' })).toBeInTheDocument();
  });

  it('names the add-task input', async () => {
    const user = userEvent.setup();
    renderColumn();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveFocus();
  });
});

describe('Column rename', () => {
  it('keeps the rename input open and focused after the menu closes', async () => {
    const user = userEvent.setup();
    renderColumn();

    await user.click(screen.getByRole('button', { name: 'To do column actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await settle();
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(updateColumn).not.toHaveBeenCalled();
  });

  it('renames by keyboard, saves once, and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    renderColumn();
    const trigger = screen.getByRole('button', { name: 'To do column actions' });

    trigger.focus();
    await user.keyboard('{Enter}'); // opens the menu, focusing its first item (Rename)
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus());
    await user.keyboard('{Enter}');

    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await settle();
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, 'Doing{Enter}');

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(updateColumn).toHaveBeenCalledTimes(1);
    expect(updateColumn).toHaveBeenCalledWith('col-1', { title: 'Doing' });
  });

  it('Escape cancels without saving and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    renderColumn();
    const trigger = screen.getByRole('button', { name: 'To do column actions' });

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await settle();

    await user.type(input, ' later{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Column name' })).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
    expect(updateColumn).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument();
  });
});
