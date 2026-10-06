import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ColumnWithTasks, TaskWithAssignee } from '@/types';

const { updateTask, deleteTask, toastError, toastSuccess } = vi.hoisted(() => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/app/actions/task-actions', () => ({ updateTask, deleteTask }));
vi.mock('@/contexts/board-context', () => ({ useBoardContext: vi.fn() }));

import { TaskDetailDialog } from '@/components/board/task-detail-dialog';
import { useBoardContext } from '@/contexts/board-context';
import { columnActionsId, taskCardId } from '@/lib/dom-ids';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');
const COLUMN_ID = '22222222-2222-4222-8222-222222222222';

function makeTask(id: string, title: string): TaskWithAssignee {
  return {
    id,
    columnId: COLUMN_ID,
    boardId: 'board-1',
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

const TASK = makeTask('11111111-1111-4111-8111-111111111111', 'Write launch post');
const NEXT = makeTask('55555555-5555-4555-8555-555555555555', 'Fix login bug');

function mockBoard(tasks: TaskWithAssignee[], canEdit = true) {
  const column = { id: COLUMN_ID, title: 'To do', tasks } as unknown as ColumnWithTasks;
  vi.mocked(useBoardContext).mockReturnValue({
    state: { columns: [column], members: [] },
    dispatch: vi.fn(),
    canEdit,
  } as unknown as ReturnType<typeof useBoardContext>);
}

interface BoardProps {
  tasks: TaskWithAssignee[];
  /** A new key remounts the cards: a new element under the same id, as after a column move. */
  cardKey?: string;
}

/** Mirrors BoardContent: a card opens the dialog, and `onClose` clears the task. */
function Board({ tasks, cardKey = 'a' }: BoardProps) {
  const [selected, setSelected] = useState<TaskWithAssignee | null>(null);
  return (
    <>
      <button id={columnActionsId(COLUMN_ID)}>To do column actions</button>
      {tasks.map((task) => (
        <button
          key={`${cardKey}-${task.id}`}
          id={taskCardId(task.id)}
          onClick={() => setSelected(task)}
        >
          {task.title}
        </button>
      ))}
      <TaskDetailDialog task={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function renderBoard(tasks: TaskWithAssignee[] = [TASK, NEXT], canEdit = true) {
  mockBoard(tasks, canEdit);
  const user = userEvent.setup();
  const view = render(<Board tasks={tasks} />);
  return { user, ...view };
}

/** Opens the task's dialog the way a keyboard user does: focus the card, press Enter. */
async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>, title: string) {
  screen.getByRole('button', { name: title }).focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog', { name: 'Task details' });
}

beforeAll(() => {
  // Radix (Select, presence) calls these; jsdom implements none of them.
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
  deleteTask.mockResolvedValue({ data: true });
});

// Radix hands focus back on a `setTimeout(0)` after the dialog unmounts, hence `waitFor`.
describe('TaskDetailDialog returns focus', () => {
  it('to the card on Escape', async () => {
    const { user } = renderBoard();
    await openWithKeyboard(user, TASK.title);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.getElementById(taskCardId(TASK.id))).toHaveFocus());
  });

  it("to a viewer's card on Escape", async () => {
    const { user } = renderBoard([TASK, NEXT], false);
    await openWithKeyboard(user, TASK.title);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.getElementById(taskCardId(TASK.id))).toHaveFocus());
  });

  it('to the card after a save', async () => {
    updateTask.mockResolvedValue({ data: { ...TASK, title: 'Write launch thread' } });
    const { user } = renderBoard();
    await openWithKeyboard(user, TASK.title);

    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Write launch thread');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(document.getElementById(taskCardId(TASK.id))).toHaveFocus());
    expect(updateTask).toHaveBeenCalledWith(TASK.id, { title: 'Write launch thread' });
  });

  it('to whichever element has the card id at close time', async () => {
    const { user, rerender } = renderBoard();
    await openWithKeyboard(user, TASK.title);
    const original = document.getElementById(taskCardId(TASK.id));

    rerender(<Board tasks={[TASK, NEXT]} cardKey="moved" />);
    const moved = document.getElementById(taskCardId(TASK.id));
    expect(moved).not.toBe(original);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(moved).toHaveFocus());
  });

  it('to the next card in the column after a delete', async () => {
    const { user } = renderBoard();
    await openWithKeyboard(user, TASK.title);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete task' }));

    await waitFor(() => expect(document.getElementById(taskCardId(NEXT.id))).toHaveFocus());
    expect(deleteTask).toHaveBeenCalledWith(TASK.id);
  });

  it('to the previous card when the deleted one was last', async () => {
    const { user } = renderBoard([NEXT, TASK]);
    await openWithKeyboard(user, TASK.title);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete task' }));

    await waitFor(() => expect(document.getElementById(taskCardId(NEXT.id))).toHaveFocus());
  });

  it("to the column's menu button after deleting its only card", async () => {
    const { user } = renderBoard([TASK]);
    await openWithKeyboard(user, TASK.title);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete task' }));

    await waitFor(() => expect(document.getElementById(columnActionsId(COLUMN_ID))).toHaveFocus());
  });

  it('picks the neighbour from the board as it is when the delete lands', async () => {
    let finishDelete!: (result: { data: true }) => void;
    deleteTask.mockReturnValue(new Promise((resolve) => (finishDelete = resolve)));
    const LATER = makeTask('66666666-6666-4666-8666-666666666666', 'Ship release notes');
    const { user, rerender } = renderBoard();
    await openWithKeyboard(user, TASK.title);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete task' }));

    // While the request is in flight a collaborator's change lands: NEXT is gone, LATER follows.
    mockBoard([TASK, LATER]);
    rerender(<Board tasks={[TASK, LATER]} />);
    finishDelete({ data: true });

    await waitFor(() => expect(document.getElementById(taskCardId(LATER.id))).toHaveFocus());
  });

  it('to the Delete button when the delete is cancelled', async () => {
    const { user } = renderBoard();
    await openWithKeyboard(user, TASK.title);
    const deleteButton = screen.getByRole('button', { name: 'Delete' });

    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('to the Delete button when the confirm is dismissed with Escape', async () => {
    const { user } = renderBoard();
    await openWithKeyboard(user, TASK.title);
    const deleteButton = screen.getByRole('button', { name: 'Delete' });

    await user.click(deleteButton);
    await screen.findByRole('alertdialog', { name: 'Delete this task?' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
  });
});
