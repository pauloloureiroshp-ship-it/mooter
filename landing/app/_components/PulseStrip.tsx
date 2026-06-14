// PulseStrip — the author's real, measured routing numbers (Wave 33.9, carried
// from landing-v12-deploy/mooter-v1-iter1.jsx l.363–377). These are HONEST data
// from a single machine (Paulo's), not a community average. Distinct from
// CommunityPulse, which is reserved for opted-in herd telemetry once devices
// start phoning home. Static server component — no client JS, no fetch.

import { FACTS } from '../lib/facts';

const STATS: { label: string; value: string; sub: string }[] = [
  { label: 'calls routed', value: String(FACTS.callsRouted), sub: `across ${FACTS.moos} moos` },
  { label: 'saved vs Opus', value: `$${FACTS.savedAllTimeUsd.toFixed(2)}`, sub: 'alltime' },
  { label: 'avg savings', value: `${FACTS.avgSavingsPct}%`, sub: 'vs all-Opus' },
  { label: 'packs installed', value: String(FACTS.packsInstalled), sub: 'data · diagram · voice' },
];

export default function PulseStrip() {
  return (
    <div style={{ margin: '36px 0 0' }}>
      <div
        className="pulse-grid"
        style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          borderRadius: 14,
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 24,
        }}
      >
        {STATS.map((s) => (
          <div key={s.label}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-muted)', fontWeight: 500 }}>
              {s.label}
            </div>
            <div
              className="num"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 30,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                marginTop: 4,
                color: 'var(--color-text)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <span aria-hidden="true">🐮</span>
        <span>
          From the author&apos;s machine — 1 dev (Paulo). Real numbers, not a community average.
          Opted-in herd telemetry rolls out separately — these are one machine&apos;s numbers.
        </span>
      </div>
      <style>{`
        @media (max-width: 720px) { .pulse-grid { grid-template-columns: 1fr 1fr !important; gap: 20px !important; padding: 18px 20px !important; } }
      `}</style>
    </div>
  );
}
