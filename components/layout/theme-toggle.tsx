'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

const subscribe = () => () => {};

interface ThemeToggleProps {
  className?: string;
}

/**
 * The generated toggler's only name is a static "Toggle theme"; screen readers also need
 * its state. The theme is unknown until hydration, so `aria-pressed` waits for mount.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <AnimatedThemeToggler
      className={className}
      aria-label="Dark theme"
      aria-pressed={mounted ? resolvedTheme === 'dark' : undefined}
    />
  );
}
