'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Sprint 8.1 — 404 breadcrumb.
//
// Fired from app/not-found.tsx. We intentionally use captureMessage at 'info'
// level instead of captureException: 404s are expected UX, not errors, and
// we don't want the Sentry issue feed drowned in dead-link noise.
//
// Separate client component because not-found.tsx is a Server Component; we
// only need the browser-side Sentry instance for this breadcrumb.
export default function NotFoundBreadcrumb() {
  useEffect(() => {
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '(unknown)';
      Sentry.captureMessage(`404: ${path}`, { level: 'info' });
    } catch {
      /* non-fatal — if Sentry isn't initialised this is a no-op anyway */
    }
  }, []);
  return null;
}
