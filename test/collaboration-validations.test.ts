import { describe, expect, it } from 'vitest';

import { sanitizeNext } from '@/lib/auth/redirects';
import { changeMemberRoleSchema } from '@/lib/validations/board';
import { createInvitationSchema } from '@/lib/validations/invitation';

describe('createInvitationSchema', () => {
  it('accepts EDITOR and VIEWER', () => {
    expect(createInvitationSchema.parse({ role: 'EDITOR' }).role).toBe('EDITOR');
    expect(createInvitationSchema.parse({ role: 'VIEWER' }).role).toBe('VIEWER');
  });

  it('rejects OWNER — a link can never grant ownership', () => {
    expect(() => createInvitationSchema.parse({ role: 'OWNER' })).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() => createInvitationSchema.parse({ role: 'ADMIN' })).toThrow();
    expect(() => createInvitationSchema.parse({})).toThrow();
  });

  it('normalises and validates an optional email but leaves it absent when omitted', () => {
    expect(createInvitationSchema.parse({ role: 'EDITOR' }).email).toBeUndefined();
    expect(createInvitationSchema.parse({ role: 'EDITOR', email: 'Foo@Example.COM' }).email).toBe(
      'foo@example.com',
    );
    expect(() => createInvitationSchema.parse({ role: 'EDITOR', email: 'not-an-email' })).toThrow();
  });
});

describe('changeMemberRoleSchema', () => {
  it('accepts EDITOR and VIEWER', () => {
    expect(changeMemberRoleSchema.parse({ role: 'EDITOR' }).role).toBe('EDITOR');
    expect(changeMemberRoleSchema.parse({ role: 'VIEWER' }).role).toBe('VIEWER');
  });

  it('rejects OWNER — ownership is not assignable here', () => {
    expect(() => changeMemberRoleSchema.parse({ role: 'OWNER' })).toThrow();
  });

  it('rejects invalid input', () => {
    expect(() => changeMemberRoleSchema.parse({ role: 'nope' })).toThrow();
    expect(() => changeMemberRoleSchema.parse({})).toThrow();
  });
});

describe('sanitizeNext', () => {
  it('defaults to /boards when absent or empty', () => {
    expect(sanitizeNext(null)).toBe('/boards');
    expect(sanitizeNext(undefined)).toBe('/boards');
    expect(sanitizeNext('')).toBe('/boards');
  });

  it('rejects protocol-relative and backslash open-redirect forms', () => {
    expect(sanitizeNext('//evil.com')).toBe('/boards');
    expect(sanitizeNext('/\\evil.com')).toBe('/boards');
  });

  it('rejects absolute URLs and non-slash targets', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/boards');
    expect(sanitizeNext('http://evil.com')).toBe('/boards');
    expect(sanitizeNext('@evil.com')).toBe('/boards');
    expect(sanitizeNext('evil.com')).toBe('/boards');
  });

  it('preserves same-origin relative paths', () => {
    expect(sanitizeNext('/boards')).toBe('/boards');
    expect(sanitizeNext('/join/abc123')).toBe('/join/abc123');
    expect(sanitizeNext('/board/xyz?tab=1')).toBe('/board/xyz?tab=1');
  });
});
