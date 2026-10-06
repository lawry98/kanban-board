'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/board/confirm-dialog';
import { ConnectionIndicator } from '@/components/board/connection-indicator';
import { MembersDialog } from '@/components/board/members-dialog';
import { ShareBoardDialog } from '@/components/board/share-board-dialog';
import { deleteBoard, updateBoard } from '@/app/actions/board-actions';
import { useBoardContext } from '@/contexts/board-context';

import type { RealtimeStatus } from '@/hooks/use-realtime';

interface BoardHeaderProps {
  realtimeStatus: RealtimeStatus;
  onOpenActivity: () => void;
}

export function BoardHeader({ realtimeStatus, onOpenActivity }: BoardHeaderProps) {
  const { state, dispatch, board, isOwner, canEdit } = useBoardContext();
  // The live title lives in reducer state; `board` is the mount-time snapshot, so
  // only its `id` is read from it.
  const title = state.meta.title;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  // Escape sets this before blurring so the shared blur handler skips the save.
  const cancelEditRef = useRef(false);
  // The title the editor was seeded with. A save only happens if the input moved
  // off it; comparing against the live title alone would write the stale seed
  // back over a rename a collaborator made while the editor was open.
  const editSeedRef = useRef(title);
  // Enter/Escape set this so focus returns to the title button once the editor
  // closes. A click-away blur leaves it unset: focus belongs to what was clicked.
  const restoreFocusRef = useRef(false);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const taskCount = state.columns.reduce((sum, col) => sum + col.tasks.length, 0);

  // Runs after the editor has unmounted and the title button is back in the DOM.
  useEffect(() => {
    if (isEditingTitle || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    titleButtonRef.current?.focus();
  }, [isEditingTitle]);

  function startEditing() {
    editSeedRef.current = title;
    setTitleValue(title);
    setIsEditingTitle(true);
  }

  async function saveTitle(raw: string) {
    const next = raw.trim();
    if (!next || next === editSeedRef.current || next === title) return;

    // Snapshot at call time; revert only this field so a concurrent resync of
    // columns/members is not rolled back with it.
    const previous = title;
    dispatch({ type: 'UPDATE_BOARD', payload: { title: next } });
    const result = await updateBoard(board.id, { title: next });
    if ('error' in result) {
      dispatch({ type: 'UPDATE_BOARD', payload: { title: previous } });
      toast.error(result.error);
      return;
    }
    dispatch({ type: 'UPDATE_BOARD', payload: { title: result.data.title } });
    toast.success('Board updated');
  }

  // Blur is the single save path: Enter blurs the input, so Enter + blur cannot
  // submit twice, and Escape cancels via the ref instead of saving on blur.
  function handleTitleBlur() {
    const cancelled = cancelEditRef.current;
    cancelEditRef.current = false;
    setIsEditingTitle(false);
    if (!cancelled) void saveTitle(titleValue);
  }

  async function handleDeleteBoard() {
    // deleteBoard redirects to /boards on success; only a failure returns here.
    const result = await deleteBoard(board.id);
    if (result?.error) toast.error(result.error);
  }

  return (
    <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        {isEditingTitle && canEdit ? (
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Focus lands on the title button before this keystroke's keypress
                // fires; without preventDefault that Enter would click it and
                // reopen the editor.
                e.preventDefault();
                restoreFocusRef.current = true;
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                cancelEditRef.current = true;
                restoreFocusRef.current = true;
                e.currentTarget.blur();
              }
            }}
            aria-label="Board title"
            className="h-8 w-full px-1 text-xl font-semibold sm:w-64"
            autoFocus
          />
        ) : (
          <h1 className="min-w-0 text-xl font-semibold tracking-tight">
            {canEdit ? (
              <button
                ref={titleButtonRef}
                type="button"
                onClick={startEditing}
                title={title}
                className="focus-visible:ring-ring block max-w-full cursor-pointer truncate rounded-sm text-left hover:opacity-70 focus-visible:ring-2 focus-visible:outline-none"
              >
                {title}
              </button>
            ) : (
              <span className="block truncate" title={title}>
                {title}
              </span>
            )}
          </h1>
        )}
        {/* The status shares the stats line, so it never takes width from the truncating title. */}
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>
            {state.columns.length} columns · {taskCount} tasks
          </span>
          <span aria-hidden="true">·</span>
          <ConnectionIndicator status={realtimeStatus} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Member avatars — click to open member management (all roles). */}
        <TooltipProvider>
          <button
            type="button"
            onClick={() => setMembersOpen(true)}
            className="focus-visible:ring-ring flex -space-x-2 rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label="View members"
          >
            {state.members.slice(0, 5).map((member) => {
              const name = member.profile.fullName ?? member.profile.email;
              const initials = name.slice(0, 2).toUpperCase();
              return (
                <Tooltip key={member.userId}>
                  <TooltipTrigger asChild>
                    <Avatar className="border-background h-7 w-7 border-2">
                      {member.profile.avatarUrl && (
                        <AvatarImage src={member.profile.avatarUrl} alt={name} />
                      )}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{name}</p>
                    <p className="text-muted-foreground text-xs capitalize">
                      {member.role.toLowerCase()}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {state.members.length > 5 && (
              <div className="border-background bg-muted flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-medium">
                +{state.members.length - 5}
              </div>
            )}
          </button>
        </TooltipProvider>

        {/* Share (owner-only) */}
        {isOwner && (
          <Button
            variant="outline"
            size="icon-sm"
            className="sm:w-auto sm:px-2.5"
            onClick={() => setShareOpen(true)}
            aria-label="Share board"
          >
            <Share2 aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        )}

        {/* Activity feed */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="sm:w-auto sm:px-2.5"
          onClick={onOpenActivity}
          aria-label="Activity"
        >
          <Activity aria-hidden="true" />
          <span className="hidden sm:inline">Activity</span>
        </Button>

        {/* Board actions (owner-only) */}
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Board actions">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isOwner && (
        <ShareBoardDialog boardId={board.id} open={shareOpen} onOpenChange={setShareOpen} />
      )}
      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} />

      {isOwner && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this board?"
          description={
            <>
              <span className="text-foreground font-medium">{title}</span> and all its columns,
              tasks, members, and activity will be permanently deleted. This cannot be undone.
            </>
          }
          confirmLabel="Delete board"
          pendingLabel="Deleting…"
          onConfirm={handleDeleteBoard}
        />
      )}
    </header>
  );
}
