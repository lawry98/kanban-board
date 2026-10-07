import { describe, expect, it } from 'vitest';

import { MAX_BOARD_DESCRIPTION_LENGTH, MAX_BOARD_TITLE_LENGTH } from '@/lib/constants';
import { createBoardSchema, updateBoardSchema } from '@/lib/validations/board';

// The create dialog's `maxLength` reads the same constants, so the input can't accept
// text the schema then rejects.
describe('board schema limits', () => {
  it('accepts a title at the limit and rejects one past it', () => {
    const atLimit = 'x'.repeat(MAX_BOARD_TITLE_LENGTH);
    expect(createBoardSchema.safeParse({ title: atLimit }).success).toBe(true);
    expect(createBoardSchema.safeParse({ title: `${atLimit}x` }).success).toBe(false);
  });

  it('accepts a description at the limit and rejects one past it', () => {
    const atLimit = 'x'.repeat(MAX_BOARD_DESCRIPTION_LENGTH);
    expect(createBoardSchema.safeParse({ title: 'T', description: atLimit }).success).toBe(true);
    expect(createBoardSchema.safeParse({ title: 'T', description: `${atLimit}x` }).success).toBe(
      false,
    );
    expect(updateBoardSchema.safeParse({ description: `${atLimit}x` }).success).toBe(false);
  });
});
