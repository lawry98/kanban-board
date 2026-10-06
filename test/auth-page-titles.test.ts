import { describe, expect, it } from 'vitest';

import { metadata as authMetadata } from '@/app/(auth)/layout';
import { metadata as authCodeErrorMetadata } from '@/app/(auth)/auth-code-error/layout';
import { metadata as forgotPasswordMetadata } from '@/app/(auth)/forgot-password/layout';
import { metadata as registerMetadata } from '@/app/(auth)/register/layout';
import { metadata as resetPasswordMetadata } from '@/app/(auth)/reset-password/layout';

// A plain-string `title` in a layout resets the root `'%s | KanbanFlow'` template for every
// child segment, so the (auth) layout must re-declare the template alongside its default.
describe('(auth) page titles', () => {
  it('keeps "Sign In" as the group default and re-declares the KanbanFlow template', () => {
    expect(authMetadata.title).toEqual({ default: 'Sign In', template: '%s | KanbanFlow' });
  });

  it.each([
    ['register', registerMetadata, 'Create Account'],
    ['forgot-password', forgotPasswordMetadata, 'Forgot Password'],
    ['reset-password', resetPasswordMetadata, 'Set New Password'],
    ['auth-code-error', authCodeErrorMetadata, 'Link Expired'],
  ])('%s has its own title', (_segment, metadata, title) => {
    expect(metadata.title).toBe(title);
  });
});
