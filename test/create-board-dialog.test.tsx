import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const { createBoard } = vi.hoisted(() => ({ createBoard: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Required, not optional: without this the test imports the real `'use server'`
// module and, through it, the real Prisma client.
vi.mock('@/app/actions/board-actions', () => ({ createBoard }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/blur-fade', () => ({
  BlurFade: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// NumberTicker animates from 0 via motion + IntersectionObserver (absent in jsdom).
vi.mock('@/components/ui/number-ticker', () => ({
  NumberTicker: ({ value }: { value: number }) => <span>{value}</span>,
}));

import { BoardsClient } from '@/app/(dashboard)/boards/boards-client';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

// Only the fields BoardsClient reads; the rest is cast.
const BOARD = {
  id: 'board-1',
  title: 'Launch plan',
  description: null,
  role: 'OWNER',
  updatedAtRelative: '2 days ago',
  createdAt: EPOCH,
  updatedAt: EPOCH,
  members: [],
  _count: { columns: 3, tasks: 12 },
} as unknown as Parameters<typeof BoardsClient>[0]['boards'][number];

/** Opens the dialog the way a keyboard user does: focus the button, press Enter. */
async function openFrom(user: ReturnType<typeof userEvent.setup>, opener: HTMLElement) {
  opener.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog', { name: 'Create board' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Radix hands focus back on a `setTimeout(0)` after the dialog unmounts, hence `waitFor`.
describe('CreateBoardDialog returns focus', () => {
  it('to the header New board button on Escape', async () => {
    const user = userEvent.setup();
    render(<BoardsClient boards={[BOARD]} />);
    const [headerButton] = screen.getAllByRole('button', { name: 'New board' });

    await openFrom(user, headerButton);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(headerButton).toHaveFocus());
  });

  it('to the New board card on Cancel', async () => {
    const user = userEvent.setup();
    render(<BoardsClient boards={[BOARD]} />);
    const [, card] = screen.getAllByRole('button', { name: 'New board' });

    await openFrom(user, card);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(card).toHaveFocus());
  });

  it('to Create your first board on Escape', async () => {
    const user = userEvent.setup();
    render(<BoardsClient boards={[]} />);
    const opener = screen.getByRole('button', { name: 'Create your first board' });

    await openFrom(user, opener);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
