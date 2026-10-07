import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const { Toaster } = vi.hoisted(() => ({ Toaster: vi.fn((_props: object) => null) }));

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'font-geist-sans' }),
  Geist_Mono: () => ({ variable: 'font-geist-mono' }),
}));
// The layout reads the request's CSP nonce; there is no request in a unit test.
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The real provider reads `window.matchMedia`, which jsdom lacks.
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster }));

import RootLayout from '@/app/layout';

describe('RootLayout', () => {
  it('renders toasts in the theme colours, not sonner rich colours', async () => {
    // Async server component: await it, then render the tree it returns.
    renderToStaticMarkup(await RootLayout({ children: null }));

    // Rich colours' light-mode text is 4.35:1 (error) and 4.26:1 (success), under AA's 4.5:1.
    expect(Toaster).toHaveBeenCalledTimes(1);
    expect(Toaster.mock.calls[0]?.[0]).not.toHaveProperty('richColors');
  });
});
