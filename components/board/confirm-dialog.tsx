'use client';

import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Node, not just string, so callers can emphasise the entity name in the copy. */
  description: React.ReactNode;
  /** Confirm button label at rest, e.g. "Delete board". */
  confirmLabel: string;
  /** Confirm button label while `onConfirm` is in flight. */
  pendingLabel?: string;
  /** Awaited before the dialog closes, so a slow action stays visible as pending. */
  onConfirm: () => void | Promise<void>;
}

/**
 * The shared confirm-then-execute dialog for destructive actions (delete board /
 * column / task). Radix's AlertDialogAction closes synchronously on click, so it
 * gives no feedback while an async handler runs; this keeps the dialog open and the
 * button disabled until `onConfirm` resolves, then closes. Callers own the `open`
 * state (the trigger usually lives inside a dropdown) and handle their own
 * success/error toasts inside `onConfirm`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel = 'Working…',
  onConfirm,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    event.preventDefault(); // keep the dialog open until the action settles
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
