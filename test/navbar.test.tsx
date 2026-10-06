import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import type * as Toggler from '@/components/ui/animated-theme-toggler';

type TogglerProps = ComponentProps<typeof Toggler.AnimatedThemeToggler>;

const { theme } = vi.hoisted(() => ({ theme: { resolvedTheme: 'dark' as string | undefined } }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: theme.resolvedTheme, setTheme: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

// The real toggler, recording the props the wrapper hands it.
const toggler = vi.hoisted(() => ({ props: null as TogglerProps | null }));
vi.mock('@/components/ui/animated-theme-toggler', async (importOriginal) => {
  const actual = await importOriginal<typeof Toggler>();
  return {
    AnimatedThemeToggler: (props: TogglerProps) => {
      toggler.props = props;
      return <actual.AnimatedThemeToggler {...props} />;
    },
  };
});

// jsdom has no matchMedia; this one answers only the reduced-motion query.
const motion = vi.hoisted(() => ({ reduce: false }));
beforeEach(() => {
  toggler.props = null;
  motion.reduce = false;
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && motion.reduce,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

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

  it('names the logo link by the product name alone', () => {
    render(<Navbar user={USER} />);
    expect(screen.getByRole('link', { name: 'KanbanFlow' })).toHaveAttribute('href', '/boards');
  });

  it('skips the theme transition when the user prefers reduced motion', () => {
    motion.reduce = true;
    render(<Navbar user={USER} />);
    expect(toggler.props?.duration).toBe(0);
  });

  it('keeps the default theme transition otherwise', () => {
    render(<Navbar user={USER} />);
    expect(toggler.props).not.toBeNull();
    expect(toggler.props?.duration).toBeUndefined();
  });

  it('names the account menu button', () => {
    render(<Navbar user={USER} />);
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  });
});
