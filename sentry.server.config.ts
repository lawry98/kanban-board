import * as Sentry from '@sentry/nextjs';

import { serverSentryDsn } from '@/lib/env';
import { SENTRY_SHARED_OPTIONS } from '@/lib/sentry-options';

// No DSN → never call init: Sentry stays fully inert (docs: call init conditionally rather than
// relying on `enabled: false`, which still installs instrumentation).
const dsn = serverSentryDsn();
if (dsn) Sentry.init({ ...SENTRY_SHARED_OPTIONS, dsn });
