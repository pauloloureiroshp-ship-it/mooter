'use client';

// Public Mooter Rankings page (R1). Four honest blocks over the SAME payload the
// /api/rankings route serves: (0) hero, (1) TES leaderboard, (2) cost×quality
// frontier (pure SVG), (3) 17×24 heatmap, (4) bench accuracy/savings. NO Tailwind,
// NO chart lib — hand-rolled CSS-var styling + SVG, matching the repo convention
// (globals.css tokens + _matrix_panel.tsx). Doctrine: a value we cannot honestly
// measure renders as `·` / "pending", never a fabricated number; every number
// carries its source + as_of in a tooltip. Not affiliated with Anthropic.

import React, { useMemo, useState } from 'react';
import { tesBucket, type TesBucket } from '../../../(app)/dashboard/_matrix_state';
import type { RankingsPayload, RankingsModel } from '../../../lib/rankings-data';

// Heatmap palette mapped onto the real design tokens (globals.css), not an ad-hoc
// chart palette: high value → green, mid → yellow, low → tier-3 red, pending → a
// faint neutral (honestly "unknown", never a coloured score).
const HEAT_COLORS: Record<TesBucket, string> = {
  high: 'var(--color-green)',
  mid: 'var(--color-yellow)',
  low: 'var(--color-tier-3)',
  pending: 'var(--color-faint)',
};
function heatColor(b: TesBucket): string {
  return HEAT_COLORS[b];
}

export interface BenchSnapshot {
  generated_at: string;
  accuracy: number;
  total: number;
  cohorts: number;
  cohort_label: string;
  est_savings_pct: number;
  classifier_sha256: string;
  dataset: string;
  honest_caveats: string[];
}

const TIER_COLORS: Record<string, string> = {
  T0: 'var(--color-tier-0)',
  T1: 'var(--color-tier-1)',
  T2: 'var(--color-tier-2)',
  T3: 'var(--color-tier-3)',
  T5: 'var(--color-accent)',
};
function tierColor(t: string | null): string {
  return (t && TIER_COLORS[t]) || 'var(--color-border-light)';
}

type Axis = 'tes' | 'cost' | 'score';
type SortKey = 'name' | 'tier' | 'score' | 'in' | 'out' | 'blended' | 'tes';

interface Row {
  id: string;
  name: string;
  vendor: string;
  tier: string | null;
  routed: boolean;
  score: number | null;
  tes: number | null;
  status: 'measured' | 'free' | 'pending' | 'unmeasured';
  blended: number | null;
  inP: number | null;
  outP: number | null;
  priceStatus: 'priced' | 'pending' | 'free';
  source: string | null;
  asOf: string | null;
}

function fmtScore(s: number | null): string {
  return s == null ? '·' : (s * 100).toFixed(1);
}
function fmtTes(t: number | null): string {
  return t == null ? '·' : Math.round(t).toLocaleString('en-US');
}
function fmtUsd(n: number | null): string {
  return n == null ? '·' : `$${n.toFixed(2)}`;
}

// ── shared inline styles (CSS-var driven, marketing tokens) ──────────────────
const S = {
  section: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 18,
    padding: '22px 22px 18px',
    marginTop: 22,
  } as React.CSSProperties,
  sheadH: { fontSize: 18, margin: 0, letterSpacing: '-0.01em' } as React.CSSProperties,
  sheadP: { margin: '4px 0 0', color: 'var(--color-muted)', fontSize: 13 } as React.CSSProperties,
  muted: { color: 'var(--color-muted)', fontSize: 12.5 } as React.CSSProperties,
  pill: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    padding: '1px 6px',
    borderRadius: 5,
  } as React.CSSProperties,
};

function chipStyle(bg: string, faded = false): React.CSSProperties {
  return {
    display: 'inline-block',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 6,
    color: 'var(--color-bg)',
    background: bg,
    opacity: faded ? 0.55 : 1,
  };
}

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
        color: active ? 'var(--color-bg)' : 'var(--color-muted)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 999,
        padding: '5px 12px',
        fontFamily: 'var(--font)',
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function RankingsView({ data, bench }: { data: RankingsPayload; bench: BenchSnapshot }) {
  const [category, setCategory] = useState<string>('coding.backend');
  const [filterMode, setFilterMode] = useState<string>('all'); // 'all' | 'routed' | `vendor:${v}`
  const [axis, setAxis] = useState<Axis>('tes');
  const [sortKey, setSortKey] = useState<SortKey>('tes');
  const [sortDir, setSortDir] = useState<number>(-1);

  const vendors = useMemo(
    () => Array.from(new Set(data.models.map((m) => m.vendor))).sort(),
    [data.models],
  );

  const cellByKey = useMemo(() => {
    const m = new Map<string, RankingsPayload['cells'][number]>();
    for (const c of data.cells) m.set(`${c.model}|${c.category}`, c);
    return m;
  }, [data.cells]);

  // Rows for the selected category (one per model), joined with pricing + meta.
  const allRows: Row[] = useMemo(() => {
    return data.models.map((m: RankingsModel) => {
      const cell = cellByKey.get(`${m.id}|${category}`);
      const p = data.pricing[m.id];
      return {
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        tier: m.tier,
        routed: m.routed,
        score: cell?.score ?? null,
        tes: cell?.tes ?? null,
        status: cell?.status ?? 'unmeasured',
        blended: p?.blended_3to1 ?? null,
        inP: p?.in_per_mtok ?? null,
        outP: p?.out_per_mtok ?? null,
        priceStatus: p?.status ?? 'pending',
        source: cell?.source ?? null,
        asOf: cell?.as_of ?? null,
      };
    });
  }, [data.models, data.pricing, cellByKey, category]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (filterMode === 'routed') rows = rows.filter((r) => r.routed);
    else if (filterMode.startsWith('vendor:')) {
      const v = filterMode.slice('vendor:'.length);
      rows = rows.filter((r) => r.vendor === v);
    }
    const dir = sortDir;
    const val = (r: Row): number | string | null => {
      switch (sortKey) {
        case 'name':
          return r.name.toLowerCase();
        case 'tier':
          return r.tier ?? 'ZZ';
        case 'score':
          return r.score;
        case 'in':
          return r.inP;
        case 'out':
          return r.outP;
        case 'blended':
          return r.blended;
        case 'tes':
        default:
          return r.tes;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      // Nulls always sort last, regardless of direction (never NaN arithmetic).
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return dir * String(va).localeCompare(String(vb));
      }
      return dir * (va - vb);
    });
  }, [allRows, filterMode, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => -d);
    else {
      setSortKey(k);
      setSortDir(k === 'name' || k === 'tier' ? 1 : -1);
    }
  }

  const mp = data.mooter_point;
  const cov = data.coverage;

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '32px 24px 80px',
        fontFamily: 'var(--font)',
        color: 'var(--color-text)',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 26 }} aria-hidden>
          🐮
        </span>
        <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em' }}>
          Mooter <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>/ rankings</span>
        </span>
      </div>
      <h1 style={{ fontSize: 34, lineHeight: 1.1, margin: '18px 0 6px', letterSpacing: '-0.02em' }}>
        Where each LLM lands — and why the router wins
      </h1>
      <p style={{ color: 'var(--color-muted)', maxWidth: 640, fontSize: 15 }}>
        OpenRouter ranks models by <em>usage</em>. We show the{' '}
        <strong>cost×quality frontier</strong> — and where the Mooter router falls by mixing local
        models ($0) with subscriptions. <strong>Real benchmark scores, cited per cell · routing
        savings are an advisory estimate · not a community average.</strong>
      </p>

      {/* Block 0 — Hero */}
      <Hero data={data} bench={bench} />

      {/* Controls */}
      <div style={{ ...S.section, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--color-muted)', marginRight: 6 }}>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              padding: '4px 8px',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            {data.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Filter models" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ControlButton active={filterMode === 'all'} onClick={() => setFilterMode('all')}>
            All
          </ControlButton>
          <ControlButton active={filterMode === 'routed'} onClick={() => setFilterMode('routed')}>
            Routed by Mooter
          </ControlButton>
          {vendors.map((v) => (
            <ControlButton
              key={v}
              active={filterMode === `vendor:${v}`}
              onClick={() => setFilterMode(`vendor:${v}`)}
            >
              {v}
            </ControlButton>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        <div role="group" aria-label="Sort axis" style={{ display: 'flex', gap: 6 }}>
          <span style={{ ...S.muted, alignSelf: 'center', marginRight: 2 }}>Axis</span>
          {(['tes', 'cost', 'score'] as Axis[]).map((a) => (
            <ControlButton
              key={a}
              active={axis === a}
              onClick={() => {
                setAxis(a);
                setSortKey(a === 'cost' ? 'blended' : a);
                setSortDir(a === 'cost' ? 1 : -1);
              }}
            >
              {a === 'tes' ? 'TES' : a === 'cost' ? '$ blended' : 'Score'}
            </ControlButton>
          ))}
        </div>
      </div>

      {/* Block 1 — Leaderboard */}
      <Leaderboard
        category={category}
        rows={filteredRows}
        mp={mp}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />

      {/* Block 2 — Frontier */}
      <Frontier category={category} rows={filteredRows} mp={mp} />

      {/* Block 3 — Heatmap */}
      <Heatmap data={data} />

      {/* Block 4 — Bench accuracy & savings */}
      <BenchPanel bench={bench} coverage={cov} />

      {/* Footer — honesty + attribution + trademark */}
      <div
        style={{
          marginTop: 22,
          padding: '16px 18px',
          border: '1px dashed var(--color-border)',
          borderRadius: 14,
          color: 'var(--color-muted)',
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--color-text)' }}>Honesty (the Mooter signature):</strong> a
        cell we cannot measure renders as <span style={S.pill}>·</span> — never a fabricated number.
        A model whose price is still pending shows <span style={S.pill}>pending</span>, not a guess.
        Local models floor to <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>free</span>.
        Quality scores are real benchmarks cited per cell; <strong style={{ color: 'var(--color-text)' }}>$/M
        blended</strong> = <span style={S.pill}>(3·in + out)/4</span> (3:1 convention). The Mooter
        point is an <strong style={{ color: 'var(--color-text)' }}>advisory</strong> result of real
        routing ({mp.basis}) — not a model; your numbers vary.
        <div style={{ marginTop: 10 }}>
          Benchmark sources (cited per cell): SWE-bench Verified · Terminal-Bench 2.0 · GPQA Diamond
          · AIME 2026 · vendor evals. Cost×quality axis convention from{' '}
          <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
            Artificial Analysis
          </a>
          . Pricing: Anthropic/vendor list prices ({data.pricing['claude-opus-4-7']?.as_of ?? 'snapshot'}).
        </div>
      </div>
      <p style={{ marginTop: 18, color: 'var(--color-muted)', fontSize: 11, textAlign: 'center' }}>
        Not affiliated with Anthropic. &ldquo;Claude&rdquo; and &ldquo;Claude Code&rdquo; are
        trademarks of Anthropic. Mooter is an independent, MIT-licensed router. Generated{' '}
        {new Date(data.generated_at).toISOString().slice(0, 10)} · v{data.version}.
      </p>
    </div>
  );
}

// ── Block 0 — Hero ───────────────────────────────────────────────────────────
function Hero({ data, bench }: { data: RankingsPayload; bench: BenchSnapshot }) {
  const stats: { big: string; lbl: string; tone?: 'green' | 'coral' }[] = [
    { big: `${bench.est_savings_pct}%`, lbl: 'saved vs all-Opus (bench, N=' + bench.total + ')', tone: 'green' },
    { big: `${(bench.accuracy * 100).toFixed(0)}%`, lbl: 'routing accuracy (bench)', tone: 'coral' },
    { big: `${data.models.length}×${data.categories.length}`, lbl: 'model × category matrix' },
    {
      big: `${data.coverage.measured_cells}/${data.coverage.total_cells}`,
      lbl: `cells measured (${data.coverage.coverage_pct}%)`,
    },
    { big: '$0', lbl: 'cost of the local T0 tier' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '26px 0 8px' }}>
      {stats.map((s) => (
        <div
          key={s.lbl}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: '16px 20px',
            minWidth: 150,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color:
                s.tone === 'green'
                  ? 'var(--color-green)'
                  : s.tone === 'coral'
                    ? 'var(--color-accent)'
                    : 'var(--color-text)',
            }}
          >
            {s.big}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 2 }}>{s.lbl}</div>
        </div>
      ))}
    </div>
  );
}

// ── Block 1 — Leaderboard ────────────────────────────────────────────────────
function Leaderboard({
  category,
  rows,
  mp,
  sortKey,
  sortDir,
  onSort,
}: {
  category: string;
  rows: Row[];
  mp: RankingsPayload['mooter_point'];
  sortKey: SortKey;
  sortDir: number;
  onSort: (k: SortKey) => void;
}) {
  const th = (k: SortKey, label: string, num = false): React.ReactNode => (
    <th
      scope="col"
      aria-sort={sortKey === k ? (sortDir < 0 ? 'descending' : 'ascending') : 'none'}
      style={{ padding: 0, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        style={{
          width: '100%',
          textAlign: num ? 'right' : 'left',
          padding: '9px 10px',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-muted)',
          fontWeight: 600,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: num ? 'var(--mono)' : 'var(--font)',
        }}
      >
        {label}
        {sortKey === k ? (sortDir < 0 ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  );
  const numTd: React.CSSProperties = {
    textAlign: 'right',
    padding: '9px 10px',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--mono)',
    whiteSpace: 'nowrap',
  };
  const nameTd: React.CSSProperties = {
    padding: '9px 10px',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
  };

  return (
    <section style={S.section} aria-labelledby="lb-h">
      <div style={{ marginBottom: 14 }}>
        <h2 id="lb-h" style={S.sheadH}>
          Leaderboard — TES by category
        </h2>
        <p style={S.sheadP}>
          Quality-per-dollar for <span style={S.pill}>{category}</span> · click a header to sort.
          Dimmed rows have no measured score or a pending price.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr>
              {th('name', 'Model')}
              {th('tier', 'Tier')}
              {th('score', 'Score', true)}
              {th('in', '$/M in', true)}
              {th('out', '$/M out', true)}
              {th('blended', '$/M blended', true)}
              {th('tes', 'TES', true)}
              <th scope="col" style={{ padding: '9px 10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)', fontWeight: 600, fontSize: 12 }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Mooter row pinned on top — advisory estimate, never measured data */}
            <tr
              style={{ background: 'rgba(76,175,106,0.10)' }}
              title={`${mp.basis} · source: ${mp.source} · as of ${mp.as_of}`}
            >
              <td style={nameTd}>
                <strong>🐮 Mooter</strong>{' '}
                <span style={{ color: 'var(--color-text)', fontSize: 12 }}>routing (advisory)</span>
              </td>
              <td style={nameTd}>
                <span style={chipStyle('var(--color-green)')}>MIX</span>
              </td>
              {/* ≈ marks an advisory estimate, not a measured benchmark score */}
              <td style={numTd} title="advisory estimate of the routed mix — not a benchmark">
                ≈ {(mp.score * 100).toFixed(1)}
              </td>
              <td style={{ ...numTd, color: 'var(--color-green)', fontWeight: 700 }}>~$0+</td>
              <td style={numTd}>—</td>
              <td style={{ ...numTd, color: 'var(--color-green)', fontWeight: 700 }}>≈ {fmtUsd(mp.blended_3to1)}</td>
              <td style={{ ...numTd, fontWeight: 700 }}>≈ {fmtTes(mp.tes)}</td>
              <td style={{ ...nameTd, color: 'var(--color-text)', fontSize: 12 }}>advisory</td>
            </tr>
            {rows.map((r) => {
              const dim = r.status === 'unmeasured' || r.status === 'pending';
              const tip = [
                r.source ? `source: ${r.source}` : 'unmeasured',
                r.asOf ? `as of ${r.asOf}` : null,
                `price: ${r.priceStatus}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                // Dimmed = de-emphasised via a muted (AA-contrast) text colour, NOT
                // opacity (which would drop text below WCAG contrast).
                <tr key={r.id} title={tip} style={dim ? { color: 'var(--color-muted)' } : undefined}>
                  <td style={nameTd}>
                    <strong>{r.name}</strong>{' '}
                    <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{r.vendor}</span>
                  </td>
                  <td style={nameTd}>
                    <span style={chipStyle(tierColor(r.tier), r.tier == null)}>{r.tier ?? '—'}</span>
                  </td>
                  <td style={numTd}>{fmtScore(r.score)}</td>
                  <td style={numTd}>
                    {r.priceStatus === 'free' ? (
                      <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>FREE</span>
                    ) : (
                      fmtUsd(r.inP)
                    )}
                  </td>
                  <td style={numTd}>
                    {r.priceStatus === 'free' ? (
                      <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>FREE</span>
                    ) : (
                      fmtUsd(r.outP)
                    )}
                  </td>
                  <td style={numTd}>{fmtUsd(r.blended)}</td>
                  <td style={{ ...numTd, fontWeight: r.tes != null ? 700 : 400 }}>{fmtTes(r.tes)}</td>
                  <td style={{ ...nameTd, fontSize: 12, color: 'var(--color-muted)' }}>{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Block 2 — Cost×quality frontier (pure SVG) ───────────────────────────────
function Frontier({
  category,
  rows,
  mp,
}: {
  category: string;
  rows: Row[];
  mp: RankingsPayload['mooter_point'];
}) {
  // Points need BOTH a score (for this category) and a blended price.
  const pts = rows
    .filter((r) => r.score != null && r.blended != null)
    .map((r) => ({
      name: r.name,
      x: r.blended as number,
      y: r.score as number,
      routed: r.routed,
      mooter: false,
    }));
  const mooterPt = { name: 'Mooter', x: mp.blended_3to1, y: mp.score, routed: true, mooter: true };
  const all = [...pts, mooterPt];

  const scoredNoPrice = rows.filter((r) => r.score != null && r.blended == null).length;

  const W = 820;
  const H = 460;
  const M = { l: 64, r: 24, t: 24, b: 54 };
  const xmax = Math.max(12, ...all.map((p) => p.x)) * 1.08;
  const ymax = 1;
  const sx = (v: number) => M.l + (v / xmax) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - (v / ymax) * (H - M.t - M.b);

  // Pareto frontier: not dominated (no other point cheaper AND higher quality).
  const pareto = all
    .filter((p) => !all.some((o) => o !== p && o.x <= p.x && o.y >= p.y && (o.x < p.x || o.y > p.y)))
    .sort((a, b) => a.x - b.x);

  const xticks = [];
  for (let g = 0; g <= xmax; g += xmax > 16 ? 4 : 2) xticks.push(Math.round(g));

  return (
    <section style={S.section} aria-labelledby="fr-h">
      <div style={{ marginBottom: 14 }}>
        <h2 id="fr-h" style={S.sheadH}>
          Cost × quality frontier 🔥
        </h2>
        <p style={S.sheadP}>
          Top-left = best (high quality, low cost) for <span style={S.pill}>{category}</span>. The
          Mooter point lives where no single model reaches.
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`Scatter of cost (x, $/M blended) versus quality score (y) for ${category}. The Mooter routing point sits at $${mp.blended_3to1} per million tokens with score ${(mp.score * 100).toFixed(0)}.`}
      >
        {/* gridlines + x ticks */}
        {xticks.map((g) => (
          <g key={`x${g}`}>
            <line x1={sx(g)} y1={M.t} x2={sx(g)} y2={H - M.b} stroke="rgba(242,237,230,0.05)" />
            <text x={sx(g)} y={H - M.b + 16} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--mono)" fontSize={10}>
              ${g}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={`y${g}`}>
            <line x1={M.l} y1={sy(g)} x2={W - M.r} y2={sy(g)} stroke="rgba(242,237,230,0.05)" />
            <text x={M.l - 10} y={sy(g) + 3} textAnchor="end" fill="var(--color-muted)" fontFamily="var(--mono)" fontSize={10}>
              {(g * 100).toFixed(0)}
            </text>
          </g>
        ))}
        <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--color-border)" />
        <line x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} stroke="var(--color-border)" />
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font)" fontSize={12} fontWeight={600}>
          $/M tokens (blended 3:1) — cheaper →
        </text>
        <text transform={`translate(16,${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font)" fontSize={12} fontWeight={600}>
          Quality score — better ↑
        </text>
        <text x={M.l + 8} y={M.t + 14} fill="var(--color-muted)" fontFamily="var(--font)" fontSize={10.5}>
          ↖ better
        </text>

        {/* Pareto frontier line */}
        {pareto.length > 1 && (
          <polyline
            points={pareto.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            opacity={0.55}
          />
        )}

        {/* points */}
        {all.map((p) => {
          const color = p.mooter ? 'var(--color-green)' : p.routed ? 'var(--color-accent)' : 'var(--color-muted)';
          const r = p.mooter ? 9 : 6;
          return (
            <g key={p.name}>
              {p.mooter && (
                <circle cx={sx(p.x)} cy={sy(p.y)} r={16} fill="none" stroke="var(--color-green)" strokeWidth={1.5} opacity={0.5} strokeDasharray="3 3" />
              )}
              <circle cx={sx(p.x)} cy={sy(p.y)} r={r} fill={color}>
                <title>{`${p.mooter ? '🐮 ' : ''}${p.name}: $${p.x.toFixed(2)}/M · score ${(p.y * 100).toFixed(1)}${p.mooter ? ' (advisory estimate — not a benchmark)' : ''}`}</title>
              </circle>
              <text
                x={sx(p.x) + (p.x > xmax * 0.8 ? -10 : 11)}
                y={sy(p.y) - (p.mooter ? 14 : 4)}
                textAnchor={p.x > xmax * 0.8 ? 'end' : 'start'}
                fill={p.mooter ? 'var(--color-green)' : 'var(--color-muted)'}
                fontFamily="var(--font)"
                fontSize={10.5}
                fontWeight={p.mooter ? 700 : 400}
              >
                {p.mooter ? '🐮 Mooter' : p.name.replace('Claude ', '')}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}>
        <Legend color="var(--color-green)" label="Mooter (routing, advisory)" />
        <Legend color="var(--color-accent)" label="routed by Mooter" />
        <Legend color="var(--color-muted)" label="comparison (not routed)" />
        <span>— — Pareto frontier</span>
      </div>
      {(pts.length === 0 || scoredNoPrice > 0) && (
        <p style={{ ...S.muted, marginTop: 10 }}>
          {pts.length === 0
            ? 'No model has both a measured score and a known price for this category yet — only the Mooter point is plotted. '
            : ''}
          {scoredNoPrice > 0
            ? `${scoredNoPrice} model(s) are scored here but their price is still pending, so they cannot be placed on the cost axis (shown as pending in the table above).`
            : ''}
        </p>
      )}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

// ── Block 3 — 17×24 heatmap ──────────────────────────────────────────────────
function shortModel(m: string): string {
  return m.replace(/^claude-/, '');
}
function shortCategory(c: string): string {
  const dot = c.indexOf('.');
  return dot >= 0 ? c.slice(dot + 1) : c;
}
function Heatmap({ data }: { data: RankingsPayload }) {
  const cellByKey = new Map(data.cells.map((c) => [`${c.model}|${c.category}`, c]));
  return (
    <section style={S.section} aria-labelledby="hm-h">
      <div style={{ marginBottom: 14 }}>
        <h2 id="hm-h" style={S.sheadH}>
          Specialization heatmap — {data.models.length}×{data.categories.length}
        </h2>
        <p style={S.sheadP}>
          TES per (model, category). {data.coverage.measured_cells} of {data.coverage.total_cells}{' '}
          cells measured · a <span style={S.pill}>·</span> is honestly pending, never a fabricated
          value.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--color-surface)' }} />
              {data.categories.map((c) => (
                <th
                  key={c}
                  scope="col"
                  title={c}
                  style={{ padding: '2px 3px', color: 'var(--color-muted)', whiteSpace: 'nowrap', fontWeight: 400 }}
                >
                  {shortCategory(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.models.map((m) => (
              <tr key={m.id}>
                <th
                  scope="row"
                  style={{
                    textAlign: 'right',
                    padding: '2px 8px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--color-text)',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    left: 0,
                    background: 'var(--color-surface)',
                  }}
                >
                  {shortModel(m.id)}
                </th>
                {data.categories.map((cat) => {
                  const cell = cellByKey.get(`${m.id}|${cat}`);
                  const bucket = tesBucket(cell?.tes ?? null);
                  const pending = !cell || cell.tes == null;
                  const tip = cell
                    ? `${m.id} · ${cat}: ${pending ? `pending (${cell.status})` : `TES ${Math.round(cell.tes as number)}`}${cell.source ? ` · ${cell.source}` : ''}${cell.as_of ? ` · ${cell.as_of}` : ''}`
                    : `${m.id} · ${cat}: pending`;
                  return (
                    <td key={cat} style={{ padding: 1 }}>
                      <div
                        title={tip}
                        aria-label={tip}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 3,
                          background: heatColor(bucket),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: pending ? 'var(--color-muted)' : 'var(--color-text)',
                          fontSize: 10,
                        }}
                      >
                        {pending ? '·' : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', ...S.muted }}>
        {(['high', 'mid', 'low', 'pending'] as const).map((b) => (
          <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(b), display: 'inline-block' }} />
            {b}
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Block 4 — Bench accuracy & savings ───────────────────────────────────────
function BenchPanel({
  bench,
  coverage,
}: {
  bench: BenchSnapshot;
  coverage: RankingsPayload['coverage'];
}) {
  return (
    <section style={S.section} aria-labelledby="bn-h">
      <div style={{ marginBottom: 14 }}>
        <h2 id="bn-h" style={S.sheadH}>
          Routing accuracy &amp; savings
        </h2>
        <p style={S.sheadP}>
          From <span style={S.pill}>mooter benchmark run</span> over {bench.total} synthetic
          workflows with the frozen classifier. Deterministic, sha-pinned — reproducible.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <BenchStat big={`${(bench.accuracy * 100).toFixed(0)}%`} lbl={`routing accuracy (N=${bench.total})`} />
        <BenchStat big={`${bench.est_savings_pct}%`} lbl="estimated savings vs all-Opus" tone />
        <BenchStat big={`${coverage.measured_cells}`} lbl={`measured matrix cells of ${coverage.total_cells}`} />
      </div>
      <p style={{ ...S.muted, marginTop: 14 }}>
        Classifier sha256 <span style={S.pill}>{bench.classifier_sha256.slice(0, 16)}…</span> · cohort{' '}
        {bench.cohort_label} · generated {bench.generated_at.slice(0, 10)}.
      </p>
      <ul style={{ ...S.muted, marginTop: 8, paddingLeft: 18 }}>
        {bench.honest_caveats.map((c) => (
          <li key={c} style={{ marginBottom: 2 }}>
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BenchStat({ big, lbl, tone }: { big: string; lbl: string; tone?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '14px 18px',
        minWidth: 160,
      }}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, color: tone ? 'var(--color-green)' : 'var(--color-text)' }}>
        {big}
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 2 }}>{lbl}</div>
    </div>
  );
}
