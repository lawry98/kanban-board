'use client';

import { useState } from 'react';
import { Activity, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { addBoardMember, updateBoard } from '@/app/actions/board-actions';
import { useBoardContext } from '@/contexts/board-context';

interface BoardHeaderProps {
  onOpenActivity: () => void;
}

export function BoardHeader({ onOpenActivity }: BoardHeaderProps) {
  const { state, board, isOwner, canEdit } = useBoardContext();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(board.title);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);

    const result = await addBoardMember(board.id, inviteEmail.trim(), inviteRole);
    setIsInviting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`${inviteEmail} added to the board`);
    setInviteEmail('');
    setInviteOpen(false);
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
            className="h-8 text-xl font-semibold px-1 w-64"
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
        <p className="text-xs text-muted-foreground">
          {state.columns.length} columns · {taskCount} tasks
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Member avatars */}
        <TooltipProvider>
          <div className="flex -space-x-2">
            {state.members.slice(0, 5).map((member) => {
              const name = member.profile.fullName ?? member.profile.email;
              const initials = name.slice(0, 2).toUpperCase();
              return (
                <Tooltip key={member.userId}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-7 w-7 border-2 border-background cursor-default">
                      {member.profile.avatarUrl && (
                        <AvatarImage src={member.profile.avatarUrl} alt={name} />
                      )}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {member.role.toLowerCase()}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {state.members.length > 5 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
                +{state.members.length - 5}
              </div>
            )}
          </div>
        </TooltipProvider>

        {/* Invite member */}
        {isOwner && (
          <Popover open={inviteOpen} onOpenChange={setInviteOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Invite
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium">Invite team member</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    They must already have an account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as 'EDITOR' | 'VIEWER')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EDITOR">Editor — can create and edit tasks</SelectItem>
                      <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={isInviting}>
                  {isInviting ? 'Inviting…' : 'Send invite'}
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        )}

        {/* Activity feed */}
        <Button variant="ghost" size="sm" onClick={onOpenActivity}>
          <Activity className="mr-2 h-4 w-4" />
          Activity
        </Button>
      </div>
    </div>
  );
}
