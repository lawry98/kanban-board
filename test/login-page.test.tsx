import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted so the vi.mock factories (themselves hoisted to the top of the file) can
// close over these spies without a "used before initialization" error.
const { push, refresh, signInWithPassword, signInWithOAuth, toastError, searchParams } = vi.hoisted(
  () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    toastError: vi.fn(),
    searchParams: { value: '' },
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword, signInWithOAuth } }),
}));

import LoginPage from '@/app/(auth)/login/page';

async function signIn(): Promise<void> {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText('Email'), 'jane@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

describe('LoginPage return-to-original-page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams.value = '';
    signInWithPassword.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
  });

  it('pushes to the next destination after a password login', async () => {
    searchParams.value = 'next=%2Fboard%2Fabc';
    await signIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/board/abc'));
    expect(refresh).toHaveBeenCalled();
  });

  it('pushes to /boards when next is an open-redirect payload', async () => {
    searchParams.value = 'next=%2F%09%2Fevil.com';
    await signIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/boards'));
  });

  it('carries the destination through the GitHub round-trip', async () => {
    searchParams.value = 'next=%2Fboard%2Fabc';
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /continue with github/i }));

    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const { provider, options } = signInWithOAuth.mock.calls[0][0];
    expect(provider).toBe('github');
    expect(options.redirectTo.endsWith('/auth/callback?next=%2Fboard%2Fabc')).toBe(true);
  });

  it('passes next on to the sign-up link only when the URL had one', () => {
    searchParams.value = 'next=%2Fboard%2Fabc';
    const { unmount } = render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/register?next=%2Fboard%2Fabc',
    );
    unmount();

    searchParams.value = '';
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register');
  });
});
