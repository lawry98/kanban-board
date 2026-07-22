import type { Board, BoardMember, Column, Task, Profile, Role } from '@prisma/client';

/**
 * The only profile fields that are safe to ship to the browser for people the viewer
 * has not explicitly been given contact details for. Email is intentionally absent:
 * task relations are re-fetched on every realtime resync, so `include: { creator: true }`
 * broadcast every member's email address continuously.
 */
export const PUBLIC_PROFILE_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
} as const;

export type PublicProfile = Pick<Profile, 'id' | 'fullName' | 'avatarUrl'>;

export type TaskWithAssignee = Task & {
  assignee: PublicProfile | null;
  creator: PublicProfile | null;
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
  creator: PublicProfile;
};

export type { Role };
