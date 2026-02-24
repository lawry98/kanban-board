'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

import type { BoardAction, BoardState } from '@/types';
import type { Dispatch } from 'react';

interface UseOptimisticUpdateOptions {
  dispatch: Dispatch<BoardAction>;
  rollbackState?: BoardState;
  errorMessage?: string;
}

export function useOptimisticUpdate({ dispatch, rollbackState, errorMessage }: UseOptimisticUpdateOptions) {
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(
    async <T>(
      optimisticAction: BoardAction,
      serverAction: () => Promise<{ data?: T; error?: string }>,
    ) => {
      dispatch(optimisticAction);
      setIsPending(true);

      try {
        const result = await serverAction();
        if (result.error) {
          if (rollbackState) {
            dispatch({ type: 'SYNC_STATE', payload: rollbackState });
          }
          toast.error(result.error ?? errorMessage ?? 'Something went wrong');
        }
        return result;
      } catch (err) {
        if (rollbackState) {
          dispatch({ type: 'SYNC_STATE', payload: rollbackState });
        }
        toast.error(errorMessage ?? 'Something went wrong');
        console.error(err);
        return { error: 'Unknown error' };
      } finally {
        setIsPending(false);
      }
    },
    [dispatch, rollbackState, errorMessage],
  );

  return { execute, isPending };
}
