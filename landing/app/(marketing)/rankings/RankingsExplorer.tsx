'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Card from '@/components/Card';
import MonoNum from '@/components/MonoNum';

// Wave 5 "Rankings-as-proof" — the field, through Mooter's routing lens.
// Reads /rankings-seed.json (emitted by `mooter rankings build`). Every value is
// counted from the seed: measured/null is sacred, "—" means not-yet-measured,
// never a fabricated 0. The verdict row is the router's own pick (decideAgent),
// not a marketing choice.

interface RankingRow {
  model: string;
  provider: string;
  tier: string;
  quality: { score: number | null; source: string | null; as_of: string | null; measured: boolean };
  price: { in_per_mtok: number | null; out_per_mtok: number | null; pending: boolean };
  toks: { cloud_p50: number | null; source: string };
  tes: number | null;
  local: { is_local: boolean; cost_usd: number | null };
  subscription_zero: boolean;
  verdict: { recommended: boolean; tier: string; reason: string };
}

interface Seed {
  schema: string;
  generated_utc: string;
  pricing_snapshot: string;
  models_total: number;
  categories: string[];
  rows: Record<string, RankingRow[]>;
  savings: { measured: boolean; window_days: number; source: string; note: string; by_category: Record<string, { saved_usd: number; vs: string }> };
}

const TIER_COLOR: Record<string, string> = {
  T0: 'var(--color-tier-0)',
  T1: 'var(--color-tier-1)',
  T2: 'var(--color-tier-2)',
  T3: 'var(--color-tier-3)',
  T5: 'var(--color-accent)', // Fable — opt-in only, accent rose
};

function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLOR[tier] ?? 'var(--color-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {tier}
    </span>
  );
}

const GROUP_OF = (c: string) => c.split('.')[0];

export default function RankingsExplorer() {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>('coding.backend');
  const [maxPlan, setMaxPlan] = useState(false); // false = all-cloud, true = Claude Max

  useEffect(() => {
    fetch('/rankings-seed.json')
      .then((r) => r.json())
      .then((j: Seed) => {
        setSeed(j);
        // Fall back to the first category only if the default isn't in the seed.
        setCategory((cur) => (j.rows?.[cur] ? cur : j.categories?.[0] ?? cur));
      })
      .catch(() => setError(true));
  }, []);

  const rows = useMemo(() => (seed ? seed.rows[category] ?? [] : []), [seed, category]);

  if (error) {
    return (
      <Card style={{ marginTop: 24 }}>
        <p style={{ color: 'var(--color-muted)', margin: 0 }}>
          Rankings seed not found. Run <code>mooter rankings build</code> to generate{' '}
          <code>public/rankings-seed.json</code>.
        </p>
      </Card>
    );
  }
  if (!seed) {
    return <p style={{ color: 'var(--color-muted)', marginTop: 24 }}>Loading the field…</p>;
  }

  // Cost cell text, honest under the active plan toggle.
  const costCell = (r: RankingRow): { text: string; color: string; sub?: string } => {
    if (r.local.is_local) return { text: '$0', color: 'var(--color-green)', sub: 'your GPU' };
    if (maxPlan && r.subscription_zero) return { text: '$0', color: 'var(--color-green)', sub: 'to you · Max' };
    if (r.price.pending || r.price.in_per_mtok === null || r.price.out_per_mtok === null) {
      return { text: '—', color: 'var(--color-muted)', sub: 'price pending' };
    }
    return {
      text: `$${r.price.in_per_mtok} · $${r.price.out_per_mtok}`,
      color: 'var(--color-text)',
      sub: '/Mtok in·out',
    };
  };

  const measuredCount = rows.filter((r) => r.quality.measured).length;

  const th: CSSProperties = {
    textAlign: 'left',
    padding: '12px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-muted)',
    borderBottom: '1px solid var(--color-border-light)',
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = { padding: '12px 12px', fontSize: 13.5, verticalAlign: 'top' };

  return (
    <div>
      {/* Category selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '20px 0 14px' }}>
        {seed.categories.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12.5,
                fontFamily: 'var(--mono)',
                fontWeight: active ? 700 : 500,
                color: active ? '#1A0E0E' : 'var(--color-muted)',
                background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
              title={GROUP_OF(c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Plan toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>your plan:</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
          {([['all-cloud', false], ['Claude Max', true]] as const).map(([label, on]) => {
            const active = maxPlan === on;
            return (
              <button
                key={label}
                onClick={() => setMaxPlan(on)}
                style={{
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1A0E0E' : 'var(--color-muted)',
                  background: active ? 'var(--color-accent)' : 'transparent',
                  border: 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--color-faint, var(--color-muted))' }}>
          {maxPlan ? 'Claude tiers count as $0 — already covered by your subscription.' : 'pay-per-token cloud pricing.'}
        </span>
      </div>

      {/* Savings strip — honest: only show a number when measured locally. */}
      <div
        style={{
          background: 'color-mix(in srgb, var(--color-green) 9%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 18,
          fontSize: 13.5,
          color: 'var(--color-text)',
        }}
      >
        {seed.savings.measured && seed.savings.by_category[category] ? (
          <span>
            <MonoNum color="var(--color-green)" style={{ fontWeight: 700 }}>
              ${seed.savings.by_category[category].saved_usd.toFixed(2)}
            </MonoNum>{' '}
            saved this week on <strong>{category}</strong> {seed.savings.by_category[category].vs}.
          </span>
        ) : (
          <span style={{ color: 'var(--color-muted)' }}>
            Savings are measured on <strong>your</strong> machine, never fabricated for this page. Run{' '}
            <code>mooter rankings build</code> locally to fill this strip from your own routing journal{' '}
            (vs an all-Opus baseline).
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Tier</th>
              <th style={th}>Quality</th>
              <th style={th}>Cost</th>
              <th style={th}>tok/s</th>
              <th style={th}>TES</th>
              <th style={th}>Mooter verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cc = costCell(r);
              return (
                <tr
                  key={r.model}
                  style={{
                    borderTop: '1px solid var(--color-border)',
                    background: r.verdict.recommended ? 'var(--color-accent-08)' : undefined,
                  }}
                >
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    {r.model}
                    <div style={{ fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font)', fontWeight: 400 }}>
                      {r.provider}
                    </div>
                  </td>
                  <td style={td}>
                    <TierBadge tier={r.tier} />
                  </td>
                  <td style={td}>
                    {r.quality.measured && r.quality.score !== null ? (
                      <>
                        <MonoNum style={{ fontWeight: 700 }}>{r.quality.score.toFixed(3)}</MonoNum>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {r.quality.source}
                          {r.quality.as_of ? ` · ${r.quality.as_of}` : ''}
                        </div>
                      </>
                    ) : r.quality.measured ? (
                      <span style={{ color: 'var(--color-muted)' }} title={r.quality.source ?? ''}>
                        cited · qualitative
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    <MonoNum style={{ fontWeight: 600 }} color={cc.color}>
                      {cc.text}
                    </MonoNum>
                    {cc.sub ? <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cc.sub}</div> : null}
                  </td>
                  <td style={{ ...td, color: 'var(--color-muted)' }}>—</td>
                  <td style={td}>
                    {r.tes !== null ? (
                      <MonoNum style={{ fontWeight: 600 }}>{r.tes}</MonoNum>
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }} title="needs a measured score AND a real price">
                        —
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {r.verdict.recommended ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--color-accent)',
                        }}
                        title={r.verdict.reason}
                      >
                        ✦ mooter routes here
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-faint, var(--color-muted))', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Honesty footer */}
      <p style={{ color: 'var(--color-muted)', fontSize: 12.5, marginTop: 16, maxWidth: 820, lineHeight: 1.6 }}>
        {measuredCount} of {rows.length} models have a measured score for <strong>{category}</strong>.{' '}
        <strong style={{ color: 'var(--color-text)' }}>measured</strong> = a cited public benchmark ·{' '}
        <strong style={{ color: 'var(--color-text)' }}>—</strong> = not yet measured (we never invent a 0). TES is{' '}
        quality-per-$ from the calculator; a model with no real price can&apos;t be ranked, so it shows{' '}
        <strong>—</strong> even with a high score. Refresh cadence: cost &amp; tok/s daily, quality weekly (curated
        hub-side). Sources: public benchmarks (SWE-bench, GPQA, AIME, Terminal-Bench) · prices from the frozen pricing
        snapshot (<code>{seed.pricing_snapshot}</code>) · tok/s not yet measured.
      </p>
      <p style={{ color: 'var(--color-faint, var(--color-muted))', fontSize: 12, marginTop: 8, fontFamily: 'var(--mono)' }}>
        seed generated {seed.generated_utc.slice(0, 10)} · {seed.models_total} models × {seed.categories.length} categories
      </p>
    </div>
  );
}
