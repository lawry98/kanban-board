import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

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

function renderBoard(columns: ColumnWithTasks[] = COLUMNS) {
  // Only the fields BoardProvider/BoardContent read; the rest is cast.
  const board = {
    id: 'board-1',
    title: 'QA board',
    columns,
    members: [],
  } as unknown as BoardWithDetails;
  return render(<BoardView board={board} currentUserId={USER_ID} userRole="OWNER" />);
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
