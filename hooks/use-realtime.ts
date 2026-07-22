'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Dispatch } from 'react';

import { createClient } from '@/lib/supabase/client';
import { getBoardData } from '@/app/actions/board-actions';
import type { BoardAction } from '@/types';

const SYNC_DEBOUNCE_MS = 300;

/**
 * `getBoardData` returns this exact string (from `requireBoardMember`) once the
 * viewer is no longer a member — the signal that they've been removed from the
 * board while watching it. Distinct from a transient/network error, which must
 * NOT eject them.
 */
const ACCESS_LOST_ERROR = 'Forbidden';

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
 * 4. Recovery: `SUBSCRIBED` is the reconnect catch-up. Supabase transparently
 *    re-establishes the socket after a network drop, but every event during the
 *    gap is lost forever, so we resync unconditionally whenever the channel
 *    (re)subscribes. Tab refocus and `online` do the same, since a backgrounded
 *    tab may have had its socket throttled or closed.
 *
 * Known better design (deliberately out of scope for this pass): switch to
 * `broadcast` messages carrying the mutated row plus an origin id, so a client
 * can ignore its own echoes and apply deltas without a refetch.
 */
export function useRealtime(boardId: string, dispatch: Dispatch<BoardAction>) {
  const router = useRouter();
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
      payload: { columns: data.columns, members: data.members },
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

    // Unique topic per subscription instance: React 19 StrictMode mounts the
    // effect twice, and `removeChannel` is async, so two channels sharing a
    // topic can briefly overlap on one client. A unique suffix makes each
    // subscription independent and guarantees cleanup removes exactly the
    // channel this run created.
    const topic = `board:${boardId}:${Math.random().toString(36).slice(2, 10)}`;

    const channel = supabase
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
        { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${boardId}` },
        debouncedSync,
      )
      .subscribe((status) => {
        if (disposed) return;
        switch (status) {
          case 'SUBSCRIBED':
            // Initial join *and* every reconnect: catch up on missed events.
            void syncBoard();
            break;
          case 'CHANNEL_ERROR':
            toast.error('Lost the live connection to this board. Reload if updates stop arriving.');
            break;
          case 'TIMED_OUT':
            toast.error('Live updates timed out. Reconnecting…');
            break;
          default:
            // 'CLOSED' is also emitted during normal teardown — nothing to do.
            break;
        }
      });

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') debouncedSync();
    }

    function handleOnline() {
      debouncedSync();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      // Invalidate any in-flight fetch so it cannot dispatch into a stale board.
      syncSeqRef.current += 1;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      void supabase.removeChannel(channel);
    };
  }, [boardId, debouncedSync, syncBoard]);
}
