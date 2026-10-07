import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { updateSession } from '@/lib/supabase/middleware';

describe('updateSession', () => {
  it('forwards the supplied request headers to the downstream render', async () => {
    const request = new NextRequest('https://app.example.com/boards');
    const headers = new Headers(request.headers);
    headers.set('x-nonce', 'n1');

    const { response } = await updateSession(request, headers);

    // Next encodes request-header overrides as these internal response headers.
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe('n1');
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-nonce');
  });

  it('forwards the original request headers when none are supplied', async () => {
    const request = new NextRequest('https://app.example.com/boards', {
      headers: { 'x-custom': 'v' },
    });

    const { response } = await updateSession(request);

    expect(response.headers.get('x-middleware-request-x-custom')).toBe('v');
  });
});
