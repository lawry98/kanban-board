// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { httpHeadersToSpanAttributes } from '@sentry/nextjs';

import { redactInviteTokens, SENTRY_SHARED_OPTIONS } from '@/lib/sentry-options';
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

// Not re-exported by @sentry/nextjs; take it from the hook's own signature.
type StreamedSpanJSON = Parameters<NonNullable<typeof SENTRY_SHARED_OPTIONS.beforeSendSpan>>[0];

// Shape of a real invite token: randomBytes(24).toString('base64url').
const TOKEN = 'q5Xb-0_T9vLm2NwZ8yKcA1rD3eHfGiJ4';

describe('redactInviteTokens', () => {
  it.each([
    ['a bare path', `/join/${TOKEN}`, '/join/[token]'],
    ['a path with query and hash', `/join/${TOKEN}?ref=mail#top`, '/join/[token]?ref=mail#top'],
    ['a path with a sub-path', `/join/${TOKEN}/accept`, '/join/[token]/accept'],
    [
      'a full URL',
      `https://kanban.example.com/join/${TOKEN}`,
      'https://kanban.example.com/join/[token]',
    ],
    ['an encoded ?next= value', `/login?next=%2Fjoin%2F${TOKEN}`, '/login?next=%2Fjoin%2F[token]'],
    [
      'an encoded ?next= value followed by another parameter',
      `/auth/callback?next=%2fjoin%2f${TOKEN}&code=abc`,
      '/auth/callback?next=%2fjoin%2f[token]&code=abc',
    ],
    [
      'a double-encoded redirect target',
      `https://x.supabase.co/auth/v1/authorize?redirect_to=https%3A%2F%2Fkanban.example.com%2Fauth%2Fcallback%3Fnext%3D%252Fjoin%252F${TOKEN}`,
      'https://x.supabase.co/auth/v1/authorize?redirect_to=https%3A%2F%2Fkanban.example.com%2Fauth%2Fcallback%3Fnext%3D%252Fjoin%252F[token]',
    ],
    ['a transaction name', `GET /join/${TOKEN}`, 'GET /join/[token]'],
    [
      'every occurrence in a message',
      `navigated from /join/${TOKEN} to /register?next=%2Fjoin%2F${TOKEN}`,
      'navigated from /join/[token] to /register?next=%2Fjoin%2F[token]',
    ],
    [
      'free text, keeping the punctuation that follows',
      `failed (/join/${TOKEN}), retrying /join/${TOKEN}; done`,
      'failed (/join/[token]), retrying /join/[token]; done',
    ],
  ])('redacts the token in %s', (_label, input, expected) => {
    expect(redactInviteTokens(input)).toBe(expected);
  });

  it.each([
    '/boards',
    '/board/3f1c2a9e-7b4d-4c1e-9a6f-2d8b5e0c7a11',
    '/login?next=%2Fboards',
    '/join',
    '/rejoin/abc',
    '/joined/abc',
    'GET /join/[token]',
  ])('leaves %s unchanged', (input) => {
    expect(redactInviteTokens(input)).toBe(input);
  });
});

describe('header collection', () => {
  // The SDK's own filter, as applied to the server root span's header attributes. Error events
  // run the same allow-list through the same matcher (`shouldFilterDataKey`).
  const collect = (
    headers: Record<string, string>,
    lifecycle: 'request' | 'response' = 'request',
  ) =>
    httpHeadersToSpanAttributes(
      headers,
      SENTRY_SHARED_OPTIONS.dataCollection as Parameters<typeof httpHeadersToSpanAttributes>[1],
      lifecycle,
    );

  it('filters the router state tree, which carries the invite token without a /join/ prefix', () => {
    const tree = encodeURIComponent(
      JSON.stringify(['', { children: ['join', ['token', TOKEN, 'd']] }]),
    );
    expect(collect({ 'Next-Router-State-Tree': tree })).toEqual({
      'http.request.header.next-router-state-tree': ['[Filtered]'],
    });
  });

  it.each([
    ['referer', `https://kanban.example.com/join/${TOKEN}`],
    ['x-forwarded-for', '203.0.113.7'],
    ['x-vercel-ip-city', 'Boston'],
    ['authorization', 'Bearer abc'],
    // Headers no deny-list named: an unknown secret, a proxy IP header and Next's current-URL
    // header. Only an allow-list filters every header nobody thought of.
    ['x-custom-secret', 's3cr3t'],
    ['x-client-ip', '203.0.113.7'],
    ['next-url', `/join/${TOKEN}`],
  ])('filters the %s request header', (name, value) => {
    expect(collect({ [name]: value })).toEqual({ [`http.request.header.${name}`]: ['[Filtered]'] });
  });

  it('drops the cookie header, which carries the Supabase session', () => {
    expect(collect({ cookie: 'sb-project-auth-token=secret' })).toEqual({});
  });

  it('keeps the allowed request headers', () => {
    expect(
      collect({
        'User-Agent': 'Mozilla/5.0',
        accept: 'text/html',
        'accept-language': 'en-US',
        'content-type': 'text/plain',
        'content-length': '42',
        host: 'kanban.example.com',
      }),
    ).toEqual({
      'http.request.header.user-agent': ['Mozilla/5.0'],
      'http.request.header.accept': ['text/html'],
      'http.request.header.accept-language': ['en-US'],
      'http.request.header.content-type': ['text/plain'],
      'http.request.header.content-length': ['42'],
      'http.request.header.host': ['kanban.example.com'],
    });
  });

  it('keeps only the allowed response headers', () => {
    expect(
      collect(
        {
          'content-type': 'text/html',
          'content-length': '512',
          'cache-control': 'no-store',
          location: `/join/${TOKEN}`,
          'x-custom-secret': 's3cr3t',
          'set-cookie': 'sb-project-auth-token=secret',
        },
        'response',
      ),
    ).toEqual({
      'http.response.header.content-type': ['text/html'],
      'http.response.header.content-length': ['512'],
      'http.response.header.cache-control': ['no-store'],
      'http.response.header.location': ['[Filtered]'],
      'http.response.header.x-custom-secret': ['[Filtered]'],
    });
  });
});

describe('Sentry hooks', () => {
  it('beforeSend returns the error event with every token redacted', async () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'boom',
      transaction: `/join/${TOKEN}`,
      request: { url: `https://kanban.example.com/join/${TOKEN}`, method: 'GET' },
      contexts: { nextjs: { request_path: `/join/${TOKEN}`, route_type: 'render' } },
      breadcrumbs: [{ category: 'navigation', data: { from: `/join/${TOKEN}`, to: '/boards' } }],
    };

    const result = await SENTRY_SHARED_OPTIONS.beforeSend?.(event, {});

    expect(result).toEqual({
      type: undefined,
      message: 'boom',
      transaction: '/join/[token]',
      request: { url: 'https://kanban.example.com/join/[token]', method: 'GET' },
      contexts: { nextjs: { request_path: '/join/[token]', route_type: 'render' } },
      breadcrumbs: [{ category: 'navigation', data: { from: '/join/[token]', to: '/boards' } }],
    });
  });

  it('beforeSend passes an event without tokens through intact', async () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'boom',
      request: { url: 'https://kanban.example.com/boards' },
    };

    expect(await SENTRY_SHARED_OPTIONS.beforeSend?.(event, {})).toEqual({
      type: undefined,
      message: 'boom',
      request: { url: 'https://kanban.example.com/boards' },
    });
  });

  it('beforeSendSpan redacts the span name and its URL attributes', () => {
    const span: StreamedSpanJSON = {
      trace_id: 't',
      span_id: 's',
      name: `GET /join/${TOKEN}`,
      start_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {
        'url.full': `https://kanban.example.com/login?next=%2Fjoin%2F${TOKEN}`,
        'http.request.header.referer': `https://kanban.example.com/join/${TOKEN}`,
        'http.response.status_code': 200,
      },
    };

    expect(SENTRY_SHARED_OPTIONS.beforeSendSpan?.(span)).toEqual({
      ...span,
      name: 'GET /join/[token]',
      attributes: {
        'url.full': 'https://kanban.example.com/login?next=%2Fjoin%2F[token]',
        'http.request.header.referer': 'https://kanban.example.com/join/[token]',
        'http.response.status_code': 200,
      },
    });
  });

  it('beforeBreadcrumb returns the breadcrumb with its URL, from/to and message redacted', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      message: `POST /join/${TOKEN}`,
      data: {
        url: `/join/${TOKEN}`,
        from: `/join/${TOKEN}`,
        to: `/login?next=%2Fjoin%2F${TOKEN}`,
        status_code: 200,
      },
    };

    expect(SENTRY_SHARED_OPTIONS.beforeBreadcrumb?.(breadcrumb)).toEqual({
      category: 'fetch',
      message: 'POST /join/[token]',
      data: {
        url: '/join/[token]',
        from: '/join/[token]',
        to: '/login?next=%2Fjoin%2F[token]',
        status_code: 200,
      },
    });
  });

  it('never mutates the objects it is handed (console breadcrumbs carry live app values)', () => {
    const appValue = { href: `/join/${TOKEN}` };
    const breadcrumb: Breadcrumb = {
      category: 'console',
      data: { arguments: ['link', appValue] },
    };

    const result = SENTRY_SHARED_OPTIONS.beforeBreadcrumb?.(breadcrumb);

    expect(result?.data).toEqual({ arguments: ['link', { href: '/join/[token]' }] });
    expect(appValue).toEqual({ href: `/join/${TOKEN}` });
    expect(breadcrumb.data).toEqual({ arguments: ['link', { href: `/join/${TOKEN}` }] });
  });

  it('redacts shared and circular references instead of leaking or looping', () => {
    const shared: Record<string, unknown> = { href: `/join/${TOKEN}` };
    shared.self = shared;
    const breadcrumb: Breadcrumb = { category: 'console', data: { first: shared, second: shared } };

    const data = SENTRY_SHARED_OPTIONS.beforeBreadcrumb?.(breadcrumb)?.data;

    expect(data?.first.href).toBe('/join/[token]');
    expect(data?.second.href).toBe('/join/[token]');
    expect(data?.first.self.href).toBe('/join/[token]');
  });
});
