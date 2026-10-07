import { describe, expect, it } from 'vitest';

import { CSP_HEADER, CSP_REPORT_ONLY, buildContentSecurityPolicy, generateNonce } from '@/lib/csp';

const SUPABASE = 'https://abcd.supabase.co';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  const prod = directives(
    buildContentSecurityPolicy({
      nonce: 'abc123',
      supabaseUrl: SUPABASE,
      isDev: false,
      reportOnly: false,
    }),
  );
  const prodReportOnly = directives(
    buildContentSecurityPolicy({
      nonce: 'abc123',
      supabaseUrl: SUPABASE,
      isDev: false,
      reportOnly: true,
    }),
  );
  const dev = directives(
    buildContentSecurityPolicy({
      nonce: 'abc123',
      supabaseUrl: SUPABASE,
      isDev: true,
      reportOnly: false,
    }),
  );

  it('allows scripts only by nonce + strict-dynamic in production', () => {
    expect(prod.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });
  it("adds 'unsafe-eval' only in development", () => {
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(prod.get('script-src')).not.toContain("'unsafe-eval'");
  });
  it('never allows inline scripts', () => {
    expect(prod.get('script-src')).not.toContain("'unsafe-inline'");
  });
  it('allows Supabase over https and wss', () => {
    expect(prod.get('connect-src')).toEqual(["'self'", SUPABASE, 'wss://abcd.supabase.co']);
  });
  it('locks down framing, plugins, base and form targets', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('form-action')).toEqual(["'self'"]);
  });
  it('upgrades insecure requests only in an enforced production policy', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(true);
    // Browsers ignore the directive in a report-only policy and log a console warning.
    expect(prodReportOnly.has('upgrade-insecure-requests')).toBe(false);
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
  });
  it('keeps every other directive identical when report-only', () => {
    const enforced = Object.fromEntries(prod);
    delete enforced['upgrade-insecure-requests'];
    expect(Object.fromEntries(prodReportOnly)).toEqual(enforced);
  });
  it('maps a local http Supabase to ws', () => {
    const local = directives(
      buildContentSecurityPolicy({
        nonce: 'n',
        supabaseUrl: 'http://127.0.0.1:54321',
        isDev: true,
        reportOnly: false,
      }),
    );
    expect(local.get('connect-src')).toEqual([
      "'self'",
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]);
  });
});

describe('buildContentSecurityPolicy with a Sentry DSN', () => {
  // A real-shaped DSN: `<public key>@<ingest host>/<project id>`. Only its origin may reach
  // `connect-src`; the key and project id appear only in the `report-uri` endpoint.
  const DSN = 'https://0123456789abcdef@o123.ingest.us.sentry.io/456';
  const SENTRY = 'https://o123.ingest.us.sentry.io';
  const BASE_CONNECT = ["'self'", SUPABASE, 'wss://abcd.supabase.co'];

  function policyFor(sentryDsn?: string): string {
    return buildContentSecurityPolicy({
      nonce: 'abc123',
      supabaseUrl: SUPABASE,
      isDev: false,
      reportOnly: false,
      sentryDsn,
    });
  }

  it('leaves connect-src unchanged without a DSN', () => {
    expect(directives(policyFor(undefined)).get('connect-src')).toEqual(BASE_CONNECT);
    expect(policyFor(undefined)).toBe(
      buildContentSecurityPolicy({
        nonce: 'abc123',
        supabaseUrl: SUPABASE,
        isDev: false,
        reportOnly: false,
      }),
    );
  });
  it('appends the DSN origin to connect-src', () => {
    expect(directives(policyFor(DSN)).get('connect-src')).toEqual([...BASE_CONNECT, SENTRY]);
  });
  it('leaks no key, userinfo or path from the DSN into connect-src', () => {
    const connect = directives(policyFor(DSN)).get('connect-src')!.join(' ');
    expect(connect).not.toContain('0123456789abcdef');
    expect(connect).not.toContain('@');
    expect(connect).not.toContain('/456');
    expect(policyFor(DSN)).not.toContain('@');
  });
  it('touches no directive other than connect-src and report-uri', () => {
    const withDsn = Object.fromEntries(directives(policyFor(DSN)));
    const without = Object.fromEntries(directives(policyFor(undefined)));
    delete withDsn['connect-src'];
    delete withDsn['report-uri'];
    delete without['connect-src'];
    expect(withDsn).toEqual(without);
  });
  it('keeps a self-hosted origin with a port', () => {
    const policy = directives(policyFor('http://key@sentry.internal:9000/2'));
    expect(policy.get('connect-src')).toEqual([...BASE_CONNECT, 'http://sentry.internal:9000']);
    expect(policy.get('report-uri')).toEqual([
      'http://sentry.internal:9000/api/2/security/?sentry_key=key',
    ]);
  });
  // `new URL(...).origin` is the string "null" for non-hierarchical schemes and passes
  // `;` through, so a parse alone is not enough to keep junk out of the header.
  it.each([
    ['not-a-url', 'garbage'],
    ['', 'an empty string'],
    ['javascript:alert(1)', 'a non-http scheme'],
    ['data:text/plain,hi', 'a data URL'],
    ['https://a.com;script-src-elem', 'a host that would smuggle a directive'],
  ])('ignores %j (%s) without throwing', (dsn) => {
    expect(() => policyFor(dsn)).not.toThrow();
    expect(directives(policyFor(dsn)).get('connect-src')).toEqual(BASE_CONNECT);
    expect(policyFor(dsn)).toBe(policyFor(undefined));
  });
});

describe('buildContentSecurityPolicy report-uri', () => {
  const DSN = 'https://0123456789abcdef@o123.ingest.us.sentry.io/456';

  function reportUri(sentryDsn?: string, reportOnly = true): string[] | undefined {
    return directives(
      buildContentSecurityPolicy({
        nonce: 'abc123',
        supabaseUrl: SUPABASE,
        isDev: false,
        reportOnly,
        sentryDsn,
      }),
    ).get('report-uri');
  }

  it('points violations at the Sentry security endpoint of a valid DSN', () => {
    expect(reportUri(DSN)).toEqual([
      'https://o123.ingest.us.sentry.io/api/456/security/?sentry_key=0123456789abcdef',
    ]);
  });
  it('reports in an enforced policy too', () => {
    expect(reportUri(DSN, false)).toEqual([
      'https://o123.ingest.us.sentry.io/api/456/security/?sentry_key=0123456789abcdef',
    ]);
  });
  it('keeps a path prefix before the project id (self-hosted behind a sub-path)', () => {
    expect(reportUri('https://abc123@sentry.example.com/errors/sentry/7')).toEqual([
      'https://sentry.example.com/errors/sentry/api/7/security/?sentry_key=abc123',
    ]);
  });
  it('ignores a legacy secret in the DSN', () => {
    expect(reportUri('https://abc123:s3cret@sentry.example.com/7')).toEqual([
      'https://sentry.example.com/api/7/security/?sentry_key=abc123',
    ]);
  });
  it('is absent without a DSN', () => {
    expect(reportUri(undefined)).toBeUndefined();
    expect(reportUri('')).toBeUndefined();
  });
  it.each([
    ['not-a-url', 'garbage'],
    ['javascript:alert(1)', 'a non-http scheme'],
    ['https://a.com;script-src-elem', 'a host that would smuggle a directive'],
    ['https://o123.ingest.us.sentry.io/456', 'no public key'],
    ['https://@o123.ingest.us.sentry.io/456', 'an empty public key'],
    ['https://key;script-src@o123.ingest.us.sentry.io/456', 'a key with a directive separator'],
    ['https://key,x@o123.ingest.us.sentry.io/456', 'a key with a comma'],
    ['https://ke%20y@o123.ingest.us.sentry.io/456', 'a percent-encoded key'],
    ['https://key@o123.ingest.us.sentry.io/', 'no project id'],
    ['https://key@o123.ingest.us.sentry.io', 'no path at all'],
    ['https://key@o123.ingest.us.sentry.io/abc', 'a non-numeric project id'],
    ['https://key@o123.ingest.us.sentry.io/4;5', 'a project id with a separator'],
    ['https://key@o123.ingest.us.sentry.io/4%205', 'a project id with encoded whitespace'],
    ['https://key@o123.ingest.us.sentry.io/a;b/456', 'a path prefix with a separator'],
    ['https://key@o123.ingest.us.sentry.io/a,b/456', 'a path prefix with a comma'],
    ['https://key@o123.ingest.us.sentry.io/a%20b/456', 'a path prefix with encoded whitespace'],
  ])('omits report-uri for %j (%s) without throwing', (dsn) => {
    expect(() => reportUri(dsn)).not.toThrow();
    expect(reportUri(dsn)).toBeUndefined();
  });
  it('never lets a value break out of the header', () => {
    for (const value of reportUri(DSN) ?? []) expect(value).not.toMatch(/[;,\s]/);
  });
});

describe('CSP_HEADER', () => {
  it('names the header that matches the report-only switch', () => {
    expect(CSP_HEADER).toBe(
      CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    );
  });
});

describe('generateNonce', () => {
  it('returns a fresh base64 value each call', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(generateNonce()).not.toBe(a);
  });
});
