'use client';

// Wave W3 (First-Magic) — the onboarding "magic moment". A non-dev taps a prompt
// they recognise and instantly sees where Mooter routes it and what it costs — three
// of the examples land on the local tier at $0. Data comes from first-magic.ts, whose
// verdicts are the frozen classifier's REAL output (no fabricated tiers/costs).

import { useState } from 'react';
import {
  FIRST_MAGIC_EXAMPLES, tierMeta, whyRouted, type RoutingExample, type Tier,
} from '../_lib/first-magic';

/** Tier accent color — the design-system var, with a safe fallback per tier. */
function tierColor(tier: Tier): string {
  const fallback = ['#16a34a', '#3b82f6', '#f59e0b', '#a855f7'][tier];
  return `var(--tier-${tier}, ${fallback})`;
}

export default function FirstMagicDemo({ onStart }: { onStart?: () => void }) {
  // Auto-select the first (local, $0) example so the magic shows immediately.
  const [selected, setSelected] = useState<RoutingExample>(FIRST_MAGIC_EXAMPLES[0]);
  const meta = tierMeta(selected.tier);
  const color = tierColor(selected.tier);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8,
      }}>
        See it route — before it costs you a cent
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 16px', lineHeight: 1.5 }}>
        Mooter reads every prompt in under 50 ms <strong style={{ color: 'var(--text)' }}>on your machine</strong>{' '}
        and picks the cheapest model that can do the job. Tap one:
      </p>

      {/* Example chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {FIRST_MAGIC_EXAMPLES.map((ex) => {
          const active = ex.prompt === selected.prompt;
          const c = tierColor(ex.tier);
          return (
            <button
              key={ex.prompt}
              onClick={() => setSelected(ex)}
              style={{
                textAlign: 'left',
                background: active ? `color-mix(in srgb, ${c} 12%, var(--surface))` : 'var(--surface-2)',
                border: `1px solid ${active ? c : 'var(--border)'}`,
                borderRadius: 'var(--r-sm)',
                padding: '8px 12px',
                fontSize: '0.82rem',
                color: 'var(--text)',
                fontFamily: 'var(--font)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              {ex.prompt}
            </button>
          );
        })}
      </div>

      {/* Verdict card */}
      <div
        aria-live="polite"
        style={{
          padding: '18px 20px',
          background: `color-mix(in srgb, ${color} 7%, var(--surface))`,
          border: `1px solid color-mix(in srgb, ${color} 34%, var(--border))`,
          borderRadius: 'var(--r-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 44, height: 30, padding: '0 10px',
            background: color, color: 'var(--cream, #fff)',
            borderRadius: 'var(--r-sm)', fontWeight: 800, fontSize: '0.9rem',
            fontFamily: 'var(--font)',
          }}>
            {meta.label}
          </span>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.95rem' }}>
            {meta.model}
          </span>
          <span style={{
            marginLeft: 'auto',
            fontWeight: 800, fontSize: '1rem',
            color: meta.local ? tierColor(0) : 'var(--muted)',
          }}>
            {meta.cost}
          </span>
        </div>
        <div style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.5 }}>
          {whyRouted(selected)}.
        </div>
        <div style={{
          marginTop: 8, fontSize: '0.76rem', color: 'var(--muted)',
          paddingTop: 10, borderTop: '1px solid var(--border)',
        }}>
          Classified locally in &lt;50 ms · deciding costs {meta.local ? '$0 and it runs local too' : '$0 — you only pay the cloud model when it earns it'}.
        </div>
      </div>

      {onStart && (
        <button
          onClick={onStart}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          style={{
            marginTop: 16, width: '100%',
            background: 'var(--accent)', color: 'var(--cream, #fff)',
            border: 'none', borderRadius: 'var(--r-sm)',
            padding: '11px 16px', fontSize: '0.9rem', fontWeight: 700,
            fontFamily: 'var(--font)', cursor: 'pointer', transition: 'filter 0.15s ease',
          }}
        >
          Get this on my machine →
        </button>
      )}
    </div>
  );
}
