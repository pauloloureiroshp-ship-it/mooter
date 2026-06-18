import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import Dotgrid from '@/components/Dotgrid';
import ConductorVisual from './ConductorVisual';

export const metadata: Metadata = {
  title: 'Conductor — multi-session git safety',
  description:
    'Running multiple Claude Code sessions? Mooter Conductor coordinates them with filesystem locks and 5-second heartbeats so two agents never break git. Stale recovery only with your confirm.',
};

// Conductor showcase (Wave 60 visual port). The lock-dance is a client component
// (ConductorVisual) — transform/opacity only, paused off-screen, frozen for
// prefers-reduced-motion. Honest copy carried verbatim from PR #179.

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

// How coordination actually works — three honest mechanisms, no metrics invented.
const STEPS: { k: string; title: string; body: string }[] = [
  {
    k: 'lock',
    title: 'Filesystem lock',
    body: 'One session at a time holds .git/index.lock. The others queue in order — no race, no clobbered commit.',
  },
  {
    k: 'heartbeat',
    title: 'Heartbeat every 5s',
    body: 'The holder pings every 5 seconds. A live holder keeps the lock; a missed beat is what flags a stale one.',
  },
  {
    k: 'confirm',
    title: 'Recovery on your confirm',
    body: 'Conductor never force-breaks a stale lock on its own. It surfaces the situation and waits for you to confirm.',
  },
];

export default function ConductorPage() {
  return (
    <div style={SECTION_BG}>
      <Dotgrid />
      <div className="conductor-wrap m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <Eyebrow>§ conductor · multi-session safety</Eyebrow>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 10, marginBottom: 14, maxWidth: 940 }}>
          Multiple Claude sessions? Mooter coordinates them so you don&apos;t break git.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 40 }}>
          Filesystem locks. Heartbeats every 5 seconds. Stale recovery only with your confirm. No race conditions. No deleted commits.
        </p>

        <ConductorVisual />

        {/* how coordination works — honest mechanism breakdown */}
        <div style={{ marginTop: 56 }}>
          <Eyebrow>how it stays safe</Eyebrow>
          <div className="conductor-steps m-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 8 }}>
            {STEPS.map((s, i) => (
              <Card key={s.k} padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{s.title}</span>
                <span style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.6 }}>{s.body}</span>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 880px){ .conductor-grid{ grid-template-columns: 1fr !important; gap: 28px !important; } } @media (max-width: 768px){ .conductor-steps{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
