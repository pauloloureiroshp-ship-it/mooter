'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Sprint 8.2 — dashboard global error boundary. Only renders when root
// layout itself throws. Includes <html>/<body> because no parent survives.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#fff',
          color: '#2A2320',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Dashboard failed to load</h1>
        <p style={{ color: '#6B5F55' }}>
          A root-level error prevented the app from loading. Check your local
          router on 127.0.0.1:7821 is running.
        </p>
        {error.digest && (
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>
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
          Reload
        </button>
      </body>
    </html>
  );
}
