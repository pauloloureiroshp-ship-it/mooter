'use client';

import { useEffect, useState } from 'react';

// Wave 11 D2-4 — OAuth failures previously redirected to `/?auth=error` with no
// visible message (silent failure). Surface an honest, dismissible banner so a
// user who bounced out of GitHub OAuth knows what happened and can retry.
// Wave 44 — tailor the copy to the reason the callback forwards
// (`?auth=error&reason=denied|network|failed`) so the message is specific, not
// generic. We never claim a cause we can't actually derive: anything unknown
// falls back to the honest generic message.
const MESSAGES: Record<string, string> = {
  denied:
    "You declined the GitHub permissions, so sign-in stopped. Mooter only asks for read:user + user:email — never your code or private repos. You can try again anytime.",
  network:
    "Sign-in couldn't reach GitHub — looks like a network hiccup. No account was created; try again in a moment.",
  failed:
    "Sign-in didn't complete. No account was created — you can try again anytime.",
};

export default function AuthErrorBanner() {
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState<keyof typeof MESSAGES>('failed');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'error') {
      const r = params.get('reason') ?? 'failed';
      setReason(r in MESSAGES ? (r as keyof typeof MESSAGES) : 'failed');
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
      <span>{MESSAGES[reason]}</span>
      <a href="/dashboard" style={{ color: 'var(--color-accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        Retry →
      </a>
    </div>
  );
}
