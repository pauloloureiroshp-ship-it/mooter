/**
 * sentry.server.config.ts — Sentry init for dashboard server runtime.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'mooter-dashboard@unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}
