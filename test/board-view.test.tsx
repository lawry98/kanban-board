import type { ComponentProps } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type * as Dnd from '@hello-pangea/dnd';

type DndProps = ComponentProps<typeof Dnd.DragDropContext>;

// Real dnd throughout; this wrapper only records the props BoardView hands the context,
// because jsdom can't run a drag to fire the responders.
const dnd = vi.hoisted(() => ({ props: null as DndProps | null }));
vi.mock('@hello-pangea/dnd', async (importOriginal) => {
  const actual = await importOriginal<typeof Dnd>();
  return {
    ...actual,
    DragDropContext: (props: DndProps) => {
      dnd.props = props;
      return <actual.DragDropContext {...props} />;
    },
  };
});

// BoardView pulls in the realtime hook (Supabase), the header (another session's
// component, which reaches server actions) and the server actions themselves.
vi.mock('@/hooks/use-realtime', () => ({ useRealtime: vi.fn() }));
vi.mock('@/components/board/board-header', () => ({ BoardHeader: () => null }));
vi.mock('@/components/board/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/app/actions/task-actions', () => ({
  moveTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock('@/app/actions/column-actions', () => ({
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { BoardView } from '@/app/(dashboard)/board/[boardId]/board-view';
import { moveTask } from '@/app/actions/task-actions';
import { DRAG_HANDLE_INSTRUCTIONS } from '@/lib/drag-announcements';
import type { BoardWithDetails, ColumnWithTasks, TaskWithAssignee } from '@/types';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = '44444444-4444-4444-8444-444444444444';

function makeTask(id: string, columnId: string, title: string): TaskWithAssignee {
  return {
    id,
    columnId,
    boardId: 'board-1',
    title,
    description: null,
    position: 1000,
    priority: 'NONE',
    labels: [],
    dueDate: null,
    assigneeId: null,
    createdBy: USER_ID,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    assignee: null,
    creator: null,
  };
}

function makeColumn(id: string, title: string, tasks: TaskWithAssignee[] = []): ColumnWithTasks {
  return {
    id,
    boardId: 'board-1',
    title,
    color: null,
    position: 1000,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    tasks,
  };
}

const COLUMNS = [
  makeColumn('todo', 'To do', [makeTask('t1', 'todo', 'Write launch post')]),
  makeColumn('doing', 'Doing'),
];

function renderBoard(
  columns: ColumnWithTasks[] = COLUMNS,
  userRole: 'OWNER' | 'EDITOR' | 'VIEWER' = 'OWNER',
) {
  // Only the fields BoardProvider/BoardContent read; the rest is cast.
  const board = {
    id: 'board-1',
    title: 'QA board',
    columns,
    members: [],
  } as unknown as BoardWithDetails;
  return render(<BoardView board={board} currentUserId={USER_ID} userRole={userRole} />);
}

// What dnd treats as a scroll parent. `overflow-hidden` is deliberately absent: dnd ignores it.
const SCROLLS = /\boverflow-(auto|scroll|x-auto|y-auto|x-scroll|y-scroll)\b/;

// Radix ScrollArea sets overflow inline rather than by class, so check both.
function scrolls(el: HTMLElement): boolean {
  return SCROLLS.test(el.className) || /auto|scroll/.test(el.style.overflowX + el.style.overflowY);
}

beforeAll(() => {
  // Radix (dialog, select) calls these; jsdom implements none of them.
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
  dnd.props = null;
});

describe('BoardView scroll structure', () => {
  it('gives every column list exactly one scroll parent: the board', () => {
    const { container } = renderBoard();
    const lists = container.querySelectorAll('[data-rfd-droppable-id]');
    expect(lists).toHaveLength(2);
    for (const list of lists) {
      const scrollers: HTMLElement[] = [];
      for (let el: HTMLElement | null = list as HTMLElement; el; el = el.parentElement) {
        if (scrolls(el)) scrollers.push(el);
      }
      expect(scrollers).toHaveLength(1);
      expect(scrollers[0]).toHaveAttribute('data-board-scroll-container');
    }
  });
});

describe('BoardView drag instructions', () => {
  it('tells an editor on a card that Enter opens it', () => {
    renderBoard();
    expect(screen.getByRole('button', { name: 'Write launch post' })).toHaveAccessibleDescription(
      /Press Enter to open the task/,
    );
  });
});

describe('BoardView drag announcements', () => {
  // UUID-shaped ids, as in the real app: a leak of any of them is unmistakable.
  const TODO = '11111111-1111-4111-8111-111111111111';
  const DOING = '22222222-2222-4222-8222-222222222222';
  const TASK = '33333333-3333-4333-8333-333333333333';
  const IDS = [TODO, DOING, TASK];

  const columns = [
    makeColumn(TODO, 'To do', [makeTask(TASK, TODO, 'Write launch post')]),
    makeColumn(DOING, 'Doing'),
  ];
  const source = { droppableId: TODO, index: 0 };

  function props(): DndProps {
    if (!dnd.props) throw new Error('DragDropContext did not render');
    return dnd.props;
  }

  // The context's responders receive dnd's `provided`; this stands in for it.
  function announcer() {
    return { announce: vi.fn() };
  }

  function drop(overrides: Partial<Dnd.DropResult>): Dnd.DropResult {
    return {
      draggableId: TASK,
      type: 'DEFAULT',
      mode: 'SNAP',
      source,
      destination: null,
      combine: null,
      reason: 'DROP',
      ...overrides,
    };
  }

  function said(provided: ReturnType<typeof announcer>): string {
    expect(provided.announce).toHaveBeenCalledTimes(1);
    const [message] = provided.announce.mock.calls[0] as [string];
    for (const id of IDS) expect(message).not.toContain(id);
    return message;
  }

  it('hands dnd the keyboard usage instructions', () => {
    renderBoard(columns);
    expect(props().dragHandleUsageInstructions).toBe(DRAG_HANDLE_INSTRUCTIONS);
  });

  it('announces the pick-up with names', () => {
    renderBoard(columns);
    const provided = announcer();
    props().onDragStart?.({ draggableId: TASK, type: 'DEFAULT', mode: 'SNAP', source }, provided);
    expect(said(provided)).toBe(
      'Picked up Write launch post. It is at position 1 of 1 in the To do column.',
    );
  });

  it('announces each move with names', () => {
    renderBoard(columns);
    const provided = announcer();
    props().onDragUpdate?.(
      {
        draggableId: TASK,
        type: 'DEFAULT',
        mode: 'SNAP',
        source,
        destination: { droppableId: DOING, index: 0 },
        combine: null,
      },
      provided,
    );
    expect(said(provided)).toBe('Moved to position 1 of 1 in the Doing column.');
  });

  it('announces a completed drop, then syncs it', async () => {
    vi.mocked(moveTask).mockResolvedValue({ data: true });
    renderBoard(columns);
    const provided = announcer();
    await act(() =>
      props().onDragEnd(drop({ destination: { droppableId: DOING, index: 0 } }), provided),
    );
    expect(said(provided)).toBe(
      'Dropped Write launch post at position 1 of 1 in the Doing column.',
    );
    expect(moveTask).toHaveBeenCalledTimes(1);
  });

  it('still announces a drop back into the same slot', async () => {
    renderBoard(columns);
    const provided = announcer();
    await act(() => props().onDragEnd(drop({ destination: source }), provided));
    expect(said(provided)).toBe(
      'Dropped Write launch post at position 1 of 1 in the To do column.',
    );
    expect(moveTask).not.toHaveBeenCalled();
  });

  it('still announces a cancelled drag and a drop outside every column', async () => {
    renderBoard(columns);
    const cancelled = announcer();
    await act(() => props().onDragEnd(drop({ reason: 'CANCEL' }), cancelled));
    expect(said(cancelled)).toBe(
      'Movement cancelled. Write launch post is back at position 1 of 1 in the To do column.',
    );

    const outside = announcer();
    await act(() => props().onDragEnd(drop({}), outside));
    expect(said(outside)).toMatch(/was dropped outside a column/);
    expect(moveTask).not.toHaveBeenCalled();
  });

  it('announces even where the viewer guard stops the move', async () => {
    renderBoard(columns, 'VIEWER');
    const provided = announcer();
    await act(() =>
      props().onDragEnd(drop({ destination: { droppableId: DOING, index: 0 } }), provided),
    );
    expect(said(provided)).toMatch(/^Dropped Write launch post/);
    expect(moveTask).not.toHaveBeenCalled();
  });
});
