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
          // This boundary replaces the root layout, so globals.css / CSS vars are
          // unavailable — warm-dark hexes are inlined literally to match the brand.
          fontFamily: 'system-ui, sans-serif',
          background: '#0B0A09',
          color: '#F2EDE6',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Dashboard failed to load</h1>
        <p style={{ color: '#8A8076' }}>
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
            background: '#1C1A17',
            color: '#F2EDE6',
            border: '1px solid #252220',
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
