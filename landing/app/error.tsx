'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Next.js App Router error boundary — catches render-time errors in any
// Server or Client component under /app. Previously the site fell through
// to the platform default page (blank / ugly stack trace) when anything
// threw. This one keeps the warm-beige brand voice and links back to /.
//
// For global fatal errors (root layout explodes), see app/global-error.tsx.
//
// Pair with the Zod env validator at app/lib/env.ts — if a required env var
// is missing, env.ts throws and this boundary catches it with a readable msg.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[mooter] client error boundary:', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'var(--surface-beige, #F2ECDF)',
        color: 'var(--ink, #2A2320)',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🫠</div>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
          Something misrouted.
        </h1>
        <p style={{ color: 'var(--muted-ink, #6B5F55)', marginBottom: '1.5rem', lineHeight: 1.55 }}>
          This is an unexpected error on mooter.ai — not your install, not your
          router. We logged it. While we look, you can retry or go back.
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: 'var(--mono), ui-monospace, monospace',
              fontSize: '0.75rem',
              color: 'var(--muted-ink, #6B5F55)',
              marginBottom: '1.5rem',
            }}
          >
            error id: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={reset} className="btn btn-rose">
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
