/**
 * sentry.server.config.ts — Sentry initialization for the Node.js server runtime
 * (App Router Server Components, Route Handlers, Middleware running on Node).
 *
 * Uses the same DSN as the client. NEXT_PUBLIC_ prefix is required for the
 * client bundle, but the server can read it just fine.
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
