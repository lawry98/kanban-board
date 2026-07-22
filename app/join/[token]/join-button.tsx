'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { acceptInvitation } from '@/app/actions/invitation-actions';

interface JoinButtonProps {
  token: string;
}

/**
 * Explicit consent step — acceptance never happens on GET, so link prefetch can't
 * auto-join. On success we client-navigate to the board (the action is idempotent,
 * so a double click is harmless).
 */
export function JoinButton({ token }: JoinButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  function handleJoin() {
    setSubmitting(true);
    void acceptInvitation(token).then((result) => {
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Failed to join board');
        setSubmitting(false);
        return;
      }
      // Keep the button disabled through the navigation.
      startTransition(() => {
        router.push(`/board/${result.data.boardId}`);
        router.refresh();
      });
    });
  }

  const busy = submitting || isPending;

  return (
    <Button className="w-full" onClick={handleJoin} disabled={busy}>
      {busy ? 'Joining…' : 'Join board'}
    </Button>
  );
}
