'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Card from '@/components/Card';
import Eyebrow from '@/components/Eyebrow';

// ConductorVisual (Wave 60) — the multi-session lock dance, simulated.
// Three sessions; the lock holder rotates through the queue every few seconds so
// the page *shows* coordination instead of describing a frozen snapshot. All
// motion is transform/opacity only; it pauses off-screen (IntersectionObserver)
// and freezes entirely for prefers-reduced-motion users. Honest copy unchanged.

type Phase = 0 | 1 | 2;

interface Session {
  branch: string;
  cmd: ReactNode;
  pid: number;
}

const SESSIONS: Session[] = [
  { branch: 'wave33-ultimate', cmd: <>$ git commit -m <span style={{ color: 'var(--color-accent)' }}>&quot;wave33: final pass&quot;</span></>, pid: 48213 },
  { branch: 'wave34-exp', cmd: <>$ git rebase main</>, pid: 48266 },
  { branch: 'hotfix/billing', cmd: <>$ git commit -m <span style={{ color: 'var(--color-term-dim)' }}>&quot;hotfix: null guard&quot;</span></>, pid: 48291 },
];

const ADVANCE_MS = 3200;

function TrafficLights() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-hidden>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
    </div>
  );
}

function MiniTerm({
  branch, holds, queuePos, cmd,
}: { branch: string; holds: boolean; queuePos: number; cmd: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-term-bg)',
        border: `1px solid ${holds ? 'var(--color-accent-25)' : 'var(--color-term-border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        opacity: holds ? 1 : 0.62,
        boxShadow: holds ? '0 0 0 1px var(--color-accent-08)' : 'none',
        transform: holds ? 'translateX(0)' : 'translateX(0)',
        transition: 'opacity 0.45s ease, border-color 0.45s ease, box-shadow 0.45s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--color-term-header)', borderBottom: '1px solid var(--color-term-border)', fontSize: 11.5, flexWrap: 'wrap' }}>
        <TrafficLights />
        <span style={{ color: 'var(--color-term-fg)' }}>~/repo</span>
        <span style={{ color: 'var(--color-term-dim)' }}>·</span>
        <span style={{ color: holds ? 'var(--color-accent)' : 'var(--color-term-dim)' }}>{branch}</span>
        <span style={{ marginLeft: 'auto', color: holds ? 'var(--color-green)' : 'var(--color-yellow)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span
            className="mpulse-dot"
            style={{ width: 6, height: 6, borderRadius: '50%', background: holds ? 'var(--color-green)' : 'var(--color-yellow)', animation: holds ? 'mpulse 1.8s ease-in-out infinite' : 'none' }}
          />
          {holds ? 'holds lock' : `queued #${queuePos}`}
        </span>
      </div>
      <div style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--color-term-fg)' }}>
        <div style={{ color: 'var(--color-term-dim)' }}>{cmd}</div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            opacity: holds ? 1 : 0.85,
            transition: 'opacity 0.45s ease',
          }}
        >
          {holds ? (
            <>
              <span style={{ color: 'var(--color-green)' }}>🔒</span>
              <span style={{ color: 'var(--color-green)' }}>holds .git/index.lock</span>
              <span style={{ color: 'var(--color-term-dim)' }}>· heartbeat</span>
              <span className="mheart-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)', animation: 'mheart 2.2s ease-in-out infinite' }} />
              <span style={{ color: 'var(--color-term-dim)' }}>5s</span>
            </>
          ) : (
            <span style={{ color: 'var(--color-yellow)' }}>○ waiting for lock · position {queuePos} in queue</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConductorVisual() {
  const [holder, setHolder] = useState(0);
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
      setHolder((h) => (h + 1) % SESSIONS.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, []);

  // queue order rotates so the next-in-line is always #1.
  const queueRank = (i: number) => ((i - holder + SESSIONS.length) % SESSIONS.length);
  const held = SESSIONS[holder];
  const queue = SESSIONS
    .map((s, i) => ({ s, rank: queueRank(i) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div ref={hostRef} className="conductor-grid" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 40, alignItems: 'start' }}>
      {/* LEFT — three live sessions */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SESSIONS.map((s, i) => (
          <MiniTerm key={s.branch} branch={s.branch} cmd={s.cmd} holds={i === holder} queuePos={queueRank(i)} />
        ))}

        {/* handwritten annotation */}
        <div style={{ position: 'relative', marginTop: 4, height: 78 }} aria-hidden>
          <svg width="240" height="78" viewBox="0 0 240 78" style={{ position: 'absolute', left: 8, top: 0, overflow: 'visible' }}>
            <path d="M30 70 C 20 40, 30 18, 70 10" fill="none" stroke="var(--color-accent-2)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M70 10 l -12 1 M70 10 l -4 -10" fill="none" stroke="var(--color-accent-2)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', left: 46, top: 40, fontFamily: 'var(--font-caveat), cursive', fontSize: 21, color: 'var(--color-accent-2)', lineHeight: 1.1, maxWidth: 320, transform: 'rotate(-2deg)' }}>
            this is what stops 2 sessions<br />from pushing simultaneously
          </div>
        </div>
      </div>

      {/* RIGHT — conductor state (tracks the live holder) */}
      <Card padding={22} style={{ background: 'var(--color-bg-2)' }}>
        <Eyebrow>worktree conductor · lock state</Eyebrow>
        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-term-dim)' }}>.git/index.lock</span>
            <span style={{ color: 'var(--color-green)' }}>● held</span>
          </div>
          <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ color: 'var(--color-term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>holder</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.45s ease' }}>
              <span style={{ color: 'var(--color-accent)' }}>{held.branch}</span>
              <span style={{ color: 'var(--color-term-dim)' }}>· pid {held.pid}</span>
            </div>
          </div>
          <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ color: 'var(--color-term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>queue</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {queue.map(({ s, rank }) => (
                <div key={s.branch} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-yellow)', transition: 'opacity 0.45s ease' }}>
                  <span style={{ color: 'var(--color-term-dim)' }}>{rank}.</span>{s.branch}
                </div>
              ))}
            </div>
          </div>
          <div style={{ paddingTop: 12 }}>
            <div style={{ color: 'var(--color-term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>heartbeat</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="mheart-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-green)', animation: `mheart 2.2s ease-in-out ${i * 0.12}s infinite` }} />
              ))}
              <span style={{ color: 'var(--color-term-dim)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>every 5s · alive</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          Stale lock detected? Conductor never force-breaks it. Recovery happens{' '}
          <span style={{ color: 'var(--color-text)' }}>only with your confirm</span>.
        </div>
      </Card>
    </div>
  );
}
