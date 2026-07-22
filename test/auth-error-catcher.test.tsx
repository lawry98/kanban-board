import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const replace = vi.fn();
let pathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
}));

import { AuthErrorCatcher } from '@/components/auth/auth-error-catcher';

// Set the browser URL the catcher inspects. jsdom exposes search/hash off
// window.location after a history replace.
function setUrl(path: string): void {
  window.history.replaceState(null, '', path);
}

describe('AuthErrorCatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    pathname = '/';
    setUrl('/');
  });

  it('does nothing on a clean URL', () => {
    render(<AuthErrorCatcher />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('forwards a query error_code to the error page', () => {
    setUrl('/?error_code=otp_expired');
    render(<AuthErrorCatcher />);
    expect(replace).toHaveBeenCalledWith('/auth-code-error?error_code=otp_expired');
  });

  it('reads error_code and error from the URL hash (unreadable server-side)', () => {
    setUrl('/#error=access_denied&error_code=otp_expired');
    render(<AuthErrorCatcher />);
    expect(replace).toHaveBeenCalledWith(
      '/auth-code-error?error_code=otp_expired&error=access_denied',
    );
  });

  it("ignores the app's own ?error= param so it never hijacks it", () => {
    pathname = '/login';
    setUrl('/login?error=auth_callback_failed');
    render(<AuthErrorCatcher />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not fire on the error route itself (prevents a replace loop)', () => {
    pathname = '/auth-code-error';
    setUrl('/auth-code-error?error_code=otp_expired');
    render(<AuthErrorCatcher />);
    expect(replace).not.toHaveBeenCalled();
  });
});
