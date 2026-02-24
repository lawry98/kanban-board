'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Dispatch } from 'react';

import { createClient } from '@/lib/supabase/client';
import { getBoardData } from '@/app/actions/board-actions';
import type { BoardAction } from '@/types';

export function useRealtime(boardId: string, dispatch: Dispatch<BoardAction>) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncBoard = useCallback(async () => {
    const result = await getBoardData(boardId);
    if (result.data) {
      dispatch({
        type: 'SYNC_STATE',
        payload: {
          columns: result.data.columns,
          members: result.data.members,
        },
      });
    }
  }, [boardId, dispatch]);

  const debouncedSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(syncBoard, 300);
  }, [syncBoard]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`board:${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `board_id=eq.${boardId}`,
        },
        debouncedSync,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'columns',
          filter: `board_id=eq.${boardId}`,
        },
        debouncedSync,
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [boardId, debouncedSync]);
}
