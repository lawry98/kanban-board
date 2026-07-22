'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addBoardMember } from '@/app/actions/board-actions';
import {
  createInvitation,
  getInvitations,
  revokeInvitation,
} from '@/app/actions/invitation-actions';
import type { Invitation } from '@prisma/client';

type LinkRole = 'EDITOR' | 'VIEWER';

interface ShareBoardDialogProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function joinUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${token}`;
}

export function ShareBoardDialog({ boardId, open, onOpenChange }: ShareBoardDialogProps) {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [linkRole, setLinkRole] = useState<LinkRole>('EDITOR');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailRole, setEmailRole] = useState<LinkRole>('EDITOR');
  const [adding, setAdding] = useState(false);

  // Reload the link list whenever the dialog opens. `open` is the trigger so a
  // reopen always reflects links created/revoked in another session. All state
  // writes stay inside the async continuation — a synchronous setState in the
  // effect body would trigger cascading renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getInvitations(boardId).then((result) => {
      if (cancelled) return;
      if ('error' in result && result.error) {
        toast.error(result.error);
        setInvitations([]);
        return;
      }
      setInvitations('data' in result && result.data ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await createInvitation(boardId, { role: linkRole });
    setCreating(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Failed to create invite link');
      return;
    }
    const created = result.data;
    setInvitations((prev) => [created, ...(prev ?? [])]);
    toast.success('Invite link created');
  }, [boardId, linkRole]);

  const handleCopy = useCallback(async (invitation: Invitation) => {
    try {
      await navigator.clipboard.writeText(joinUrl(invitation.token));
      setCopiedId(invitation.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, []);

  const handleRevoke = useCallback(async (invitationId: string) => {
    setRevoking(invitationId);
    const result = await revokeInvitation(invitationId);
    setRevoking(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setInvitations((prev) => (prev ?? []).filter((i) => i.id !== invitationId));
    toast.success('Invite link revoked');
  }, []);

  async function handleAddByEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    const result = await addBoardMember(boardId, { email: email.trim(), role: emailRole });
    setAdding(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${email.trim()} added to the board`);
    setEmail('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>
            Invite people with a shareable link, or add an existing user by email.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">Invite link</TabsTrigger>
            <TabsTrigger value="email">Add by email</TabsTrigger>
          </TabsList>

          {/* Invite link */}
          <TabsContent value="link" className="space-y-4 pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label>New link role</Label>
                <Select value={linkRole} onValueChange={(v) => setLinkRole(v as LinkRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EDITOR">Editor — can create and edit tasks</SelectItem>
                    <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Create link
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Active links</Label>
              {invitations === null ? (
                <p className="text-muted-foreground py-4 text-center text-sm">Loading…</p>
              ) : invitations.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No active invite links.
                </p>
              ) : (
                <ul className="space-y-2">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {invitation.role.toLowerCase()}
                      </Badge>
                      <Input
                        readOnly
                        value={joinUrl(invitation.token)}
                        className="h-8 flex-1 text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleCopy(invitation)}
                        aria-label="Copy invite link"
                      >
                        {copiedId === invitation.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8 shrink-0"
                        onClick={() => handleRevoke(invitation.id)}
                        disabled={revoking === invitation.id}
                        aria-label="Revoke invite link"
                      >
                        {revoking === invitation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* Add by email */}
          <TabsContent value="email" className="pt-2">
            <form onSubmit={handleAddByEmail} className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Instantly adds someone who already has an account.
              </p>
              <div className="space-y-2">
                <Label htmlFor="share-email">Email</Label>
                <Input
                  id="share-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={emailRole} onValueChange={(v) => setEmailRole(v as LinkRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EDITOR">Editor — can create and edit tasks</SelectItem>
                    <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? 'Adding…' : 'Add member'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
