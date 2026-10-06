'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createColumn } from '@/app/actions/column-actions';
import { useBoardContext } from '@/contexts/board-context';

export function AddColumnButton() {
  const { board, dispatch } = useBoardContext();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Set when the form closes by the user's choice; the button only remounts on the next
  // render, so the effect below focuses it then.
  const focusAddButtonRef = useRef(false);

  useEffect(() => {
    if (isEditing || !focusAddButtonRef.current) return;
    focusAddButtonRef.current = false;
    addButtonRef.current?.focus();
  }, [isEditing]);

  function closeForm() {
    setIsEditing(false);
    setTitle('');
    focusAddButtonRef.current = true;
  }

  async function handleSubmit() {
    if (!title.trim() || isLoading) return;
    setIsLoading(true);

    const result = await createColumn({ boardId: board.id, title: title.trim() });
    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    // The provider seeds its reducer from `board` only once, so `revalidatePath`
    // never reaches local state — dispatch, or the column waits for a resync.
    if (result.data) {
      dispatch({ type: 'ADD_COLUMN', payload: result.data });
    }
    closeForm();
    toast.success('Column created');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') closeForm();
  }

  if (isEditing) {
    return (
      <div
        className="bg-card flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-3"
        onBlur={(e) => {
          // An empty form closes once focus leaves it, not when Tab moves on to Cancel.
          if (!title.trim() && !e.currentTarget.contains(e.relatedTarget)) setIsEditing(false);
        }}
      >
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Column name"
          autoFocus
          // Not `disabled`: that drops focus to <body>, and on a failure the user would
          // have to find their way back. The handler guards reentry.
          readOnly={isLoading}
          maxLength={100}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={isLoading || !title.trim()}>
            {isLoading ? 'Adding…' : 'Add column'}
          </Button>
          <Button size="sm" variant="ghost" onClick={closeForm}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={addButtonRef}
      onClick={() => setIsEditing(true)}
      className="text-muted-foreground hover:border-foreground/30 hover:text-foreground flex h-12 w-64 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition-colors"
    >
      <Plus className="h-4 w-4" />
      Add column
    </button>
  );
}
