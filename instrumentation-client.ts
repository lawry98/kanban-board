import * as Sentry from '@sentry/nextjs';

import { env } from '@/lib/env';
import { SENTRY_SHARED_OPTIONS } from '@/lib/sentry-options';

// No DSN → never call init: the browser SDK stays inert. The DSN is inlined at build time.
if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ ...SENTRY_SHARED_OPTIONS, dsn: env.NEXT_PUBLIC_SENTRY_DSN });
}

// Instruments App Router navigations. A no-op until init has created a client; exported anyway
// because the build warns when it is missing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
