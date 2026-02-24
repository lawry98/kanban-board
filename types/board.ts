import type { Board, BoardMember, Column, Task, Profile, Role } from '@prisma/client';

export type TaskWithAssignee = Task & {
  assignee: Profile | null;
  creator: Profile;
};

export type ColumnWithTasks = Column & {
  tasks: TaskWithAssignee[];
};

export type BoardMemberWithProfile = BoardMember & {
  profile: Profile;
};

export type BoardWithMembers = Board & {
  members: BoardMemberWithProfile[];
  _count: {
    columns: number;
    tasks: number;
  };
};

export type BoardWithDetails = Board & {
  columns: ColumnWithTasks[];
  members: BoardMemberWithProfile[];
  creator: Profile;
};

export type { Role };
