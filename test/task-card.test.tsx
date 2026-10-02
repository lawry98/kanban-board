import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';

vi.mock('@/contexts/board-context', () => ({ useBoardContext: () => ({ canEdit: false }) }));

import { TaskCard } from '@/components/board/task-card';
import type { TaskWithAssignee } from '@/types';

import { TIME_ZONES, pinTimeZone } from './time-zone';

const USER_ID = '44444444-4444-4444-8444-444444444444';

/** As Prisma returns it: the due date is UTC midnight of the picked day. */
const TASK: TaskWithAssignee = {
  id: '11111111-1111-4111-8111-111111111111',
  columnId: '22222222-2222-4222-8222-222222222222',
  boardId: '33333333-3333-4333-8333-333333333333',
  title: 'Write launch post',
  description: null,
  position: 1000,
  priority: 'NONE',
  labels: [],
  dueDate: new Date('2026-10-02T00:00:00.000Z'),
  assigneeId: null,
  createdBy: USER_ID,
  createdAt: new Date('2026-09-01T15:00:00.000Z'),
  updatedAt: new Date('2026-09-01T15:00:00.000Z'),
  assignee: null,
  creator: { id: USER_ID, fullName: 'Ada Lovelace', avatarUrl: null },
};

function card(task: TaskWithAssignee = TASK) {
  return (
    <DragDropContext onDragEnd={() => {}}>
      <Droppable droppableId="column">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            <TaskCard task={task} index={0} onClick={() => {}} />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

/** `month` is 1-based; the instant is built in the pinned local time zone. */
function setLocalNow(month: number, day: number, hours: number, minutes = 0, seconds = 0) {
  vi.setSystemTime(new Date(2026, month - 1, day, hours, minutes, seconds));
}

describe.each(TIME_ZONES)('TaskCard due date in %s', (timeZone) => {
  pinTimeZone(timeZone);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the day that was picked', () => {
    setLocalNow(10, 1, 21);
    render(card());
    expect(screen.getByText('Oct 2')).toBeInTheDocument();
  });

  it('is not overdue on the evening before, or at the very end of, its due day', () => {
    setLocalNow(10, 1, 21);
    const { unmount } = render(card());
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    unmount();

    setLocalNow(10, 2, 23, 59);
    render(card());
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it('is overdue from the first minute of the next local day', () => {
    setLocalNow(10, 3, 0, 1);
    render(card());
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('turns overdue at local midnight while the board stays open', () => {
    setLocalNow(10, 2, 23, 59, 30);
    render(card());
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('re-checks the day when a sleeping tab becomes visible again', () => {
    setLocalNow(10, 2, 18);
    render(card());
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();

    // Laptop slept through midnight: the clock moved on but no timer got to fire.
    setLocalNow(10, 3, 8);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("never claims overdue in server HTML, which cannot know the viewer's day", () => {
    setLocalNow(10, 9, 12);
    const html = renderToString(card());
    expect(html).toContain('Oct 2');
    expect(html).not.toMatch(/overdue/i);
  });
});
