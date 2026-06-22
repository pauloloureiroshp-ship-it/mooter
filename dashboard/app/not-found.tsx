import Link from 'next/link';

// Sprint 8.2 companion — dashboard 404 page. Styled to match error.tsx
// and global-error.tsx. Dashboard is local-only (127.0.0.1:7820) so
// users hitting a 404 are almost certainly typing a URL by hand or
// following a stale link — route them back to the index.
export default function NotFound() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Page not found</h1>
      <p style={{ color: 'var(--fg-dim)', marginBottom: '1rem' }}>
        The dashboard route you requested does not exist.
      </p>
      <Link
        href="/"
        style={{
          padding: '0.5rem 1rem',
          background: 'var(--bg-elev-2)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          marginTop: '1rem',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
