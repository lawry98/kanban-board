import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionIndicator } from '@/components/board/connection-indicator';

import type { RealtimeStatus } from '@/hooks/use-realtime';

/** The decorative dot is the only aria-hidden child of the status element. */
function dot(): HTMLElement {
  const element = screen.getByRole('status').querySelector<HTMLElement>('[aria-hidden="true"]');
  if (!element) throw new Error('indicator has no dot');
  return element;
}

describe('ConnectionIndicator', () => {
  it.each([
    ['live', 'Live'],
    ['reconnecting', 'Reconnecting…'],
    ['connecting', 'Connecting…'],
  ] as const satisfies readonly (readonly [RealtimeStatus, string])[])(
    'announces "%s" as a status with the text %s',
    (status, label) => {
      render(<ConnectionIndicator status={status} />);

      expect(screen.getByRole('status')).toHaveTextContent(label);
      expect(screen.getByRole('status')).toHaveAttribute('data-status', status);
    },
  );

  it('colours the dot per status', () => {
    const { rerender } = render(<ConnectionIndicator status="live" />);
    expect(dot()).toHaveClass('bg-emerald-500');

    rerender(<ConnectionIndicator status="reconnecting" />);
    expect(dot()).toHaveClass('bg-amber-500');

    rerender(<ConnectionIndicator status="connecting" />);
    expect(dot()).toHaveClass('bg-muted-foreground/40');
  });

  it('pulses the reconnecting dot only for users who have not asked for reduced motion', () => {
    render(<ConnectionIndicator status="reconnecting" />);

    expect(dot()).toHaveClass('motion-safe:animate-pulse');
    // A bare `animate-pulse` would ignore prefers-reduced-motion.
    expect(dot()).not.toHaveClass('animate-pulse');
  });

  it.each(['live', 'connecting'] as const)('does not animate the dot when %s', (status) => {
    render(<ConnectionIndicator status={status} />);

    expect(dot().className).not.toMatch(/animate-/);
  });

  it('keeps the dot out of the accessibility tree and merges a caller class', () => {
    render(<ConnectionIndicator status="live" className="ml-2" />);

    expect(screen.getByRole('status')).toHaveClass('ml-2', 'text-xs');
    expect(dot()).toHaveAttribute('aria-hidden', 'true');
  });
});
