import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

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
