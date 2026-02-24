'use client';

import { createContext, useContext, useReducer, type Dispatch } from 'react';

import type { BoardState, BoardAction, BoardWithDetails } from '@/types';

interface BoardContextValue {
  state: BoardState;
  dispatch: Dispatch<BoardAction>;
  board: BoardWithDetails;
  currentUserId: string;
  canEdit: boolean;
  isOwner: boolean;
}

const BoardContext = createContext<BoardContextValue | null>(null);

function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'SYNC_STATE':
      return action.payload;

    case 'ADD_TASK': {
      const task = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) =>
          col.id === task.columnId ? { ...col, tasks: [...col.tasks, task] } : col,
        ),
      };
    }

    case 'UPDATE_TASK': {
      const updated = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) => ({
          ...col,
          tasks: col.tasks.map((task) =>
            task.id === updated.id ? { ...task, ...updated } : task,
          ),
        })),
      };
    }

    case 'DELETE_TASK': {
      const { taskId, columnId } = action.payload;
      return {
        ...state,
        columns: state.columns.map((col) =>
          col.id === columnId
            ? { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) }
            : col,
        ),
      };
    }

    case 'MOVE_TASK': {
      const { taskId, fromColumnId, toColumnId, fromIndex, toIndex } = action.payload;

      if (fromColumnId === toColumnId) {
        // Same column reorder
        return {
          ...state,
          columns: state.columns.map((col) => {
            if (col.id !== fromColumnId) return col;
            const tasks = [...col.tasks];
            const [moved] = tasks.splice(fromIndex, 1);
            tasks.splice(toIndex, 0, moved);
            return { ...col, tasks: tasks.map((t, i) => ({ ...t, position: i })) };
          }),
        };
      }

      // Cross-column move
      const taskToMove = state.columns
        .find((c) => c.id === fromColumnId)
        ?.tasks.find((t) => t.id === taskId);

      if (!taskToMove) return state;

      return {
        ...state,
        columns: state.columns.map((col) => {
          if (col.id === fromColumnId) {
            return {
              ...col,
              tasks: col.tasks
                .filter((t) => t.id !== taskId)
                .map((t, i) => ({ ...t, position: i })),
            };
          }
          if (col.id === toColumnId) {
            const tasks = [...col.tasks];
            tasks.splice(toIndex, 0, { ...taskToMove, columnId: toColumnId });
            return { ...col, tasks: tasks.map((t, i) => ({ ...t, position: i })) };
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
        columns: state.columns.map((col) =>
          col.id === updated.id ? { ...col, ...updated } : col,
        ),
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
      columns.splice(toIndex, 0, moved);
      return { ...state, columns: columns.map((c, i) => ({ ...c, position: i })) };
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

  return (
    <BoardContext.Provider value={{ state, dispatch, board, currentUserId, canEdit, isOwner }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoardContext(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoardContext must be used within a BoardProvider');
  return context;
}
