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
