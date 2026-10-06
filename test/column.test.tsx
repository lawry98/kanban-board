import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DragDropContext } from '@hello-pangea/dnd';

import type * as BoardContextModule from '@/contexts/board-context';
import type { BoardWithDetails, ColumnWithTasks, TaskWithAssignee } from '@/types';

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

function makeTask(id: string, title: string): TaskWithAssignee {
  return {
    id,
    columnId: COLUMN.id,
    boardId: COLUMN.boardId,
    title,
    description: null,
    position: 1000,
    priority: 'NONE',
    labels: [],
    dueDate: null,
    assigneeId: null,
    createdBy: 'user-1',
    createdAt: EPOCH,
    updatedAt: EPOCH,
    assignee: null,
    creator: null,
  };
}

function mockContext(canEdit = true) {
  vi.mocked(useBoardContext).mockReturnValue({
    state: { columns: [COLUMN], members: [] },
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

/** Lets Radix finish closing the menu: FocusScope hands focus back on a `setTimeout(0)` after unmount. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

beforeAll(() => {
  // Radix (menu positioning) calls these; jsdom implements none of them.
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

afterEach(() => {
  vi.restoreAllMocks();
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
    const input = screen.getByRole('textbox', { name: 'Task title' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('maxlength', '255');
  });
});

describe('Column add task', () => {
  async function openComposer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    return screen.getByRole('textbox', { name: 'Task title' });
  }

  async function expectFocusBackOnAddTask() {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add task' })).toHaveFocus());
    expect(screen.queryByRole('textbox', { name: 'Task title' })).not.toBeInTheDocument();
  }

  it('closes and returns focus to Add task after a create', async () => {
    createTask.mockResolvedValue({ data: makeTask('t1', 'Write launch post') });
    const user = userEvent.setup();
    renderColumn();

    await user.type(await openComposer(user), 'Write launch post{Enter}');

    await expectFocusBackOnAddTask();
    expect(createTask).toHaveBeenCalledWith({ columnId: COLUMN.id, title: 'Write launch post' });
  });

  it('closes and returns focus to Add task on Escape', async () => {
    const user = userEvent.setup();
    renderColumn();

    await user.type(await openComposer(user), 'Draft{Escape}');

    await expectFocusBackOnAddTask();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('closes and returns focus to Add task on Cancel', async () => {
    const user = userEvent.setup();
    renderColumn();

    await openComposer(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await expectFocusBackOnAddTask();
  });

  it('keeps focus in the input while the create is in flight and after it fails', async () => {
    let finish!: (result: { error: string }) => void;
    createTask.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderColumn();

    const input = await openComposer(user);
    await user.type(input, 'Write launch post{Enter}');

    // Read-only, not disabled: a disabled input drops focus to <body>.
    expect(input).toHaveAttribute('readonly');
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();

    await act(async () => finish({ error: 'Not allowed' }));

    expect(toastError).toHaveBeenCalledWith('Not allowed');
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveValue('Write launch post');
  });

  it('toasts and can retry when the create rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    createTask.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderColumn();

    const input = await openComposer(user);
    await user.type(input, 'Write launch post{Enter}');

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to create task'));
    expect(consoleError).toHaveBeenCalled();
    expect(input).not.toHaveAttribute('readonly');

    createTask.mockResolvedValue({ data: makeTask('t1', 'Write launch post') });
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await expectFocusBackOnAddTask();
    expect(createTask).toHaveBeenCalledTimes(2);
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

  it('saves once on click-away and leaves focus where the user clicked', async () => {
    const user = userEvent.setup();
    renderColumn();
    const trigger = screen.getByRole('button', { name: 'To do column actions' });

    await user.click(screen.getByRole('heading', { name: 'To do' }));
    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await user.clear(input);
    await user.type(input, 'Doing');
    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Column name' })).not.toBeInTheDocument(),
    );
    expect(updateColumn).toHaveBeenCalledTimes(1);
    expect(updateColumn).toHaveBeenCalledWith('col-1', { title: 'Doing' });
    expect(trigger).not.toHaveFocus();
  });

  it('reverts the title, toasts, and closes the editor when the save returns an error', async () => {
    updateColumn.mockResolvedValue({ error: 'Not allowed' });
    const user = userEvent.setup();
    renderColumn();

    await user.click(screen.getByRole('heading', { name: 'To do' }));
    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await user.clear(input);
    await user.type(input, 'Doing{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Column name' })).not.toBeInTheDocument(),
    );
    expect(toastError).toHaveBeenCalledWith('Not allowed');
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument();

    // The draft is gone: reopening shows the original title, not the rejected one.
    await user.click(screen.getByRole('heading', { name: 'To do' }));
    expect(await screen.findByRole('textbox', { name: 'Column name' })).toHaveValue('To do');
  });

  // A collaborator's rename arrives as a new `column` prop while the editor is closed.
  it('opens the editor on the current title after a realtime rename (heading click)', async () => {
    const user = userEvent.setup();
    const { rerender } = renderColumn();
    rerender(
      <DragDropContext onDragEnd={() => {}}>
        <Column column={{ ...COLUMN, title: 'Backlog' }} onTaskClick={() => {}} />
      </DragDropContext>,
    );

    await user.click(screen.getByRole('heading', { name: 'Backlog' }));
    expect(await screen.findByRole('textbox', { name: 'Column name' })).toHaveValue('Backlog');
  });

  it('opens the editor on the current title after a realtime rename (menu)', async () => {
    const user = userEvent.setup();
    const { rerender } = renderColumn();
    rerender(
      <DragDropContext onDragEnd={() => {}}>
        <Column column={{ ...COLUMN, title: 'Backlog' }} onTaskClick={() => {}} />
      </DragDropContext>,
    );

    await user.click(screen.getByRole('button', { name: 'Backlog column actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await settle();
    expect(input).toHaveValue('Backlog');
    expect(input).toHaveAttribute('maxlength', '100');
  });

  it('recovers when the save rejects: toasts, closes the editor, and can save again', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateColumn.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderColumn();

    await user.click(screen.getByRole('heading', { name: 'To do' }));
    const input = await screen.findByRole('textbox', { name: 'Column name' });
    await user.clear(input);
    await user.type(input, 'Doing{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Column name' })).not.toBeInTheDocument(),
    );
    expect(toastError).toHaveBeenCalledWith('Failed to rename column');
    expect(consoleError).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument();

    // The in-flight guard was released: the editor reopens with the original title and saves.
    await user.click(screen.getByRole('heading', { name: 'To do' }));
    const reopened = await screen.findByRole('textbox', { name: 'Column name' });
    expect(reopened).toHaveValue('To do');
    await user.clear(reopened);
    await user.type(reopened, 'Doing{Enter}');

    await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(2));
    expect(updateColumn).toHaveBeenLastCalledWith('col-1', { title: 'Doing' });
  });
});

describe('Column semantics', () => {
  function countBadge() {
    return screen
      .getByRole('heading', { name: 'To do' })
      .parentElement!.querySelector('[data-slot="badge"]');
  }

  it('heads the column with an h2 and names its task list after it', () => {
    renderColumn({ ...COLUMN, tasks: [makeTask('t1', 'Write launch post')] });
    expect(screen.getByRole('heading', { level: 2, name: 'To do' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'To do' })).toContainElement(
      screen.getByRole('button', { name: 'Write launch post' }),
    );
  });

  it('keeps the task list named while the heading is swapped for the rename input', async () => {
    const user = userEvent.setup();
    renderColumn({ ...COLUMN, tasks: [makeTask('t1', 'Write launch post')] });

    await user.click(screen.getByRole('heading', { name: 'To do' }));
    expect(await screen.findByRole('textbox', { name: 'Column name' })).toBeInTheDocument();

    expect(screen.getByRole('group', { name: 'To do' })).toBeInTheDocument();
  });

  it('says what the count badge counts', () => {
    const { unmount } = renderColumn({ ...COLUMN, tasks: [makeTask('t1', 'Write launch post')] });
    expect(countBadge()).toHaveTextContent(/^1 task$/);
    unmount();

    renderColumn({
      ...COLUMN,
      tasks: [makeTask('t1', 'Write launch post'), makeTask('t2', 'Fix login bug')],
    });
    expect(countBadge()).toHaveTextContent(/^2 tasks$/);
  });
});

describe('Column scroll structure', () => {
  it('renders its task list as a plain element with no scroll container of its own', () => {
    const { container } = renderColumn();
    expect(container.querySelector('[data-radix-scroll-area-viewport]')).toBeNull();

    const list = container.querySelector<HTMLElement>(`[data-rfd-droppable-id="${COLUMN.id}"]`);
    expect(list).not.toBeNull();
    for (let el = list; el && el !== container; el = el.parentElement) {
      expect(el.className).not.toMatch(/\boverflow-/);
      // Radix ScrollArea sets overflow inline rather than by class.
      expect(el.style.overflowX + el.style.overflowY).not.toMatch(/auto|scroll/);
    }
  });

  it('keeps the add-task control inside the stretched list, right after the last card', async () => {
    const user = userEvent.setup();
    const { container } = renderColumn({
      ...COLUMN,
      tasks: [makeTask('t1', 'Write launch post'), makeTask('t2', 'Fix login bug')],
    });
    const list = container.querySelector(`[data-rfd-droppable-id="${COLUMN.id}"]`)!;
    const lastCard = screen.getByRole('button', { name: 'Fix login bug' });
    const addTask = screen.getByRole('button', { name: 'Add task' });

    expect(list).toContainElement(lastCard);
    expect(list).toContainElement(addTask);
    expect(
      lastCard.compareDocumentPosition(addTask) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The inline form replaces the button in the same spot.
    await user.click(addTask);
    const input = screen.getByRole('textbox', { name: 'Task title' });
    expect(list).toContainElement(input);
    expect(lastCard.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no add-task control to viewers', () => {
    mockContext(false);
    renderColumn({ ...COLUMN, tasks: [makeTask('t1', 'Write launch post')] });
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });
});

describe('Column delete confirm returns focus', () => {
  const DOING: ColumnWithTasks = { ...COLUMN, id: 'col-2', title: 'Doing', position: 2000 };

  /** Columns on the real board provider, so a confirmed delete really unmounts the column. */
  async function renderBoard() {
    const actual = await vi.importActual<typeof BoardContextModule>('@/contexts/board-context');
    vi.mocked(useBoardContext).mockImplementation(actual.useBoardContext);
    function Columns() {
      const { state } = actual.useBoardContext();
      return state.columns.map((column) => (
        <Column key={column.id} column={column} onTaskClick={() => {}} />
      ));
    }
    const board = {
      id: 'board-1',
      columns: [COLUMN, DOING],
      members: [],
    } as unknown as BoardWithDetails;
    render(
      <actual.BoardProvider board={board} currentUserId="user-1" userRole="OWNER">
        <DragDropContext onDragEnd={() => {}}>
          <Columns />
        </DragDropContext>
      </actual.BoardProvider>,
    );
  }

  async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>, columnTitle: string) {
    await user.click(screen.getByRole('button', { name: `${columnTitle} column actions` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete column' }));
    return screen.findByRole('alertdialog', { name: 'Delete this column?' });
  }

  beforeEach(() => {
    deleteColumn.mockResolvedValue({ data: true });
  });

  it("goes back to the column's menu button on Cancel", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const trigger = screen.getByRole('button', { name: 'To do column actions' });

    await user.click(trigger);
    // The trigger carries our id, so the menu must still be named by it.
    expect(await screen.findByRole('menu', { name: 'To do column actions' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Delete column' }));
    await screen.findByRole('alertdialog', { name: 'Delete this column?' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(deleteColumn).not.toHaveBeenCalled();
  });

  it("goes back to the column's menu button when the confirm is dismissed with Escape", async () => {
    const user = userEvent.setup();
    await renderBoard();

    await openDeleteConfirm(user, 'To do');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'To do column actions' })).toHaveFocus(),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteColumn).not.toHaveBeenCalled();
  });

  it("moves to the next column's menu button after a delete", async () => {
    const user = userEvent.setup();
    await renderBoard();

    await openDeleteConfirm(user, 'To do');
    await user.click(screen.getByRole('button', { name: 'Delete column' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Doing column actions' })).toHaveFocus(),
    );
    expect(screen.queryByRole('heading', { name: 'To do' })).not.toBeInTheDocument();
    expect(deleteColumn).toHaveBeenCalledWith('col-1');
  });

  it("toasts and returns to the column's menu button when the delete rejects", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteColumn.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderBoard();

    await openDeleteConfirm(user, 'To do');
    await user.click(screen.getByRole('button', { name: 'Delete column' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'To do column actions' })).toHaveFocus(),
    );
    expect(toastError).toHaveBeenCalledWith('Failed to delete column');
    expect(consoleError).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument();
  });

  it("moves to the previous column's menu button after deleting the last column", async () => {
    const user = userEvent.setup();
    await renderBoard();

    await openDeleteConfirm(user, 'Doing');
    await user.click(screen.getByRole('button', { name: 'Delete column' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'To do column actions' })).toHaveFocus(),
    );
    expect(screen.queryByRole('heading', { name: 'Doing' })).not.toBeInTheDocument();
  });
});
