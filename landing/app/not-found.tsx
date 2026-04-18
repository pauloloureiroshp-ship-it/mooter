import Link from 'next/link';

// Next.js App Router 404 handler — rendered whenever notFound() is called
// OR a route simply doesn't match. Keeps the warm-beige brand voice instead
// of Next's generic "This page could not be found" white-on-black screen.
export default function NotFound() {
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
        <div
          style={{
            fontFamily: 'var(--mono), ui-monospace, monospace',
            fontSize: '0.8rem',
            color: 'var(--muted-ink, #6B5F55)',
            marginBottom: '1rem',
          }}
        >
          HTTP 404
        </div>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
          This route doesn&apos;t exist.
        </h1>
        <p style={{ color: 'var(--muted-ink, #6B5F55)', marginBottom: '1.5rem', lineHeight: 1.55 }}>
          No tier routed you here — looks like a dead link. Head back to the
          landing or jump to your dashboard.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-rose">
            Back to home
          </Link>
          <Link href="/dashboard" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
