export type {
  BoardWithMembers,
  BoardWithDetails,
  ColumnWithTasks,
  TaskWithAssignee,
  BoardMemberWithProfile,
} from './board';

import type { ColumnWithTasks, BoardMemberWithProfile, TaskWithAssignee } from './board';
import type { Board, Column } from '@prisma/client';

export interface BoardState {
  columns: ColumnWithTasks[];
  members: BoardMemberWithProfile[];
}

export type BoardAction =
  | {
      type: 'MOVE_TASK';
      payload: {
        taskId: string;
        fromColumnId: string;
        toColumnId: string;
        fromIndex: number;
        toIndex: number;
      };
    }
  | { type: 'ADD_TASK'; payload: TaskWithAssignee }
  | { type: 'UPDATE_TASK'; payload: Partial<TaskWithAssignee> & { id: string } }
  | { type: 'DELETE_TASK'; payload: { taskId: string; columnId: string } }
  | {
      type: 'REORDER_COLUMN';
      payload: { columnId: string; fromIndex: number; toIndex: number };
    }
  | { type: 'ADD_COLUMN'; payload: ColumnWithTasks }
  | { type: 'UPDATE_COLUMN'; payload: Partial<Column> & { id: string } }
  | { type: 'DELETE_COLUMN'; payload: { columnId: string } }
  | { type: 'SYNC_STATE'; payload: BoardState }
  | { type: 'UPDATE_BOARD'; payload: Partial<Board> & { id: string } };
