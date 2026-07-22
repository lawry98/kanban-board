'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { BoardAction, BoardState } from '@/types';
import type { Dispatch } from 'react';

interface UseOptimisticUpdateOptions {
  /** Current board state. Mirrored into a ref so rollback snapshots the value
   *  at mutation time rather than the one captured at render time. */
  state: BoardState;
  dispatch: Dispatch<BoardAction>;
  errorMessage?: string;
}

type ActionResultLike<T> = { data?: T; error?: string };

/**
 * Optimistic mutation helper: dispatch locally, call the server action, and
 * restore the pre-mutation state if it fails.
 *
 * The rollback target is snapshotted inside `execute`, *before* the optimistic
 * dispatch. Taking it from a render-time prop (as an earlier version did) rolls
 * back to whatever state existed when the callback was created, which after any
 * intervening realtime sync is the wrong tree. Keeping it in a ref also keeps
 * `execute` referentially stable across state changes.
 */
export function useOptimisticUpdate({ state, dispatch, errorMessage }: UseOptimisticUpdateOptions) {
  const [isPending, setIsPending] = useState(false);
  const stateRef = useRef(state);

  // Written in an effect (not during render) so the ref only ever holds a
  // committed state; event handlers always run after commit.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const execute = useCallback(
    async <T>(
      optimisticAction: BoardAction,
      serverAction: () => Promise<ActionResultLike<T>>,
    ): Promise<ActionResultLike<T>> => {
      const snapshot = stateRef.current;

      dispatch(optimisticAction);
      setIsPending(true);

      try {
        const result = await serverAction();
        if (result.error) {
          dispatch({ type: 'SYNC_STATE', payload: snapshot });
          toast.error(result.error);
        }
        return result;
      } catch (err) {
        dispatch({ type: 'SYNC_STATE', payload: snapshot });
        toast.error(errorMessage ?? 'Something went wrong');
        console.error(err);
        return { error: errorMessage ?? 'Something went wrong' };
      } finally {
        setIsPending(false);
      }
    },
    [dispatch, errorMessage],
  );

  return { execute, isPending };
}
