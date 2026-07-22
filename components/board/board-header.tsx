'use client';

import { useState } from 'react';
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
import { MembersDialog } from '@/components/board/members-dialog';
import { ShareBoardDialog } from '@/components/board/share-board-dialog';
import { deleteBoard, updateBoard } from '@/app/actions/board-actions';
import { useBoardContext } from '@/contexts/board-context';

interface BoardHeaderProps {
  onOpenActivity: () => void;
}

export function BoardHeader({ onOpenActivity }: BoardHeaderProps) {
  const { state, board, isOwner, canEdit } = useBoardContext();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(board.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const taskCount = state.columns.reduce((sum, col) => sum + col.tasks.length, 0);

  async function handleTitleSave() {
    if (!titleValue.trim() || titleValue === board.title) {
      setIsEditingTitle(false);
      setTitleValue(board.title);
      return;
    }

    const result = await updateBoard(board.id, { title: titleValue.trim() });
    if (result.error) {
      toast.error(result.error);
      setTitleValue(board.title);
    } else {
      toast.success('Board updated');
    }
    setIsEditingTitle(false);
  }

  async function handleDeleteBoard() {
    // deleteBoard redirects to /boards on success; only a failure returns here.
    const result = await deleteBoard(board.id);
    if (result?.error) toast.error(result.error);
  }

  return (
    <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-0.5">
        {isEditingTitle && canEdit ? (
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setIsEditingTitle(false);
                setTitleValue(board.title);
              }
            }}
            className="h-8 w-64 px-1 text-xl font-semibold"
            autoFocus
          />
        ) : (
          <h1
            className={`text-xl font-semibold tracking-tight ${canEdit ? 'cursor-pointer hover:opacity-70' : ''}`}
            onClick={() => canEdit && setIsEditingTitle(true)}
          >
            {board.title}
          </h1>
        )}
        <p className="text-muted-foreground text-xs">
          {state.columns.length} columns · {taskCount} tasks
        </p>
      </div>

      <div className="flex items-center gap-3">
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
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}

        {/* Activity feed */}
        <Button variant="ghost" size="sm" onClick={onOpenActivity}>
          <Activity className="mr-2 h-4 w-4" />
          Activity
        </Button>

        {/* Board actions (owner-only) */}
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Board actions">
                <MoreHorizontal className="h-4 w-4" />
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
              <span className="text-foreground font-medium">{board.title}</span> and all its
              columns, tasks, members, and activity will be permanently deleted. This cannot be
              undone.
            </>
          }
          confirmLabel="Delete board"
          pendingLabel="Deleting…"
          onConfirm={handleDeleteBoard}
        />
      )}
    </div>
  );
}
