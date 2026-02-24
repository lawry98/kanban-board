'use client';

import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createColumn } from '@/app/actions/column-actions';
import { useBoardContext } from '@/contexts/board-context';

export function AddColumnButton() {
  const { board } = useBoardContext();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!title.trim() || isLoading) return;
    setIsLoading(true);

    const result = await createColumn(board.id, title.trim());
    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setTitle('');
    setIsEditing(false);
    toast.success('Column created');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setTitle('');
    }
  }

  if (isEditing) {
    return (
      <div className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-card p-3">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!title.trim()) {
              setIsEditing(false);
            }
          }}
          placeholder="Column name"
          autoFocus
          disabled={isLoading}
          maxLength={100}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={isLoading || !title.trim()}>
            {isLoading ? 'Adding…' : 'Add column'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsEditing(false);
              setTitle('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex h-12 w-64 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
      Add column
    </button>
  );
}
