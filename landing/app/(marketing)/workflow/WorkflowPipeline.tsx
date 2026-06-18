'use client';

import { useEffect, useRef, useState } from 'react';

// WorkflowPipeline (Wave 60) — the 7-agent run, visualised as a pipeline that
// fills left-to-right as agents complete. Pure transform/opacity; pauses
// off-screen via IntersectionObserver and freezes for prefers-reduced-motion.
// No fabricated metrics — it mirrors the same 7-agent shape as WorkflowChip.

const AGENTS = ['classify', 'plan', 'spawn', 'spawn', 'spawn', 'merge', 'review'];
const STEP_MS = 500;

export default function WorkflowPipeline() {
  const [done, setDone] = useState(3);
  const inView = useRef(true);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0.1 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => {
      if (!inView.current) return;
      setDone((d) => (d >= AGENTS.length ? 3 : d + 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  const pct = Math.round((done / AGENTS.length) * 100);

  return (
    <div ref={hostRef} style={{ maxWidth: 560 }}>
      <div
        role="img"
        aria-label={`Run pipeline: ${done} of ${AGENTS.length} agents complete`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}
      >
        {AGENTS.map((label, i) => {
          const complete = i < done;
          const running = i === done;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }} aria-hidden>
              <div
                title={label}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  border: `1px solid ${complete ? 'var(--color-accent-25)' : 'var(--color-term-border)'}`,
                  background: complete ? 'var(--color-accent-08)' : 'transparent',
                  color: complete ? 'var(--color-green)' : running ? 'var(--color-accent)' : 'var(--color-term-dim)',
                  opacity: complete || running ? 1 : 0.55,
                  transform: running ? 'scale(1.08)' : 'scale(1)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease, background 0.3s ease, border-color 0.3s ease, color 0.3s ease',
                }}
              >
                {complete ? '●' : running ? '◐' : '○'}
              </div>
              {i < AGENTS.length - 1 && (
                <span
                  style={{
                    width: 14,
                    height: 2,
                    borderRadius: 2,
                    background: i < done ? 'var(--color-accent-25)' : 'var(--color-term-border)',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
        <span style={{ color: 'var(--color-accent)' }}>{done}</span>/{AGENTS.length} agents · {pct}% — classify → plan → spawn → merge → review
      </div>
    </div>
  );
}
