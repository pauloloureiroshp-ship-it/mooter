import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';

export const metadata: Metadata = {
  title: 'Conductor — multi-session git safety',
  description:
    'Running multiple Claude Code sessions? Mooter Conductor coordinates them with filesystem locks and 5-second heartbeats so two agents never break git. Stale recovery only with your confirm.',
};

// Conductor showcase (Wave 33.9, carried from landing-v12-deploy/mooter-v1-showcase.jsx).
// Fully static — heartbeat/pulse animations are pure CSS keyframes (mheart/mpulse),
// so this renders as a server component with zero client JS.

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
  branch, status, statusColor, active = false, children,
}: { branch: string; status: string; statusColor: string; active?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-term-bg)',
        border: `1px solid ${active ? 'var(--color-accent-25)' : 'var(--color-term-border)'}`,
        borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)',
        opacity: active ? 1 : 0.62,
        boxShadow: active ? '0 0 0 1px var(--color-accent-08)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--color-term-header)', borderBottom: '1px solid var(--color-term-border)', fontSize: 11.5 }}>
        <TrafficLights />
        <span style={{ color: 'var(--color-term-fg)' }}>~/repo</span>
        <span style={{ color: 'var(--color-term-dim)' }}>·</span>
        <span style={{ color: active ? 'var(--color-accent)' : 'var(--color-term-dim)' }}>{branch}</span>
        <span style={{ marginLeft: 'auto', color: statusColor, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span className="mpulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, animation: active ? 'mpulse 1.8s ease-in-out infinite' : 'none' }} />
          {status}
        </span>
      </div>
      <div style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--color-term-fg)' }}>{children}</div>
    </div>
  );
}

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

const DOTGRID = {
  position: 'absolute' as const,
  inset: 0,
  pointerEvents: 'none' as const,
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export default function ConductorPage() {
  return (
    <div style={SECTION_BG}>
      <div style={DOTGRID} aria-hidden />
      <div className="conductor-wrap" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <Eyebrow>§ conductor · multi-session safety</Eyebrow>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 10, marginBottom: 14, maxWidth: 940 }}>
          Multiple Claude sessions? Mooter coordinates them so you don&apos;t break git.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 40 }}>
          Filesystem locks. Heartbeats every 5 seconds. Stale recovery only with your confirm. No race conditions. No deleted commits.
        </p>

        <div className="conductor-grid" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 40, alignItems: 'start' }}>
          {/* LEFT — three sessions */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MiniTerm branch="wave33-ultimate" status="holds lock" statusColor="var(--color-green)" active>
              <div style={{ color: 'var(--color-term-dim)' }}>$ git commit -m <span style={{ color: 'var(--color-accent)' }}>&quot;wave33: final pass&quot;</span></div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--color-green)' }}>🔒</span>
                <span style={{ color: 'var(--color-green)' }}>holds .git/index.lock</span>
                <span style={{ color: 'var(--color-term-dim)' }}>· heartbeat</span>
                <span className="mheart-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)', animation: 'mheart 2.2s ease-in-out infinite' }} />
                <span style={{ color: 'var(--color-term-dim)' }}>5s</span>
              </div>
            </MiniTerm>

            <MiniTerm branch="wave34-exp" status="queued #1" statusColor="var(--color-yellow)">
              <div style={{ color: 'var(--color-term-dim)' }}>$ git rebase main</div>
              <div style={{ marginTop: 6, color: 'var(--color-yellow)' }}>○ waiting for lock · position 1 in queue</div>
            </MiniTerm>

            <MiniTerm branch="hotfix/billing" status="queued #2" statusColor="var(--color-yellow)">
              <div style={{ color: 'var(--color-term-dim)' }}>$ git commit -m <span style={{ color: 'var(--color-term-dim)' }}>&quot;hotfix: null guard&quot;</span></div>
              <div style={{ marginTop: 6, color: 'var(--color-yellow)' }}>○ waiting for lock · position 2 in queue</div>
            </MiniTerm>

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

          {/* RIGHT — conductor state */}
          <Card padding={22} style={{ background: 'var(--color-bg-2)' }}>
            <Eyebrow>worktree conductor · lock state</Eyebrow>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-term-dim)' }}>.git/index.lock</span>
                <span style={{ color: 'var(--color-green)' }}>● held</span>
              </div>
              <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ color: 'var(--color-term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>holder</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--color-accent)' }}>wave33-ultimate</span>
                  <span style={{ color: 'var(--color-term-dim)' }}>· pid 48213</span>
                </div>
              </div>
              <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ color: 'var(--color-term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>queue</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['1', 'wave34-exp'], ['2', 'hotfix/billing']].map(([n, b]) => (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-yellow)' }}>
                      <span style={{ color: 'var(--color-term-dim)' }}>{n}.</span>{b}
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
      </div>
      <style>{`@media (max-width: 880px){ .conductor-grid{ grid-template-columns: 1fr !important; gap: 28px !important; } .conductor-wrap{ padding: 48px 20px 56px !important; } }`}</style>
    </div>
  );
}
