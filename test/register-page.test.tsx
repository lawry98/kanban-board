import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { push, refresh, signUp, toastError, toastSuccess } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signUp: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp, signInWithOAuth: vi.fn() } }),
}));

import RegisterPage from '@/app/(auth)/register/page';

async function fillAndSubmit(): Promise<void> {
  const user = userEvent.setup();
  render(<RegisterPage />);
  await user.type(screen.getByLabelText('Full name'), 'Jane Smith');
  await user.type(screen.getByLabelText('Email'), 'jane@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('RegisterPage sign-up branching', () => {
  beforeEach(() => vi.clearAllMocks());

  it('treats an empty identities array as an already-registered email', async () => {
    // Supabase obscures a duplicate email by returning a user with no identities and
    // no error — the branch that most silently breaks if that shape ever changes.
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    await fillAndSubmit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'An account with this email already exists. Try signing in instead.',
      ),
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('redirects to the destination when a session is issued (confirmations off)', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: { access_token: 'x' } },
      error: null,
    });
    await fillAndSubmit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/boards'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the confirmation panel when no session is issued (confirmations on)', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: null },
      error: null,
    });
    await fillAndSubmit();

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('surfaces a sign-up error as a toast without redirecting', async () => {
    signUp.mockResolvedValue({ data: {}, error: { message: 'Password is too weak' } });
    await fillAndSubmit();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Password is too weak'));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });
});
