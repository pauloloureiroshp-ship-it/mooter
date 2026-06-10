'use client';

import { useEffect, useState } from 'react';

// WorkflowChip — the live statusline chip (Wave 33.9, carried from
// landing-v12-deploy/mooter-v1-showcase.jsx). Dots advance every 500ms to
// mimic agents completing in a run. Pauses for prefers-reduced-motion users.

const TOTAL = 7;

export default function WorkflowChip({ cloud = false }: { cloud?: boolean }) {
  const [active, setActive] = useState(3);
  const [tk, setTk] = useState(4.2);

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => {
      setActive((a) => (a >= TOTAL ? 3 : a + 1));
      setTk((t) => +(t + 0.3 > 9.9 ? 4.2 : t + 0.3).toFixed(1));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const accent = cloud ? 'var(--color-tier-2)' : 'var(--color-accent)';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-term-fg)',
        background: '#0a0c10', border: '1px solid var(--color-term-border)', borderRadius: 8, padding: '12px 16px',
      }}
    >
      <span className="mspin" aria-hidden style={{ display: 'inline-block', animation: 'mspin 1.1s linear infinite', color: accent }}>⟳</span>
      <span style={{ color: 'var(--color-term-dim)' }}>wf-abc</span>
      <span><span style={{ color: accent }}>{active}</span>/{TOTAL} agents</span>
      <span style={{ display: 'inline-flex', gap: 4 }} aria-hidden>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span key={i} style={{ color: i < active ? (cloud ? 'var(--color-tier-2)' : 'var(--color-green)') : 'var(--color-term-border)' }}>
            {i < active ? '●' : '○'}
          </span>
        ))}
      </span>
      <span style={{ color: 'var(--color-term-dim)' }}>·</span>
      <span style={{ color: 'var(--color-term-dim)' }}>{tk}k tk</span>
    </div>
  );
}
