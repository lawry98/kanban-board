import { describe, expect, it } from 'vitest';

import { createTaskSchema, updateTaskSchema } from '@/lib/validations/task';

const COLUMN_ID = '11111111-1111-4111-8111-111111111111';

describe('task dueDate validation', () => {
  it('accepts a calendar date, which is what <input type="date"> emits', () => {
    expect(updateTaskSchema.parse({ dueDate: '2026-10-02' }).dueDate).toBe('2026-10-02');
    expect(
      createTaskSchema.parse({ columnId: COLUMN_ID, title: 'Ship', dueDate: '2028-02-29' }).dueDate,
    ).toBe('2028-02-29');
  });

  it('accepts null on update, which clears the due date', () => {
    expect(updateTaskSchema.parse({ dueDate: null }).dueDate).toBeNull();
  });

  it('rejects a datetime — an instant lands on a different day in other time zones', () => {
    expect(() => updateTaskSchema.parse({ dueDate: '2026-10-02T23:00:00-04:00' })).toThrow();
    expect(() =>
      createTaskSchema.parse({
        columnId: COLUMN_ID,
        title: 'Ship',
        dueDate: '2026-10-02T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects impossible and malformed dates instead of rolling them over', () => {
    expect(() => updateTaskSchema.parse({ dueDate: '2026-02-30' })).toThrow();
    expect(() => updateTaskSchema.parse({ dueDate: '2026-02-29' })).toThrow();
    expect(() => updateTaskSchema.parse({ dueDate: '10/02/2026' })).toThrow();
  });
});
