import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from '@/components/board/confirm-dialog';

function renderDialog(overrides: {
  onConfirm: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
}) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this board?"
      description="This cannot be undone."
      confirmLabel="Delete board"
      pendingLabel="Deleting…"
      onConfirm={overrides.onConfirm}
    />,
  );
  return { onOpenChange };
}

describe('ConfirmDialog', () => {
  it('runs the action only when confirmed, then closes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { onOpenChange } = renderDialog({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'Delete board' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cancelling closes without running the action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { onOpenChange } = renderDialog({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and disabled while the action is in flight', async () => {
    const user = userEvent.setup();
    // A deferred promise lets us observe the pending window between click and resolve.
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (resolveConfirm = resolve)));
    const { onOpenChange } = renderDialog({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'Delete board' }));

    // Pending: label flips, button disabled, dialog NOT yet closed.
    const pendingButton = await screen.findByRole('button', { name: 'Deleting…' });
    expect(pendingButton).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveConfirm();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
