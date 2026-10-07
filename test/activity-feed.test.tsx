import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

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
  // The load resolves in a microtask right after mount; act flushes it so the resulting
  // state update isn't reported as un-wrapped.
  await act(async () => {
    render(<ActivityFeed boardId="board-1" open onOpenChange={vi.fn()} />);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ActivityFeed layout', () => {
  it('draws avatar initials in the foreground colour', async () => {
    await renderFeedWith(makeLog('TASK_UPDATED', {}));

    // muted-foreground on the fallback's muted background is 4.35:1, under AA's 4.5:1.
    expect(await screen.findByText('AD')).toHaveClass('text-foreground');
  });

  it('sizes the list to the dynamic viewport', async () => {
    await renderFeedWith(makeLog('TASK_UPDATED', {}));

    // `vh` is the largest viewport on mobile, so the list's end hid behind the browser's bars.
    const list = (await screen.findByText('AD')).closest('[data-slot="scroll-area"]');
    expect(list).toHaveClass('h-[calc(100dvh-120px)]');
  });
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
