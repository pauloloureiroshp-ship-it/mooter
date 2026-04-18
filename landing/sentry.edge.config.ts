/**
 * sentry.edge.config.ts — Sentry initialization for the Edge runtime
 * (middleware.ts + any Edge Route Handlers).
 *
 * Edge runs in a restricted V8 isolate — only a subset of the Node SDK is
 * available. @sentry/nextjs ships the correct bundle automatically.
 *
 * Init is conditional — absent DSN means no-op (see client config rationale).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'mooter-landing@unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}
