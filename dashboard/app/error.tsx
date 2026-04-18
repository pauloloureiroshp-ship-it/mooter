'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Sprint 8.2 — dashboard error boundary. Reports to Sentry when DSN is set,
// otherwise renders a plain retry page. Kept minimal since dashboard is
// local-only (127.0.0.1:7820) and styling matches sidebar shell.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Dashboard error</h1>
      <p style={{ color: '#6B5F55', marginBottom: '1rem' }}>
        An unexpected error occurred. You can retry or refresh the page.
      </p>
      {error.digest && (
        <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', color: '#6B5F55' }}>
          error id: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        style={{
          padding: '0.5rem 1rem',
          background: '#2A2320',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          marginTop: '1rem',
        }}
      >
        Retry
      </button>
    </div>
  );
}
