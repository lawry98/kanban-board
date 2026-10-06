import { cn } from '@/lib/utils';

import type { RealtimeStatus } from '@/hooks/use-realtime';

const LABELS: Record<RealtimeStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
};

interface ConnectionIndicatorProps {
  status: RealtimeStatus;
  className?: string;
}

/** Subtle live-updates signal. role="status" announces changes politely. */
export function ConnectionIndicator({ status, className }: ConnectionIndicatorProps) {
  return (
    <span
      role="status"
      data-status={status}
      className={cn('text-muted-foreground inline-flex items-center gap-1.5 text-xs', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          status === 'live' && 'bg-emerald-500',
          status === 'connecting' && 'bg-muted-foreground/40',
          // Pulse only for users who haven't asked for reduced motion.
          status === 'reconnecting' && 'bg-amber-500 motion-safe:animate-pulse',
        )}
      />
      {LABELS[status]}
    </span>
  );
}
