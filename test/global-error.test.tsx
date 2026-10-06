import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException }));

import GlobalError from '@/app/global-error';

describe('GlobalError', () => {
  const error = Object.assign(new Error('root layout exploded'), { digest: 'abc123' });
  const retry = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The component logs the error, and React warns that <html>/<body> sit inside the
    // test container <div> (global-error must render its own document).
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleError.mockRestore();
  });

  it('reports the error to Sentry and the console', () => {
    render(<GlobalError error={error} retry={retry} />);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it('tells the user something went wrong', () => {
    render(<GlobalError error={error} retry={retry} />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });

  it('calls retry once when "Try again" is clicked', async () => {
    const user = userEvent.setup();
    render(<GlobalError error={error} retry={retry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('links "Go home" to the boards', () => {
    render(<GlobalError error={error} retry={retry} />);

    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/boards');
  });
});
