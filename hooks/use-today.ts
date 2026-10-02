'use client';

import { useSyncExternalStore } from 'react';

import { localToday } from '@/lib/dates';

/** Notifies at the viewer's next local midnight, and whenever the tab becomes visible. */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;

  function scheduleMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      scheduleMidnight();
    }, midnight.getTime() - now.getTime());
  }

  scheduleMidnight();
  // Timers stall while a tab or laptop sleeps, so midnight can pass without one firing.
  document.addEventListener('visibilitychange', onChange);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onChange);
  };
}

function getServerSnapshot(): null {
  return null;
}

/**
 * The viewer's local calendar day (`YYYY-MM-DD`), kept current across midnight.
 *
 * `null` during server rendering and hydration: the server cannot know the viewer's time
 * zone, and using its own (UTC) day would disagree with the browser for hours every day.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, localToday, getServerSnapshot);
}
