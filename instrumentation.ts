import * as Sentry from '@sentry/nextjs';

// proxy.ts runs on the Node.js runtime in Next 16, so the server config covers it too. The edge
// config exists for any future `runtime = 'edge'` route.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

// Uncaught errors from Server Components, route handlers, thrown Server Actions and proxy.ts.
export const onRequestError = Sentry.captureRequestError;
