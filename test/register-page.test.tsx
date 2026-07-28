import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { push, refresh, signUp, toastError, toastSuccess, trackSignedUp, searchParams } = vi.hoisted(
  () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    signUp: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    trackSignedUp: vi.fn(),
    searchParams: { value: '' },
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp, signInWithOAuth: vi.fn() } }),
}));
// Required, not optional: without this the test imports the real `'use server'`
// module and, through it, the real Prisma client.
vi.mock('@/app/actions/analytics-actions', () => ({
  trackSignedUp: (...args: unknown[]) => {
    trackSignedUp(...args);
    return Promise.resolve({ data: true as const });
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams.value = '';
  });

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

  it('records signed_up with method=password when a session is issued', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: { access_token: 'x' } },
      error: null,
    });
    await fillAndSubmit();

    await waitFor(() =>
      expect(trackSignedUp).toHaveBeenCalledWith({ method: 'password', fromInvite: false }),
    );
  });

  it('derives fromInvite from a /join destination without recording the token', async () => {
    searchParams.value = 'next=%2Fjoin%2Fsecret-token';
    signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: { access_token: 'x' } },
      error: null,
    });
    await fillAndSubmit();

    await waitFor(() =>
      expect(trackSignedUp).toHaveBeenCalledWith({ method: 'password', fromInvite: true }),
    );
    // A boolean, never the path — the token must not reach the events table.
    expect(JSON.stringify(trackSignedUp.mock.calls)).not.toContain('secret-token');
  });

  it('records nothing when sign-up fails', async () => {
    signUp.mockResolvedValue({ data: {}, error: { message: 'Password is too weak' } });
    await fillAndSubmit();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(trackSignedUp).not.toHaveBeenCalled();
  });
});
