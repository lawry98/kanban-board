import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtime } from '@/hooks/use-realtime';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

type Status = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

/**
 * A fake of the slice of supabase-js the hook touches, reproducing the
 * realtime-js and auth-js behaviours the hook has to work around:
 *
 * - `subscribe()` copies the socket's *current* access token into the join
 *   payload synchronously. A channel joined before the token is set joins with
 *   none, which Realtime treats as the anon key, and RLS then silently drops
 *   every postgres_changes event. (`setAuth()` is async, and the fake sets the
 *   token only after an await, so the tests pin the documented contract,
 *   "await setAuth before subscribing", not the explicit-token path's
 *   synchronous assignment.)
 * - `removeChannel()` reports CLOSED to the channel's own callback, then
 *   disconnects the socket once its last channel is gone. For up to 100ms after,
 *   the client is "disconnecting" and `connect()` is a no-op, so a join sent in
 *   that window is never delivered.
 * - auth-js notifies listeners while holding the lock `getSession()` queues on,
 *   and awaits each listener, so awaiting getSession() inside one deadlocks.
 */
interface FakeChannel {
  topic: string;
  bindings: { table: string; filter: string; callback: () => void }[];
  /** The token the join carried (null = anonymous); undefined until subscribe(). */
  joinedWithToken: string | null | undefined;
  /** subscribe() ran while the socket was disconnecting, so the join was never sent. */
  joinDropped: boolean;
  removed: boolean;
  emitStatus: (status: Status) => void;
}

const fake = vi.hoisted(() => {
  type AuthListener = (event: AuthChangeEvent, session: Session | null) => unknown;
  const state = {
    session: null as Session | null,
    /** realtime-js `socket.accessTokenValue`: what the next join carries. */
    accessTokenValue: null as string | null,
    /** Every channel ever created, in order. */
    channels: [] as FakeChannel[],
    /** realtime-js `socket.channels`: created and not yet removed. */
    socketChannels: new Set<FakeChannel>(),
    socket: 'disconnected' as 'disconnected' | 'connected' | 'disconnecting',
    authListeners: new Set<AuthListener>(),
    authLock: Promise.resolve() as Promise<unknown>,
  };

  function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = state.authLock.then(fn);
    state.authLock = run.catch(() => undefined);
    return run;
  }

  const client = {
    auth: {
      getSession: vi.fn(() =>
        withAuthLock(async () => ({ data: { session: state.session }, error: null })),
      ),
      onAuthStateChange: vi.fn((callback: AuthListener) => {
        state.authListeners.add(callback);
        // auth-js reports the stored session to every new listener, asynchronously.
        void Promise.resolve().then(() => {
          if (state.authListeners.has(callback)) callback('INITIAL_SESSION', state.session);
        });
        return {
          data: { subscription: { unsubscribe: () => state.authListeners.delete(callback) } },
        };
      }),
    },
    realtime: {
      setAuth: vi.fn(async (token?: string | null) => {
        await Promise.resolve();
        state.accessTokenValue = token ?? null;
      }),
    },
    channel: vi.fn((topic: string) => {
      let statusCallback: ((status: Status) => void) | undefined;
      const channel = {
        topic,
        bindings: [] as FakeChannel['bindings'],
        joinedWithToken: undefined as string | null | undefined,
        joinDropped: false,
        removed: false,
        on(_type: string, filter: { table: string; filter: string }, callback: () => void) {
          channel.bindings.push({ table: filter.table, filter: filter.filter, callback });
          return channel;
        },
        subscribe(callback?: (status: Status) => void) {
          channel.joinedWithToken = state.accessTokenValue;
          statusCallback = callback;
          if (state.socket === 'disconnecting') channel.joinDropped = true;
          else state.socket = 'connected';
          return channel;
        },
        emitStatus(status: Status) {
          statusCallback?.(status);
        },
      };
      state.channels.push(channel);
      state.socketChannels.add(channel);
      return channel;
    }),
    removeChannel: vi.fn(async (channel: FakeChannel) => {
      channel.removed = true;
      state.socketChannels.delete(channel);
      channel.emitStatus('CLOSED');
      await Promise.resolve();
      if (state.socketChannels.size === 0 && state.socket === 'connected') {
        state.socket = 'disconnecting';
        setTimeout(() => {
          state.socket = 'disconnected';
        }, 100);
      }
      return 'ok' as const;
    }),
  };

  /** Change the stored session, then notify listeners under the lock, as auth-js does. */
  function emitAuth(event: AuthChangeEvent, session: Session | null) {
    state.session = session;
    void withAuthLock(async () => {
      await Promise.all([...state.authListeners].map((listener) => listener(event, session)));
    });
  }

  return { state, client, emitAuth };
});

const { push, toastError, getBoardData } = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
  getBoardData: vi.fn(),
}));

// The browser client is a singleton in @supabase/ssr, so every call shares one instance.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => fake.client }));
vi.mock('@/app/actions/board-actions', () => ({ getBoardData }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const BOARD_ID = '8dfd6e24-a3d8-4a36-afff-6d01cd29f5c1';
const OTHER_BOARD_ID = '147f0af0-b501-4bd1-a283-ac596a800cf2';
const { emitAuth } = fake;

function makeSession(userId: string, accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    expires_at: 1_790_922_160,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

const alice = makeSession('user-alice', 'token-alice');
const bob = makeSession('user-bob', 'token-bob');

function channels(): FakeChannel[] {
  return fake.state.channels;
}

/** Channels that subscribe() was called on (as opposed to merely being constructed). */
function subscribedChannels(): FakeChannel[] {
  return channels().filter((c) => c.joinedWithToken !== undefined);
}

/** Channels whose join actually went out and that have not been removed. */
function liveChannels(): FakeChannel[] {
  return subscribedChannels().filter((c) => !c.joinDropped && !c.removed);
}

/** Let the hook's getSession → setAuth → subscribe chain run to completion. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await settle();
}

function fail(status: Exclude<Status, 'SUBSCRIBED'> = 'CHANNEL_ERROR') {
  act(() => liveChannels()[0].emitStatus(status));
}

function renderRealtime(options?: { strict?: boolean }) {
  const dispatch = vi.fn();
  const view = renderHook(({ boardId }) => useRealtime(boardId, dispatch), {
    initialProps: { boardId: BOARD_ID },
    wrapper: options?.strict ? StrictMode : undefined,
  });
  return { ...view, dispatch };
}

function boardData(id = BOARD_ID) {
  return { data: { id, title: 'QA – Realtime auth', columns: [], members: [] } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fake.state.session = null;
  fake.state.accessTokenValue = null;
  fake.state.channels = [];
  fake.state.socketChannels.clear();
  fake.state.socket = 'disconnected';
  fake.state.authListeners.clear();
  fake.state.authLock = Promise.resolve();
  getBoardData.mockResolvedValue(boardData());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRealtime — authenticated subscription', () => {
  it("joins the board channel with the signed-in user's access token", async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    expect(liveChannels()).toHaveLength(1);
    expect(liveChannels()[0].joinedWithToken).toBe('token-alice');
  });

  it('listens to tasks, columns and board_members for this board only', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    expect(liveChannels()[0].bindings.map(({ table, filter }) => ({ table, filter }))).toEqual([
      { table: 'tasks', filter: `board_id=eq.${BOARD_ID}` },
      { table: 'columns', filter: `board_id=eq.${BOARD_ID}` },
      { table: 'board_members', filter: `board_id=eq.${BOARD_ID}` },
    ]);
  });

  it('does not subscribe anonymously when there is no session', async () => {
    renderRealtime();
    await settle();

    expect(subscribedChannels()).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
    // It waits for auth rather than retrying: nothing is scheduled.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('subscribes as the user once they sign in', async () => {
    renderRealtime();
    await settle();

    // emitAuth holds the auth lock while notifying, so this also fails if the
    // hook ever awaits getSession() inside its auth callback (a deadlock).
    emitAuth('SIGNED_IN', alice);
    await settle();

    expect(liveChannels()).toHaveLength(1);
    expect(liveChannels()[0].joinedWithToken).toBe('token-alice');
  });

  it('tears down and resubscribes as the new user when the user changes', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();
    const aliceChannel = liveChannels()[0];

    emitAuth('SIGNED_IN', bob);
    await settle();

    expect(aliceChannel.removed).toBe(true);
    expect(liveChannels()).toHaveLength(1);
    expect(liveChannels()[0].joinedWithToken).toBe('token-bob');
  });

  it("keeps the channel when the same user's token is refreshed", async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    emitAuth('TOKEN_REFRESHED', makeSession('user-alice', 'token-alice-2'));
    await settle();

    expect(subscribedChannels()).toHaveLength(1);
    expect(subscribedChannels()[0].removed).toBe(false);
  });

  it('drops the channel when the user signs out', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    emitAuth('SIGNED_OUT', null);
    await settle();

    expect(liveChannels()).toHaveLength(0);
  });

  it('ignores a session read that resolves after a newer one', async () => {
    let releaseStaleRead!: () => void;
    fake.client.auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseStaleRead = () => resolve({ data: { session: alice }, error: null });
        }),
    );
    renderRealtime();
    await settle();
    emitAuth('SIGNED_IN', bob);
    await settle();
    const bobChannel = liveChannels()[0];

    releaseStaleRead();
    await settle();

    expect(bobChannel.removed).toBe(false);
    expect(liveChannels()).toEqual([bobChannel]);
    // …and the socket was not re-authed as alice under bob's channel.
    expect(fake.state.accessTokenValue).toBe('token-bob');
  });

  it('does not join as a user whose setAuth finished after a newer sign-in', async () => {
    fake.state.session = alice;
    let releaseAliceAuth!: () => void;
    fake.client.realtime.setAuth.mockImplementationOnce((token?: string | null) => {
      fake.state.accessTokenValue = token ?? null;
      return new Promise<void>((resolve) => {
        releaseAliceAuth = resolve;
      });
    });
    renderRealtime();
    await settle();
    emitAuth('SIGNED_IN', bob);
    await settle();
    const bobChannel = liveChannels()[0];

    releaseAliceAuth();
    await settle();

    expect(bobChannel.joinedWithToken).toBe('token-bob');
    expect(liveChannels()).toEqual([bobChannel]);
  });
});

describe('useRealtime — recovery', () => {
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'replaces the channel after %s once the backoff elapses',
    async (status) => {
      fake.state.session = alice;
      renderRealtime();
      await settle();
      const first = liveChannels()[0];

      fail(status);
      await settle();
      expect(first.removed).toBe(true);
      expect(liveChannels()).toHaveLength(0);

      await advance(1_000);

      expect(liveChannels()).toHaveLength(1);
      expect(liveChannels()[0].joinedWithToken).toBe('token-alice');
    },
  );

  it('backs off exponentially between consecutive failures, capped at 30s', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    async function failAndWait(ms: number): Promise<boolean> {
      const before = subscribedChannels().length;
      fail();
      await settle();
      await advance(ms);
      return subscribedChannels().length > before && liveChannels().length === 1;
    }

    expect(await failAndWait(1_000)).toBe(true);
    // Second consecutive failure waits 2s, so 1s is not enough…
    fail();
    await settle();
    await advance(1_999);
    expect(liveChannels()).toHaveLength(0);
    await advance(1);
    expect(liveChannels()).toHaveLength(1);

    // …and however many failures follow, the wait never exceeds the cap.
    for (let i = 0; i < 8; i++) expect(await failAndWait(30_000)).toBe(true);
  });

  it('resets the backoff once a channel subscribes again', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    for (let i = 0; i < 3; i++) {
      fail();
      await settle();
      await advance(30_000);
    }
    act(() => liveChannels()[0].emitStatus('SUBSCRIBED'));
    await settle();

    const failed = liveChannels()[0];
    fail();
    await settle();
    await advance(1_000);

    expect(failed.removed).toBe(true);
    expect(liveChannels()).toHaveLength(1);
  });

  it('ignores late status reports from a channel it has already replaced', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();
    const aliceChannel = liveChannels()[0];
    emitAuth('SIGNED_IN', bob);
    await settle();
    const bobChannel = liveChannels()[0];

    // realtime-js keeps a removed channel until its leave completes, so a socket
    // error in that window still reaches the old channel's callback.
    act(() => aliceChannel.emitStatus('CHANNEL_ERROR'));
    await settle();

    expect(bobChannel.removed).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does not treat its own teardown as an outage', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    // Replacing alice's channel removes it, and removal reports CLOSED.
    emitAuth('SIGNED_IN', bob);
    await settle();
    await advance(60_000);

    expect(subscribedChannels()).toHaveLength(2);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('tells the user once per outage rather than on every retry', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    for (let i = 0; i < 3; i++) {
      fail();
      await settle();
      await advance(30_000);
    }
    expect(toastError).toHaveBeenCalledTimes(1);

    act(() => liveChannels()[0].emitStatus('SUBSCRIBED'));
    await settle();
    fail('TIMED_OUT');
    await settle();
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the browser comes back online', () => window.dispatchEvent(new Event('online'))],
    ['the tab becomes visible', () => document.dispatchEvent(new Event('visibilitychange'))],
  ])('resubscribes straight away when %s, without waiting out the backoff', async (_, fire) => {
    fake.state.session = alice;
    renderRealtime();
    await settle();
    fail();
    await settle();
    expect(liveChannels()).toHaveLength(0);

    act(fire);
    await settle();

    expect(liveChannels()).toHaveLength(1);
  });
});

describe('useRealtime — sync', () => {
  it('resyncs the board when the channel subscribes', async () => {
    fake.state.session = alice;
    const { dispatch } = renderRealtime();
    await settle();

    act(() => liveChannels()[0].emitStatus('SUBSCRIBED'));
    await settle();

    expect(getBoardData).toHaveBeenCalledWith(BOARD_ID);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SYNC_STATE',
      payload: { columns: [], members: [] },
    });
  });

  it('collapses a burst of change events into one debounced refetch', async () => {
    fake.state.session = alice;
    renderRealtime();
    await settle();
    const [tasks, columns] = liveChannels()[0].bindings;

    act(() => {
      tasks.callback();
      columns.callback();
      tasks.callback();
    });
    await advance(299);
    expect(getBoardData).not.toHaveBeenCalled();
    await advance(1);

    expect(getBoardData).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the tab becomes visible', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['the browser comes back online', () => window.dispatchEvent(new Event('online'))],
  ])('refetches the board when %s', async (_, fire) => {
    fake.state.session = alice;
    renderRealtime();
    await settle();

    act(fire);
    await advance(300);

    expect(getBoardData).toHaveBeenCalledWith(BOARD_ID);
  });

  it('drops a refetch that resolves after unmount', async () => {
    fake.state.session = alice;
    const { dispatch, unmount } = renderRealtime();
    await settle();
    let resolveFetch!: (value: unknown) => void;
    getBoardData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    act(() => liveChannels()[0].emitStatus('SUBSCRIBED'));

    unmount();
    resolveFetch(boardData());
    await settle();

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useRealtime — lifecycle', () => {
  it('removes every channel it created on unmount, including under StrictMode', async () => {
    fake.state.session = alice;
    const { unmount } = renderRealtime({ strict: true });
    await settle();
    emitAuth('SIGNED_IN', bob);
    await settle();

    unmount();
    await settle();

    expect(subscribedChannels().length).toBeGreaterThan(0);
    expect(channels().every((c) => c.removed)).toBe(true);
    expect(fake.state.socketChannels.size).toBe(0);
    expect(fake.state.authListeners.size).toBe(0);
  });

  it('joins the new board when boardId changes', async () => {
    fake.state.session = alice;
    const { rerender } = renderRealtime();
    await settle();
    const first = liveChannels()[0];

    // The old run's cleanup removes its channel; realtime-js would disconnect the
    // socket if that emptied its channel list, dropping the new run's join.
    rerender({ boardId: OTHER_BOARD_ID });
    await settle();

    expect(first.removed).toBe(true);
    expect(liveChannels()).toHaveLength(1);
    expect(liveChannels()[0].bindings.map((b) => b.filter)).toEqual([
      `board_id=eq.${OTHER_BOARD_ID}`,
      `board_id=eq.${OTHER_BOARD_ID}`,
      `board_id=eq.${OTHER_BOARD_ID}`,
    ]);
  });

  it('does not subscribe if auth resolves after unmount', async () => {
    fake.state.session = alice;
    let releaseSession!: () => void;
    fake.client.auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSession = () => resolve({ data: { session: alice }, error: null });
        }),
    );
    const { unmount } = renderRealtime();

    unmount();
    releaseSession();
    await settle();

    expect(subscribedChannels()).toHaveLength(0);
  });

  it('does not retry after unmount', async () => {
    fake.state.session = alice;
    const { unmount } = renderRealtime();
    await settle();
    fail();
    await settle();

    unmount();
    await advance(60_000);

    expect(subscribedChannels()).toHaveLength(1);
  });
});
