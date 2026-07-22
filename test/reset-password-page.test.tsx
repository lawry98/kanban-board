import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted so the vi.mock factories can close over these spies.
const { push, refresh, updateUser, toastError, toastSuccess } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  updateUser: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser } }),
}));

import ResetPasswordPage from '@/app/(auth)/reset-password/page';

async function submit(password: string, confirm: string): Promise<void> {
  const user = userEvent.setup();
  render(<ResetPasswordPage />);
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: /update password/i }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a mismatch before touching Supabase', async () => {
    await submit('password123', 'password124');

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Passwords do not match'));
    expect(updateUser).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('updates the password and redirects into the app on success', async () => {
    updateUser.mockResolvedValue({ error: null });
    await submit('password123', 'password123');

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'password123' }));
    expect(push).toHaveBeenCalledWith('/boards');
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces an update error as a toast without redirecting', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Password is too weak' } });
    await submit('password123', 'password123');

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Password is too weak'));
    expect(push).not.toHaveBeenCalled();
  });
});
