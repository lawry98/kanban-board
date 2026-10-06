'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

const subscribe = () => () => {};

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

interface ThemeToggleProps {
  className?: string;
}

/**
 * The generated toggler's only name is a static "Toggle theme"; screen readers also need
 * its state. The theme is unknown until hydration, so `aria-pressed` waits for mount.
 * Its circular reveal is skipped (duration 0) for users who prefer reduced motion.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const reduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  return (
    <AnimatedThemeToggler
      className={className}
      duration={reduceMotion ? 0 : undefined}
      aria-label="Dark theme"
      aria-pressed={mounted ? resolvedTheme === 'dark' : undefined}
    />
  );
}
