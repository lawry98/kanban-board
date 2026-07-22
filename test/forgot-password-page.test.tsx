import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { resetPasswordForEmail, toastError } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';

async function submit(): Promise<void> {
  const user = userEvent.setup();
  render(<ForgotPasswordPage />);
  await user.type(screen.getByLabelText('Email'), 'jane@example.com');
  await user.click(screen.getByRole('button', { name: /send reset link/i }));
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the "check your email" panel on success', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    await submit();

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('surfaces a failure as a toast and stays on the form', async () => {
    // Supabase does not reveal whether an address exists, so a returned error is a
    // genuine failure (rate limit, transport) worth showing.
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests' } });
    await submit();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Too many requests'));
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });
});
