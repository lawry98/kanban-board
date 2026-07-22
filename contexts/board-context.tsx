'use client';

import { createContext, useContext, useMemo, useReducer, type Dispatch } from 'react';

import type {
  BoardState,
  BoardAction,
  BoardWithDetails,
  BoardMemberWithProfile,
  ColumnWithTasks,
  TaskWithAssignee,
} from '@/types';

interface BoardContextValue {
  state: BoardState;
  dispatch: Dispatch<BoardAction>;
  board: BoardWithDetails;
  currentUserId: string;
  canEdit: boolean;
  isOwner: boolean;
}

const BoardContext = createContext<BoardContextValue | null>(null);

/**
 * Positions are fractional (`Float`): a move is a midpoint between its new
 * neighbours, so only the moved row changes. Renumbering the whole list would
 * clone every task object and defeat `React.memo` on the cards.
 */
function positionBetween(prev?: { position: number }, next?: { position: number }): number {
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + 1;
  if (next) return next.position - 1;
  return 0;
}

function positionAfterLast(tasks: readonly { position: number }[]): number {
  return tasks.length === 0 ? 0 : tasks[tasks.length - 1].position + 1;
}

function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position;
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Identity reconciliation for `SYNC_STATE`. A realtime refetch deserializes a
 * brand-new object tree, so a naive replace would break every memoized card.
 * We keep the previous object reference whenever the row is materially
 * unchanged, which lets `React.memo` bail out of the vast majority of cards.
 */
function isSameTask(prev: TaskWithAssignee, next: TaskWithAssignee): boolean {
  return (
    prev.id === next.id &&
    prev.columnId === next.columnId &&
    prev.position === next.position &&
    timestamp(prev.updatedAt) === timestamp(next.updatedAt) &&
    // `updatedAt` alone is not enough: an optimistic edit mutates fields without
    // bumping it, and a rollback `SYNC_STATE` must not preserve that object.
    prev.title === next.title &&
    prev.description === next.description &&
    prev.priority === next.priority &&
    prev.assigneeId === next.assigneeId &&
    prev.assignee?.id === next.assignee?.id &&
    (prev.dueDate === next.dueDate ||
      (prev.dueDate != null &&
        next.dueDate != null &&
        timestamp(prev.dueDate) === timestamp(next.dueDate))) &&
    prev.labels.length === next.labels.length &&
    prev.labels.every((label, i) => label === next.labels[i])
  );
}

function isSameColumnMeta(prev: ColumnWithTasks, next: ColumnWithTasks): boolean {
  return (
    prev.id === next.id &&
    prev.title === next.title &&
    prev.color === next.color &&
    prev.position === next.position &&
    timestamp(prev.updatedAt) === timestamp(next.updatedAt)
  );
}

function isSameMember(prev: BoardMemberWithProfile, next: BoardMemberWithProfile): boolean {
  return (
    prev.id === next.id &&
    prev.role === next.role &&
    prev.userId === next.userId &&
    timestamp(prev.profile.updatedAt) === timestamp(next.profile.updatedAt)
  );
}

function reconcileColumns(
  prevColumns: ColumnWithTasks[],
  nextColumns: ColumnWithTasks[],
): ColumnWithTasks[] {
  const prevByColumnId = new Map(prevColumns.map((col) => [col.id, col]));
  const prevTasksById = new Map<string, TaskWithAssignee>();
  for (const col of prevColumns) {
    for (const task of col.tasks) prevTasksById.set(task.id, task);
  }

  let columnsChanged = prevColumns.length !== nextColumns.length;

  const columns = nextColumns.map((nextCol, columnIndex) => {
    const prevCol = prevByColumnId.get(nextCol.id);

    let tasksChanged = prevCol === undefined || prevCol.tasks.length !== nextCol.tasks.length;
    const tasks = nextCol.tasks.map((nextTask, taskIndex) => {
      const prevTask = prevTasksById.get(nextTask.id);
      if (prevTask && isSameTask(prevTask, nextTask)) {
        // Same row, but it may have shifted index or column.
        if (!prevCol || prevCol.tasks[taskIndex] !== prevTask) tasksChanged = true;
        return prevTask;
      }
      tasksChanged = true;
      return nextTask;
    });

    if (prevCol && !tasksChanged && isSameColumnMeta(prevCol, nextCol)) {
      if (prevColumns[columnIndex] !== prevCol) columnsChanged = true;
      return prevCol;
    }

    columnsChanged = true;
    return { ...nextCol, tasks };
  });

  return columnsChanged ? columns : prevColumns;
}

function reconcileMembers(
  prevMembers: BoardMemberWithProfile[],
  nextMembers: BoardMemberWithProfile[],
): BoardMemberWithProfile[] {
  if (prevMembers.length !== nextMembers.length) return nextMembers;
  const prevById = new Map(prevMembers.map((member) => [member.id, member]));
  let changed = false;
  const members = nextMembers.map((nextMember, index) => {
    const prevMember = prevById.get(nextMember.id);
    if (prevMember && isSameMember(prevMember, nextMember)) {
      if (prevMembers[index] !== prevMember) changed = true;
      return prevMember;
    }
    changed = true;
    return nextMember;
  });
  return changed ? members : prevMembers;
}

function reconcileState(prev: BoardState, next: BoardState): BoardState {
  const columns = reconcileColumns(prev.columns, next.columns);
  const members = reconcileMembers(prev.members, next.members);
  if (columns === prev.columns && members === prev.members) return prev;
  return { columns, members };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'SYNC_STATE':
      return reconcileState(state, action.payload);

    case 'ADD_TASK': {
      const task = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) =>
          col.id === task.columnId ? { ...col, tasks: [...col.tasks, task].sort(byPosition) } : col,
        ),
      };
    }

    case 'UPDATE_TASK': {
      const updated = action.payload;
      const sourceColumn = state.columns.find((col) =>
        col.tasks.some((task) => task.id === updated.id),
      );
      if (!sourceColumn) return state;

      const existing = sourceColumn.tasks.find((task) => task.id === updated.id);
      if (!existing) return state;

      const merged: TaskWithAssignee = { ...existing, ...updated };
      const targetColumnId = updated.columnId ?? sourceColumn.id;

      // In-place edit: only the task object changes identity.
      if (targetColumnId === sourceColumn.id) {
        return {
          ...state,
          columns: state.columns.map((col) =>
            col.id !== sourceColumn.id
              ? col
              : {
                  ...col,
                  tasks: col.tasks.map((task) => (task.id === updated.id ? merged : task)),
                },
          ),
        };
      }

      const targetColumn = state.columns.find((col) => col.id === targetColumnId);
      // Unknown target column (e.g. not yet synced): leave the card where it is
      // rather than dropping it out of the board entirely.
      if (!targetColumn) return state;

      // A column change must physically relocate the card, otherwise its
      // `columnId` contradicts the container it renders in.
      const relocated: TaskWithAssignee =
        updated.position === undefined
          ? { ...merged, position: positionAfterLast(targetColumn.tasks) }
          : merged;

      return {
        ...state,
        columns: state.columns.map((col) => {
          if (col.id === sourceColumn.id) {
            return { ...col, tasks: col.tasks.filter((task) => task.id !== updated.id) };
          }
          if (col.id === targetColumn.id) {
            return { ...col, tasks: [...col.tasks, relocated].sort(byPosition) };
          }
          return col;
        }),
      };
    }

    case 'DELETE_TASK': {
      const { taskId, columnId } = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) =>
          col.id === columnId ? { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) } : col,
        ),
      };
    }

    case 'MOVE_TASK': {
      const { taskId, fromColumnId, toColumnId, fromIndex, toIndex } = action.payload;

      if (fromColumnId === toColumnId) {
        // Same-column reorder: splice, then give the moved task a position
        // between its new neighbours. Every other task keeps its identity.
        return {
          ...state,
          columns: state.columns.map((col) => {
            if (col.id !== fromColumnId) return col;
            const tasks = [...col.tasks];
            const [moved] = tasks.splice(fromIndex, 1);
            if (!moved) return col;
            const position = positionBetween(tasks[toIndex - 1], tasks[toIndex]);
            tasks.splice(toIndex, 0, moved.position === position ? moved : { ...moved, position });
            return { ...col, tasks };
          }),
        };
      }

      const taskToMove = state.columns
        .find((c) => c.id === fromColumnId)
        ?.tasks.find((t) => t.id === taskId);

      if (!taskToMove) return state;

      return {
        ...state,
        columns: state.columns.map((col) => {
          if (col.id === fromColumnId) {
            return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
          }
          if (col.id === toColumnId) {
            const tasks = [...col.tasks];
            tasks.splice(toIndex, 0, {
              ...taskToMove,
              columnId: toColumnId,
              position: positionBetween(tasks[toIndex - 1], tasks[toIndex]),
            });
            return { ...col, tasks };
          }
          return col;
        }),
      };
    }

    case 'ADD_COLUMN': {
      return { ...state, columns: [...state.columns, action.payload] };
    }

    case 'UPDATE_COLUMN': {
      const updated = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) => (col.id === updated.id ? { ...col, ...updated } : col)),
      };
    }

    case 'DELETE_COLUMN': {
      return {
        ...state,
        columns: state.columns.filter((col) => col.id !== action.payload.columnId),
      };
    }

    case 'REORDER_COLUMN': {
      const { fromIndex, toIndex } = action.payload;
      const columns = [...state.columns];
      const [moved] = columns.splice(fromIndex, 1);
      if (!moved) return state;
      const position = positionBetween(columns[toIndex - 1], columns[toIndex]);
      columns.splice(toIndex, 0, moved.position === position ? moved : { ...moved, position });
      return { ...state, columns };
    }

    case 'UPDATE_BOARD':
      return state; // Board metadata lives in the parent board prop

    default:
      return state;
  }
}

interface BoardProviderProps {
  children: React.ReactNode;
  board: BoardWithDetails;
  currentUserId: string;
  userRole: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export function BoardProvider({ children, board, currentUserId, userRole }: BoardProviderProps) {
  const [state, dispatch] = useReducer(boardReducer, {
    columns: board.columns,
    members: board.members,
  });

  const canEdit = userRole === 'OWNER' || userRole === 'EDITOR';
  const isOwner = userRole === 'OWNER';

  // An inline object literal here would be a new value on every render, so
  // every column and every card would re-render on every dispatch regardless
  // of `React.memo`.
  const value = useMemo<BoardContextValue>(
    () => ({ state, dispatch, board, currentUserId, canEdit, isOwner }),
    [state, board, currentUserId, canEdit, isOwner],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoardContext(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoardContext must be used within a BoardProvider');
  return context;
}
