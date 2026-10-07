export type {
  BoardWithMembers,
  BoardWithDetails,
  ColumnWithTasks,
  TaskWithAssignee,
  BoardMemberWithProfile,
} from './board';

import type { ColumnWithTasks, BoardMemberWithProfile, TaskWithAssignee } from './board';
import type { Board, Column } from '@prisma/client';

/** Board-level fields the header renders; kept in reducer state so a realtime resync reaches them. */
export type BoardMeta = Pick<Board, 'title' | 'description'>;

export interface BoardState {
  meta: BoardMeta;
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
  | { type: 'ADD_MEMBER'; payload: BoardMemberWithProfile }
  | { type: 'UPDATE_MEMBER'; payload: BoardMemberWithProfile }
  | { type: 'REMOVE_MEMBER'; payload: { memberId: string } }
  | { type: 'SYNC_STATE'; payload: BoardState }
  | { type: 'UPDATE_BOARD'; payload: Partial<BoardMeta> };
