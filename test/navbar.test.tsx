import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { theme } = vi.hoisted(() => ({ theme: { resolvedTheme: 'dark' as string | undefined } }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: theme.resolvedTheme, setTheme: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

import { Navbar } from '@/components/layout/navbar';

const USER = { name: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: null };

describe('Navbar', () => {
  it('names the theme toggle and exposes whether dark theme is on', async () => {
    theme.resolvedTheme = 'dark';
    render(<Navbar user={USER} />);
    const toggle = screen.getByRole('button', { name: 'Dark theme' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
  });

  it('reports dark theme off in light mode', async () => {
    theme.resolvedTheme = 'light';
    render(<Navbar user={USER} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('names the account menu button', () => {
    render(<Navbar user={USER} />);
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  });
});
