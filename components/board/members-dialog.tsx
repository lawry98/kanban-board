'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeMemberRole, leaveBoard, removeBoardMember } from '@/app/actions/board-actions';
import { useBoardContext } from '@/contexts/board-context';

type EditableRole = 'EDITOR' | 'VIEWER';

interface MembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MembersDialog({ open, onOpenChange }: MembersDialogProps) {
  const { state, board, isOwner, currentUserId } = useBoardContext();
  // Disables a row's controls while its action is in flight; realtime then
  // refreshes state.members, so no optimistic reducer write is needed.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const currentMember = state.members.find((m) => m.userId === currentUserId);
  const canLeave = currentMember !== undefined && currentMember.role !== 'OWNER';

  async function handleRoleChange(userId: string, role: EditableRole) {
    setPendingUserId(userId);
    const result = await changeMemberRole(board.id, userId, { role });
    setPendingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Role updated');
  }

  async function handleRemove(userId: string) {
    setPendingUserId(userId);
    const result = await removeBoardMember(board.id, userId);
    setPendingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Member removed');
  }

  async function handleLeave() {
    setLeaving(true);
    // On success leaveBoard redirects to /boards server-side; only a failure
    // (e.g. last owner) returns here with an error to surface.
    const result = await leaveBoard(board.id);
    if (result?.error) {
      toast.error(result.error);
      setLeaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            {isOwner
              ? 'Manage who can access this board and what they can do.'
              : 'People with access to this board.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {state.members.map((member) => {
            const name = member.profile.fullName ?? member.profile.email;
            const initials = name.slice(0, 2).toUpperCase();
            const isSelf = member.userId === currentUserId;
            const isMemberOwner = member.role === 'OWNER';
            const busy = pendingUserId === member.userId;

            return (
              <li key={member.userId} className="flex items-center gap-3 rounded-md border p-2">
                <Avatar className="h-8 w-8 shrink-0">
                  {member.profile.avatarUrl && (
                    <AvatarImage src={member.profile.avatarUrl} alt={name} />
                  )}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {name}
                    {isSelf && <span className="text-muted-foreground"> (you)</span>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{member.profile.email}</p>
                </div>

                {isOwner && !isMemberOwner ? (
                  <div className="flex items-center gap-1">
                    <Select
                      value={member.role as EditableRole}
                      onValueChange={(v) => handleRoleChange(member.userId, v as EditableRole)}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 w-[110px]" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                        >
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            They will immediately lose access to this board. You can re-invite them
                            later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemove(member.userId)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <Badge variant={isMemberOwner ? 'default' : 'secondary'} className="capitalize">
                    {member.role.toLowerCase()}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        {canLeave && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive w-full" disabled={leaving}>
                <LogOut className="mr-2 h-4 w-4" />
                {leaving ? 'Leaving…' : 'Leave board'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave this board?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will lose access to {board.title}. You&apos;ll need a new invite to rejoin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeave}>Leave board</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
