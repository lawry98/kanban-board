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

/** How the account was created. `fromInvite` is a boolean, never the path itself. */
export type SignedUpProperties = {
  method: 'password' | 'github';
  fromInvite: boolean;
};

/**
 * Not duplication of the `invitations` table, though it looks like it. An
 * invitation row is `ON DELETE Cascade` from its board, so deleting a board erases
 * every link ever created on it — while these events survive by design. That makes
 * this the only durable record of link creation for a churned board, and it is why
 * `funnel.sql` sources the instrumented-era link count from here rather than from
 * `invitations`: both sides of the accept rate then survive board deletion and the
 * ratio compares like with like.
 *
 * This is the same reasoning that EXCLUDES `board_created`/`task_created` from the
 * taxonomy — those are derivable from rows that survive, these are not.
 */
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

/**
 * Derived from the union above, not hand-duplicated, so this list can never drift
 * from the `name` literals it names — the same drift this file exists to prevent.
 */
export type AnalyticsEventName = AnalyticsEventInput['name'];

/**
 * The ONLY property keys that may ever be persisted, per event type. `trackEvent`
 * picks against this at write time.
 *
 * The closed union above already makes a stray key a compile error — but only for
 * an object *literal*. A widened variable (`const p: SignedUpProperties & { email: string }`)
 * is structurally assignable and would smuggle the extra key straight through to
 * the JSONB column. This list is the runtime backstop, so an email, a raw invite
 * token, or a title cannot reach the events table even if the type system is
 * subverted or someone later builds a payload dynamically.
 *
 * `satisfies` gives compile-time exhaustiveness: add an event to the union without
 * adding its keys here and the build fails.
 */
export const EVENT_PROPERTY_KEYS = {
  signed_up: ['method', 'fromInvite'],
  invite_link_created: ['role', 'invitationId'],
  invite_link_opened: ['invitationId', 'linkState', 'viewerState'],
  invite_accepted: ['invitationId', 'role', 'secondsSinceLinkCreated'],
  daily_active: [],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;

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
