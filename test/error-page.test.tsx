import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException }));

import ErrorPage from '@/app/error';

describe('ErrorPage', () => {
  const error = Object.assign(new Error('board failed to load'), { digest: 'def456' });
  const retry = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The component logs the error it was handed.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleError.mockRestore();
  });

  it('reports the error to Sentry', () => {
    render(<ErrorPage error={error} retry={retry} />);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('calls retry once when "Try again" is clicked', async () => {
    const user = userEvent.setup();
    render(<ErrorPage error={error} retry={retry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('links "Go home" to the boards', () => {
    render(<ErrorPage error={error} retry={retry} />);

    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/boards');
  });
});
