import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/actions/task-actions', () => ({ getActivityLogs: vi.fn() }));

import { ActivityFeed } from '@/components/board/activity-feed';
import { getActivityLogs } from '@/app/actions/task-actions';
import type { ActivityLogWithProfile } from '@/app/actions/task-actions';

function makeLog(action: string, metadata: unknown): ActivityLogWithProfile {
  return {
    id: 'log-1',
    action,
    metadata,
    createdAt: new Date('2026-09-01T15:00:00.000Z'),
    profile: { fullName: 'Ada', avatarUrl: null },
  } as unknown as ActivityLogWithProfile;
}

async function renderFeedWith(log: ActivityLogWithProfile): Promise<void> {
  vi.mocked(getActivityLogs).mockResolvedValue({ data: [log] });
  render(<ActivityFeed boardId="board-1" open onOpenChange={vi.fn()} />);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ActivityFeed descriptions', () => {
  it.each([
    ['BOARD_UPDATED', { fields: ['title'], title: 'Roadmap' }, 'renamed the board to "Roadmap"'],
    [
      'BOARD_UPDATED',
      { fields: ['title'], boardTitle: 'Legacy name' },
      'renamed the board to "Legacy name"',
    ],
    [
      'BOARD_UPDATED',
      { fields: ['description'], title: 'Roadmap' },
      'updated the board description',
    ],
    [
      'BOARD_UPDATED',
      { fields: ['title', 'description'], title: 'Both' },
      'renamed the board to "Both"',
    ],
    ['BOARD_UPDATED', {}, 'updated the board'],
    ['BOARD_CREATED', { title: 'Roadmap' }, 'created board "Roadmap"'],
    ['BOARD_CREATED', { boardTitle: 'Legacy' }, 'created board "Legacy"'],
    ['COLUMN_CREATED', { boardTitle: 'Old board' }, 'created board "Old board"'],
    ['COLUMN_CREATED', { title: 'Doing' }, 'created column "Doing"'],
    ['TASK_MOVED', { taskTitle: 'T', fromColumn: 'A', toColumn: 'B' }, 'moved "T" from A to B'],
  ])('%s %j renders "%s"', async (action, metadata, text) => {
    await renderFeedWith(makeLog(action, metadata));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
