/**
 * The analytics event contract — types and key formats only, no I/O.
 *
 * The union below is closed on purpose: a malformed payload is a compile error,
 * not a silently rotten JSON column. This is the direct answer to the drift that
 * already happened in `activity_logs`, where `createBoard` writes
 * `metadata.boardTitle` while `activity-feed.tsx` reads `meta.title`.
 *
 * PRIVACY: property values are ids and enum members only. Never add an email, a
 * raw invite token, a board or task title, a pathname, an IP, or a user agent.
 */

export type AnalyticsEventName =
  | 'signed_up'
  | 'invite_link_created'
  | 'invite_link_opened'
  | 'invite_accepted'
  | 'daily_active';

/** How the account was created. `fromInvite` is a boolean, never the path itself. */
export type SignedUpProperties = {
  method: 'password' | 'github';
  fromInvite: boolean;
};

export type InviteLinkCreatedProperties = {
  role: 'EDITOR' | 'VIEWER';
  invitationId: string;
};

/**
 * `linkState: 'invalid'` covers an unknown, revoked, or expired token — a dead-link
 * click is itself a funnel signal. Ids are null only when the token matches nothing.
 */
export type InviteLinkOpenedProperties = {
  invitationId: string | null;
  linkState: 'active' | 'invalid';
  viewerState: 'anonymous' | 'authenticated';
};

export type InviteAcceptedProperties = {
  invitationId: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  secondsSinceLinkCreated: number;
};

/**
 * Property bags are `type` aliases rather than `interface`s on purpose: only a type
 * alias gets TypeScript's implicit index signature, which is what makes them
 * assignable to Prisma's `InputJsonObject` without a cast.
 */
export type AnalyticsEventInput =
  | {
      name: 'signed_up';
      userId: string;
      boardId: null;
      dedupeKey: string;
      properties: SignedUpProperties;
    }
  | {
      name: 'invite_link_created';
      userId: string;
      boardId: string;
      dedupeKey?: undefined;
      properties: InviteLinkCreatedProperties;
    }
  | {
      name: 'invite_link_opened';
      userId: string | null;
      boardId: string | null;
      dedupeKey?: undefined;
      properties: InviteLinkOpenedProperties;
    }
  | {
      name: 'invite_accepted';
      userId: string;
      boardId: string;
      dedupeKey?: undefined;
      properties: InviteAcceptedProperties;
    }
  | {
      name: 'daily_active';
      userId: string;
      boardId: null;
      dedupeKey: string;
      properties?: undefined;
    };

/** Exactly one row per user, whichever emission path (register or OAuth callback) fires first. */
export function signedUpKey(userId: string): string {
  return `signed_up:${userId}`;
}

/**
 * At most one row per user per UTC day. `toISOString()` is always UTC, so the key
 * is deterministic regardless of the server region the function happens to run in.
 */
export function dailyActiveKey(userId: string, at: Date): string {
  return `daily_active:${userId}:${at.toISOString().slice(0, 10)}`;
}
