/**
 * sentry.client.config.ts — Sentry initialization for the browser bundle.
 *
 * Init is conditional on NEXT_PUBLIC_SENTRY_DSN being present. When the env
 * var is absent (local dev without observability, preview deploys) the SDK
 * is a no-op — no network calls, no console noise.
 *
 * Sampling:
 *   - tracesSampleRate 0.1 in prod, 1.0 in dev (spec: Sprint 8.1 criterion)
 *   - replaysSessionSampleRate 0 (we don't run Session Replay — PII risk)
 *
 * Release:
 *   NEXT_PUBLIC_APP_VERSION is the single source of truth. Fall back to
 *   'mooter-landing@unknown' so issues still group cleanly when unset.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'mooter-landing@unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Keep off by default — Replay captures DOM + console, which can leak
    // PII before we have a scrubbing policy reviewed.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Minimal integrations. The SDK auto-bundles browserTracing by default;
    // we accept the default set for now and tune in Sprint 8.5+ if noisy.
  });
}
