'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Dispatch } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { getBoardData } from '@/app/actions/board-actions';
import type { BoardAction } from '@/types';

const SYNC_DEBOUNCE_MS = 300;
// Resubscribe backoff after CHANNEL_ERROR / TIMED_OUT: 1s, 2s, 4s, … capped at 30s.
const RESUBSCRIBE_BASE_MS = 1_000;
const RESUBSCRIBE_MAX_MS = 30_000;

/**
 * `getBoardData` returns this exact string (from `requireBoardMember`) once the
 * viewer is no longer a member — the signal that they've been removed from the
 * board while watching it. Distinct from a transient/network error, which must
 * NOT eject them.
 */
const ACCESS_LOST_ERROR = 'Forbidden';

/** What the board header shows; see (8) in the design comment below. */
export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting';

function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getOnline = (): boolean => navigator.onLine;
// The server cannot know; assume online so the first paint reads as `connecting`.
const getServerOnline = (): boolean => true;

/**
 * Realtime board synchronisation.
 *
 * Design (the least obvious invariant in this file — read before editing):
 *
 * 1. We do NOT apply the `postgres_changes` payloads. Every event, whatever it
 *    is, is treated purely as a *hint* that the board is stale, and triggers a
 *    debounced full refetch through `getBoardData` (a Server Action, so it goes
 *    through auth + membership checks). This keeps a single source of truth and
 *    avoids reimplementing row-level merge logic on the client.
 *
 * 2. Consequence: your own writes echo back. Your mutation commits, Postgres
 *    emits a change, and this hook refetches and dispatches `SYNC_STATE` over
 *    your optimistic state. That is *safe* — the refetch is newer than the
 *    optimistic value — but it costs a round trip per write. The debounce
 *    collapses bursts into one fetch. `SYNC_STATE` reconciles by id and
 *    preserves object identity for unchanged rows, so an echo does not
 *    re-render the whole board.
 *
 * 3. Ordering: responses can arrive out of order (a refetch started before your
 *    mutation committed can resolve after it, clobbering newer data with older).
 *    Every fetch takes a sequence number; a response whose sequence is no longer
 *    the newest is dropped. Effect cleanup also bumps the sequence, which
 *    invalidates any fetch in flight across unmount / `boardId` change.
 *
 * 4. Recovery: `SUBSCRIBED` is the catch-up. Every event during a gap in the
 *    subscription is lost forever, so we resync unconditionally whenever the
 *    channel (re)subscribes. Tab refocus and `online` resync too, and also
 *    resubscribe at once if the channel is down, since a backgrounded tab may
 *    have had its socket throttled or closed and the backoff in (6) can be up to
 *    30s away.
 *
 * 5. Auth: the channel must join *as the user*. Realtime fixes the claims of a
 *    `postgres_changes` subscription at join and filters every event through
 *    RLS with them, so an anon join reports SUBSCRIBED and then silently
 *    receives nothing. realtime-js copies the socket's token into the join
 *    payload synchronously inside `subscribe()`; on a fresh socket that token is
 *    not yet resolved, and with no session supabase-js falls back to the anon
 *    key. Hence: read the session, `await setAuth(access_token)`, *then*
 *    subscribe — and never subscribe without a session. Auth events are hints in
 *    the same way as (1): on each one we re-read the session and resubscribe
 *    only if the user changed. A same-user token refresh needs nothing from us;
 *    supabase-js pushes the new token to the joined channel.
 *
 * 6. CHANNEL_ERROR, TIMED_OUT and a server-initiated CLOSED (e.g. an expired
 *    JWT) tear the channel down and resubscribe from scratch (fresh session and
 *    token) after a capped exponential backoff. Left alone, realtime-js would
 *    rejoin with its old join payload, or after CLOSED not at all. Removing our
 *    last channel also makes it disconnect the socket, cancelling its own
 *    reconnect, so reconnection is ours to drive.
 *
 * 7. realtime-js disconnects the socket the moment its last channel is removed,
 *    and while that disconnect is in flight `connect()` is a no-op, so a join
 *    sent then is never delivered (it times out ~10s later). So the socket's
 *    channel list must not empty between a teardown and the join after it. Each
 *    effect run builds its channel synchronously, before connect() awaits (the
 *    previous run's cleanup has just removed its own). A user change joins the
 *    new channel before removing the old one. A failed channel gets a reserved
 *    successor before it is removed.
 *
 * 8. Status: the hook returns a `RealtimeStatus` for the header. `connecting` is
 *    the state until the channel's first `SUBSCRIBED` (also after a `boardId`
 *    change); `live` follows `SUBSCRIBED`; `reconnecting` follows the outage
 *    branch of (6), a `connect()` that finds no session, and one that throws
 *    while no channel is joined or joining. With a channel up, a failed refresh
 *    (say a refocus whose session read throws) leaves the status alone: that
 *    channel's own callbacks drive it, and no later SUBSCRIBED would ever clear
 *    a `reconnecting` set here. It is only ever set from a callback or after an
 *    await, after the same `disposed` / `next !== channel` guards as everything
 *    else, so a late report from a replaced channel cannot change it. The browser's
 *    own `navigator.onLine` overrides it: a dropped network can leave the socket
 *    open until the heartbeat times out, tens of seconds, and `live` would be a
 *    lie meanwhile. Back online, the channel's own status shows again.
 *
 * Known better design (deliberately out of scope for this pass): switch to
 * `broadcast` messages carrying the mutated row plus an origin id, so a client
 * can ignore its own echoes and apply deltas without a refetch.
 */
export function useRealtime(boardId: string, dispatch: Dispatch<BoardAction>): RealtimeStatus {
  const router = useRouter();
  // Keyed by board so a boardId change reads as `connecting` without a
  // synchronous setState in the effect body.
  const [channelState, setChannelState] = useState<{ boardId: string; status: RealtimeStatus }>({
    boardId,
    status: 'connecting',
  });
  const online = useSyncExternalStore(subscribeToConnectivity, getOnline, getServerOnline);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic sequence for fetch ordering; see (3) above.
  const syncSeqRef = useRef(0);

  const syncBoard = useCallback(async () => {
    const seq = ++syncSeqRef.current;
    const result = await getBoardData(boardId);

    // A newer sync (or the effect cleanup) superseded this response.
    if (seq !== syncSeqRef.current) return;

    if ('error' in result && result.error) {
      // Removed-from-board: a board_members DELETE echoes back, the refetch is
      // denied, and leaving them stranded on a board they can no longer read is
      // worse than a redirect. Session expiry / transient errors only toast.
      if (result.error === ACCESS_LOST_ERROR) {
        toast.error('You no longer have access to this board.');
        router.push('/boards');
        return;
      }
      // Without surfacing it the client would silently render stale state forever.
      toast.error(result.error);
      return;
    }

    const data = 'data' in result ? result.data : null;
    if (!data) {
      // Board deleted out from under the viewer — eject rather than freeze.
      toast.error('This board is no longer available.');
      router.push('/boards');
      return;
    }

    dispatch({
      type: 'SYNC_STATE',
      payload: {
        meta: { title: data.title, description: data.description },
        columns: data.columns,
        members: data.members,
      },
    });
  }, [boardId, dispatch, router]);

  const debouncedSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void syncBoard();
    }, SYNC_DEBOUNCE_MS);
  }, [syncBoard]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    // The channel this run has subscribed (joined or joining), and its user.
    let channel: RealtimeChannel | null = null;
    let channelUserId: string | null = null;
    // Built but not yet subscribed: the next join, held in reserve; see (7).
    let reserved: RealtimeChannel | null = null;
    // Each connect() takes a generation; one that resumes from an await after a
    // newer connect() (or cleanup) has started must not subscribe.
    let connectGen = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let outageNotified = false;

    function setStatus(status: RealtimeStatus) {
      if (disposed) return;
      // Same value, same state object: a repeat report must not re-render the board.
      setChannelState((prev) =>
        prev.boardId === boardId && prev.status === status ? prev : { boardId, status },
      );
    }

    function removeCurrentChannel() {
      if (!channel) return;
      const stale = channel;
      channel = null;
      channelUserId = null;
      void supabase.removeChannel(stale);
    }

    function scheduleResubscribe() {
      if (disposed || retryTimer) return;
      const delay = Math.min(RESUBSCRIBE_BASE_MS * 2 ** retryAttempt, RESUBSCRIBE_MAX_MS);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    }

    function createChannel(): RealtimeChannel {
      // Unique topic per subscription instance: React 19 StrictMode mounts the
      // effect twice, and `removeChannel` is async, so two channels sharing a
      // topic can briefly overlap on one client. A unique suffix makes each
      // subscription independent and guarantees cleanup removes exactly the
      // channel this run created.
      const topic = `board:${boardId}:${Math.random().toString(36).slice(2, 10)}`;

      return supabase
        .channel(topic)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks', filter: `board_id=eq.${boardId}` },
          debouncedSync,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'columns', filter: `board_id=eq.${boardId}` },
          debouncedSync,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'board_members',
            filter: `board_id=eq.${boardId}`,
          },
          debouncedSync,
        )
        .on(
          'postgres_changes',
          // The board row itself: renames and description edits. Its key is `id`.
          { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
          debouncedSync,
        );
    }

    function join(next: RealtimeChannel, userId: string) {
      channel = next;
      channelUserId = userId;

      next.subscribe((status) => {
        // A replaced or removed channel still reports (its teardown emits CLOSED).
        if (disposed || next !== channel) return;
        switch (status) {
          case 'SUBSCRIBED':
            // Initial join *and* every reconnect: catch up on missed events.
            retryAttempt = 0;
            outageNotified = false;
            setStatus('live');
            void syncBoard();
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
          case 'CLOSED':
            // Our own teardown's CLOSED is filtered out above, so a CLOSED here came
            // from the server (e.g. an expired JWT), and realtime-js won't rejoin it.
            reserved ??= createChannel();
            removeCurrentChannel();
            setStatus('reconnecting');
            if (!outageNotified) {
              outageNotified = true;
              toast.error('Live updates interrupted. Reconnecting…');
            }
            scheduleResubscribe();
            break;
        }
      });
    }

    // See (5): never join before the socket carries the user's token.
    async function connect() {
      const gen = ++connectGen;
      const superseded = () => disposed || gen !== connectGen;
      try {
        // This only picks the token to join with (Realtime verifies the JWT), so it
        // is not the authorization check CLAUDE.md reserves for getUser().
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (superseded()) return;
        // Already joined as this user (e.g. after a token refresh): keep the channel.
        if (channel && session?.user.id === channelUserId) return;

        if (!session) {
          removeCurrentChannel();
          setStatus('reconnecting');
          console.error(
            `useRealtime: no auth session; not subscribing to board ${boardId}.`,
            error ?? '',
          );
          return;
        }

        await supabase.realtime.setAuth(session.access_token);
        if (superseded()) return;
        // Join the replacement before letting go of the old channel; see (7).
        const previous = channel;
        join(reserved ?? createChannel(), session.user.id);
        reserved = null;
        if (previous) void supabase.removeChannel(previous);
      } catch (err) {
        if (superseded()) return;
        console.error('useRealtime: failed to subscribe', err);
        // A joined channel's own callbacks drive status; see (8).
        if (!channel) setStatus('reconnecting');
        scheduleResubscribe();
      }
    }

    // Never await in here: auth-js awaits this callback while holding its storage
    // lock, and getSession() queues on that same lock — awaiting would deadlock.
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (!disposed) void connect();
    });

    // Build this run's channel now, before connect() awaits: the previous run's
    // cleanup has just removed its own; see (7).
    reserved = createChannel();
    void connect();

    // connect() is a no-op while the channel is up, and resubscribes at once if
    // it is down; see (4).
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      debouncedSync();
      void connect();
    }

    function handleOnline() {
      debouncedSync();
      void connect();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      authSubscription.unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
      removeCurrentChannel();
      if (reserved) void supabase.removeChannel(reserved);
      // Invalidate any in-flight fetch so it cannot dispatch into a stale board.
      syncSeqRef.current += 1;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [boardId, debouncedSync, syncBoard]);

  const channelStatus = channelState.boardId === boardId ? channelState.status : 'connecting';
  return online ? channelStatus : 'reconnecting';
}
