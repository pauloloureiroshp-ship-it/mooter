'use client';

import { useEffect, useState } from 'react';

// Wave 11 D2-4 — OAuth failures previously redirected to `/?auth=error` with no
// visible message (silent failure). Surface an honest, dismissible banner so a
// user who bounced out of GitHub OAuth knows what happened and can retry.
export default function AuthErrorBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') === 'error') {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
        margin: '16px 0 0', padding: '10px 14px',
        background: 'rgba(212,106,90,0.08)', border: '1px solid rgba(212,106,90,0.25)',
        borderRadius: 10, color: 'var(--color-text)', fontSize: 14,
      }}
    >
      <span>Sign-in didn&apos;t complete. No account was created — you can try again anytime.</span>
      <a href="/dashboard" style={{ color: 'var(--color-accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        Retry →
      </a>
    </div>
  );
}
