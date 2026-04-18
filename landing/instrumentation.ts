/**
 * instrumentation.ts — Next.js 15 instrumentation entrypoint.
 *
 * Runs once on server/edge startup. We delegate to the legacy
 * sentry.{server,edge}.config.ts files so the config stays split and
 * discoverable. The client config is auto-loaded by @sentry/nextjs in
 * the browser bundle.
 *
 * onRequestError is the Next.js 15 App Router hook used to capture errors
 * thrown inside nested React Server Components — these can't be caught by
 * any error.tsx boundary. Sentry provides a helper that handles the ferrying.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
