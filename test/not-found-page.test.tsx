import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import BoardNotFound from '@/app/(dashboard)/board/[boardId]/not-found';
import NotFound, { metadata } from '@/app/not-found';

describe('NotFound', () => {
  it('tells the user the page does not exist', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('offers a way back to the boards', () => {
    render(<NotFound />);

    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/boards');
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('Page Not Found');
  });
});

describe('BoardNotFound', () => {
  it('fills the dynamic viewport below the navbar', () => {
    const { container } = render(<BoardNotFound />);

    // `vh` is the largest viewport on mobile, so the message sat off-centre behind the bars.
    expect(container.firstElementChild).toHaveClass('h-[calc(100dvh-56px)]');
  });
});
