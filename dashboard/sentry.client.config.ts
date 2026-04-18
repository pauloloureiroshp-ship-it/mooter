/**
 * sentry.client.config.ts — Sentry init for the dashboard browser bundle.
 *
 * The dashboard is local-only (127.0.0.1:7820), so reports coming from here
 * are almost always developer workstations. Init is still conditional on
 * NEXT_PUBLIC_SENTRY_DSN so the default install ships no telemetry.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'mooter-dashboard@unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
