import { afterEach, beforeEach } from 'vitest';

/**
 * Behind UTC (a UTC-midnight instant is still the previous evening locally), ahead of UTC
 * (it is already 09:00 locally), and UTC itself (where instant-vs-day bugs hide).
 */
export const TIME_ZONES = ['America/New_York', 'Asia/Tokyo', 'UTC'] as const;

/**
 * Runs each test in the current suite with `process.env.TZ` set to `timeZone`. Node applies
 * a runtime TZ change to `Date` and `Intl` immediately, so date tests stay deterministic on
 * any machine — and fail on a UTC CI runner too, where these bugs would otherwise be invisible.
 */
export function pinTimeZone(timeZone: string): void {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.TZ;
    process.env.TZ = timeZone;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}
