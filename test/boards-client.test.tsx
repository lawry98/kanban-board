import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/components/ui/blur-fade', () => ({
  BlurFade: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// NumberTicker animates from 0 via motion + IntersectionObserver (absent in jsdom).
vi.mock('@/components/ui/number-ticker', () => ({
  NumberTicker: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock('@/components/board/create-board-dialog', () => ({ CreateBoardDialog: () => null }));

import { BoardsClient } from '@/app/(dashboard)/boards/boards-client';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

// Only the fields BoardsClient reads; the rest is cast.
const BOARD = {
  id: 'board-1',
  title: 'Launch plan',
  description: 'Q4 launch',
  role: 'OWNER',
  updatedAtRelative: '2 days ago',
  createdAt: EPOCH,
  updatedAt: EPOCH,
  members: [
    { id: 'm1', profile: { fullName: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: null } },
  ],
  _count: { columns: 3, tasks: 12 },
} as unknown as Parameters<typeof BoardsClient>[0]['boards'][number];

describe('BoardsClient', () => {
  it('names each board link by its title and describes it', () => {
    render(<BoardsClient boards={[BOARD]} />);
    const link = screen.getByRole('link', { name: 'Launch plan' });
    expect(link).toHaveAttribute('href', '/board/board-1');
    expect(link).toHaveAccessibleDescription(/Q4 launch/);
    expect(link).toHaveAccessibleDescription(/owner/i);
    expect(link).toHaveAccessibleDescription(/12 tasks/);
    expect(link).toHaveAccessibleDescription(/updated 2 days ago/i);
  });
});
