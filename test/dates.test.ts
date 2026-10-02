import { describe, expect, it } from 'vitest';

import {
  formatCalendarDate,
  formatDueDate,
  isOverdue,
  localToday,
  parseCalendarDate,
} from '@/lib/dates';

import { TIME_ZONES, pinTimeZone } from './time-zone';

/** What Prisma returns for a `@db.Date` column (and for the legacy UTC-midnight timestamps). */
const DUE_OCT_2 = new Date('2026-10-02T00:00:00.000Z');

describe.each(TIME_ZONES)('due-date helpers in %s', (timeZone) => {
  pinTimeZone(timeZone);

  describe('parseCalendarDate', () => {
    it('stores a picked day as UTC midnight of that same day', () => {
      expect(parseCalendarDate('2026-10-02').toISOString()).toBe('2026-10-02T00:00:00.000Z');
    });

    it('rejects anything that is not a real calendar date', () => {
      expect(() => parseCalendarDate('2026-02-30')).toThrow(RangeError);
      expect(() => parseCalendarDate('2026-10-02T12:00:00Z')).toThrow(RangeError);
      expect(() => parseCalendarDate('garbage')).toThrow(RangeError);
    });
  });

  describe('formatCalendarDate', () => {
    it('reads a stored due date back as the day that was picked', () => {
      expect(formatCalendarDate(DUE_OCT_2)).toBe('2026-10-02');
    });

    it('does not drift across repeated save round-trips', () => {
      let value = '2026-10-02';
      for (let save = 0; save < 3; save++) value = formatCalendarDate(parseCalendarDate(value));
      expect(value).toBe('2026-10-02');
    });
  });

  describe('localToday', () => {
    it("is the viewer's local calendar day, late in the evening and early in the morning", () => {
      // Late evening is already tomorrow in UTC behind it; early morning is still yesterday
      // in UTC ahead of it — so a UTC getter fails in New York or Tokyo respectively.
      expect(localToday(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
      expect(localToday(new Date(2026, 9, 2, 0, 1))).toBe('2026-10-02');
    });
  });

  describe('isOverdue', () => {
    it('is not overdue before or on its due day', () => {
      expect(isOverdue(DUE_OCT_2, '2026-10-01')).toBe(false);
      expect(isOverdue(DUE_OCT_2, '2026-10-02')).toBe(false);
    });

    it('is overdue from the next day, across month and year boundaries', () => {
      expect(isOverdue(DUE_OCT_2, '2026-10-03')).toBe(true);
      expect(isOverdue(new Date('2026-12-31T00:00:00.000Z'), '2027-01-01')).toBe(true);
    });
  });

  describe('formatDueDate', () => {
    it('shows the picked day, without the year when it is this year', () => {
      expect(formatDueDate(DUE_OCT_2, '2026-09-20')).toBe('Oct 2');
    });

    it('adds the year when the due date is in a different year', () => {
      expect(formatDueDate(new Date('2027-01-05T00:00:00.000Z'), '2026-12-30')).toBe('Jan 5, 2027');
    });

    it("omits the year while the viewer's day is still unknown", () => {
      expect(formatDueDate(new Date('2027-01-05T00:00:00.000Z'), null)).toBe('Jan 5');
    });
  });
});
