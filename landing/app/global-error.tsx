'use client';

// Next.js App Router global error — only rendered when the root layout itself
// explodes (error.tsx runs under /app, but not for layout failures). Must
// include <html> and <body> because no parent layout survives.
//
// Minimal, zero-deps, no env access — this file must work even if env.ts
// itself threw on load.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#F2ECDF',
          color: '#2A2320',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>mooter is down.</h1>
          <p style={{ color: '#6B5F55', marginBottom: '1.5rem', lineHeight: 1.55 }}>
            A root-level error prevented the app from loading. This is unusual
            — probably a missing environment variable or a bad deploy.
          </p>
          {error.digest && (
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', color: '#6B5F55', marginBottom: '1.5rem' }}>
              error id: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#C25F65',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
