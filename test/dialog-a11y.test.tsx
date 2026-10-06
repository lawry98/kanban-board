import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/actions/task-actions', () => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getActivityLogs: vi.fn(),
}));
vi.mock('@/contexts/board-context', () => ({ useBoardContext: vi.fn() }));

import { ActivityFeed } from '@/components/board/activity-feed';
import { TaskDetailDialog } from '@/components/board/task-detail-dialog';
import { getActivityLogs } from '@/app/actions/task-actions';
import { useBoardContext } from '@/contexts/board-context';
import type { MockInstance } from 'vitest';
import type { TaskWithAssignee } from '@/types';

const COLUMN_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const TASK: TaskWithAssignee = {
  id: '11111111-1111-4111-8111-111111111111',
  columnId: COLUMN_ID,
  boardId: BOARD_ID,
  title: 'Write launch post',
  description: null,
  position: 1000,
  priority: 'NONE',
  labels: [],
  dueDate: null,
  assigneeId: null,
  createdBy: USER_ID,
  createdAt: new Date('2026-09-01T15:00:00.000Z'),
  updatedAt: new Date('2026-09-01T15:00:00.000Z'),
  assignee: null,
  creator: { id: USER_ID, fullName: 'Ada Lovelace', avatarUrl: null },
};

function mockBoardContext(canEdit: boolean) {
  vi.mocked(useBoardContext).mockReturnValue({
    state: { columns: [{ id: COLUMN_ID, title: 'To do' }], members: [] },
    dispatch: vi.fn(),
    canEdit,
  } as unknown as ReturnType<typeof useBoardContext>);
}

// Radix reports a dialog without a description with this console.warn on mount.
const MISSING_DESCRIPTION = /Missing `Description`/;

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function expectNoMissingDescriptionWarning() {
  const messages = warn.mock.calls.map((args) => String(args[0]));
  expect(messages.filter((message) => MISSING_DESCRIPTION.test(message))).toEqual([]);
}

describe('dialog accessible descriptions', () => {
  it('TaskDetailDialog describes itself to editors', () => {
    mockBoardContext(true);
    render(<TaskDetailDialog task={TASK} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Task details' })).toHaveAccessibleDescription(
      "View and edit this task's details.",
    );
    expectNoMissingDescriptionWarning();
  });

  it('TaskDetailDialog does not promise editing to viewers', () => {
    mockBoardContext(false);
    render(<TaskDetailDialog task={TASK} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Task details' })).toHaveAccessibleDescription(
      "View this task's details.",
    );
    expectNoMissingDescriptionWarning();
  });

  it('ActivityFeed describes itself', async () => {
    vi.mocked(getActivityLogs).mockResolvedValue({ data: [] });
    render(<ActivityFeed boardId={BOARD_ID} open onOpenChange={vi.fn()} />);
    await screen.findByText('No activity yet');

    expect(screen.getByRole('dialog', { name: 'Activity' })).toHaveAccessibleDescription(
      'Recent changes to this board.',
    );
    expectNoMissingDescriptionWarning();
  });
});

describe('TaskDetailDialog field names', () => {
  it('names every field for editors', () => {
    mockBoardContext(true);
    render(<TaskDetailDialog task={{ ...TASK, labels: ['launch'] }} onClose={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Write launch post');
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Column' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toHaveAttribute('type', 'date');
    expect(screen.getByRole('textbox', { name: 'Labels' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove label launch' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('names the read-only fields for viewers', () => {
    mockBoardContext(false);
    render(<TaskDetailDialog task={{ ...TASK, labels: ['launch'] }} onClose={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Column' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeDisabled();
    expect(screen.getByLabelText('Due date')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Remove label/ })).not.toBeInTheDocument();
  });
});
