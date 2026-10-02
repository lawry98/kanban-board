import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/task-actions', () => ({ updateTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/contexts/board-context', () => ({ useBoardContext: vi.fn() }));

import { TaskDetailDialog } from '@/components/board/task-detail-dialog';
import { updateTask } from '@/app/actions/task-actions';
import { useBoardContext } from '@/contexts/board-context';
import type { TaskWithAssignee } from '@/types';

import { TIME_ZONES, pinTimeZone } from './time-zone';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const COLUMN_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

/** As Prisma returns it: the due date is UTC midnight of the picked day. */
const TASK: TaskWithAssignee = {
  id: TASK_ID,
  columnId: COLUMN_ID,
  boardId: BOARD_ID,
  title: 'Write launch post',
  description: 'Draft copy',
  position: 1000,
  priority: 'NONE',
  labels: ['launch'],
  dueDate: new Date('2026-10-02T00:00:00.000Z'),
  assigneeId: null,
  createdBy: USER_ID,
  createdAt: new Date('2026-09-01T15:00:00.000Z'),
  updatedAt: new Date('2026-09-01T15:00:00.000Z'),
  assignee: null,
  creator: { id: USER_ID, fullName: 'Ada Lovelace', avatarUrl: null },
};

function renderDialog(task: TaskWithAssignee = TASK) {
  const onClose = vi.fn();
  render(<TaskDetailDialog task={task} onClose={onClose} />);
  return { onClose };
}

describe.each(TIME_ZONES)('TaskDetailDialog due date in %s', (timeZone) => {
  pinTimeZone(timeZone);

  beforeEach(() => {
    vi.mocked(updateTask).mockReset().mockResolvedValue({ data: TASK });
    vi.mocked(useBoardContext).mockReturnValue({
      state: { columns: [{ id: COLUMN_ID, title: 'To do' }], members: [] },
      dispatch: vi.fn(),
      canEdit: true,
    } as unknown as ReturnType<typeof useBoardContext>);
  });

  it('shows the day that was picked', () => {
    renderDialog();
    expect(screen.getByDisplayValue('2026-10-02')).toBeInTheDocument();
  });

  it('a description-only save sends only the description', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.clear(screen.getByDisplayValue('Draft copy'));
    await user.type(screen.getByPlaceholderText('Add a description…'), 'Final copy');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateTask).toHaveBeenCalledOnce();
    expect(updateTask).toHaveBeenCalledWith(TASK_ID, { description: 'Final copy' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sends the newly picked day when the due date changes', async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.change(screen.getByDisplayValue('2026-10-02'), { target: { value: '2026-10-15' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateTask).toHaveBeenCalledWith(TASK_ID, { dueDate: '2026-10-15' });
  });

  it('sends null when the due date is cleared', async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.change(screen.getByDisplayValue('2026-10-02'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateTask).toHaveBeenCalledWith(TASK_ID, { dueDate: null });
  });

  it('closes without a request when nothing changed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('treats an absent description and due date as unchanged', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ ...TASK, description: null, dueDate: null });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
