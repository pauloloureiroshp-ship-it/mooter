'use client';

/**
 * page.tsx — frugal dashboard main view.
 *
 * Single-page dashboard. All state is client-side, fetched from our own
 * API routes (never the tracker directly). Auto-refreshes every 10s.
 *
 * Sections:
 *   1. KPI tiles (prompts, saved, pct, avg/prompt)
 *   2. Tier distribution bar
 *   3. Decisions table with filters (window, tier, category, confidence)
 *   4. Cost trend SVG (last 24h/7d/30d)
 *   5. Tuning preview with pattern explainer
 *   6. Retrain button
 *
 * Success criteria: debug any misrouting in < 30 s without grep.
 */

import { useEffect, useMemo, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────
type Metrics = {
  prompts: number;
  real_cost: number;
  naive_cost: number;
  saved: number;
  saved_pct: number;
  avg_saved_per_prompt: number;
  by_tier: Record<string, number>;
  pct_by_tier: Record<string, number>;
  cost_by_tier: Record<string, number>;
  arbiter?: {
    calls_total: number;
    cache_hit_rate: number;
    high_risk_refused: number;
    cost_usd: number;
    avg_latency_ms: number;
  };
  error?: string;
  hint?: string;
};

type Decision = {
  ts: string;
  ts_ms?: number;
  tier?: string;
  task_category?: string;
  prompt_len?: number;
  prompt_preview?: string;
  confidence?: number;
  recommended_model?: string;
  escalation_rule?: string;
  arbiter_honored?: boolean | null;
};

type TuningEntry = { pattern: string; explanation: string };
type Tuning = {
  generated_at?: string;
  sample_size?: number;
  complexity_threshold?: number;
  promote: TuningEntry[];
  demote: TuningEntry[];
  notes: string[];
  error?: string;
  hint?: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;
const MODEL_BY_TIER: Record<string, string> = {
  T0: 'qwen',
  T1: 'hku',
  T2: 'son',
  T3: 'ops',
};

function fmtUsd(n: number): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n ?? 0).toFixed(1)}%`;
}

function fmtAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tuning, setTuning] = useState<Tuning | null>(null);
  const [windowKey, setWindowKey] = useState('24h');
  const [tier, setTier] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [minConf, setMinConf] = useState(0);
  const [maxConf, setMaxConf] = useState(1);
  const [retrainBusy, setRetrainBusy] = useState(false);
  const [retrainOutput, setRetrainOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch metrics + tuning once (and every 10s)
  useEffect(() => {
    const loadTop = async () => {
      try {
        const [m, t] = await Promise.all([
          fetch('/api/metrics', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/tuning', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        setMetrics(m);
        setTuning(t);
        if (m.error) setError(`${m.error}${m.hint ? ' — ' + m.hint : ''}`);
        else setError(null);
      } catch (err) {
        setError(`metrics fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    loadTop();
    const iv = setInterval(loadTop, 10_000);
    return () => clearInterval(iv);
  }, []);

  // Fetch decisions whenever filters change (debounced via effect)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('window', windowKey);
    if (tier) params.set('tier', tier);
    if (category) params.set('category', category);
    if (minConf > 0) params.set('min_conf', String(minConf));
    if (maxConf < 1) params.set('max_conf', String(maxConf));
    params.set('limit', '500');
    fetch(`/api/decisions?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setDecisions(data.decisions || []);
      })
      .catch((err) => setError(`decisions fetch failed: ${err.message}`));
  }, [windowKey, tier, category, minConf, maxConf]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of decisions) if (d.task_category) set.add(d.task_category);
    return [...set].sort();
  }, [decisions]);

  const costSeries = useMemo(() => buildCostSeries(decisions), [decisions]);

  async function runRetrain(dryRun: boolean) {
    setRetrainBusy(true);
    setRetrainOutput(null);
    try {
      const res = await fetch(`/api/retrain?dry_run=${dryRun}`, { method: 'POST' });
      const data = await res.json();
      setRetrainOutput(
        `— backtest —\n${data.backtest_stdout || '(empty)'}\n\n— update-router ${dryRun ? '--dry-run' : ''} —\n${data.update_stdout || '(empty)'}${data.update_stderr ? '\n\nSTDERR:\n' + data.update_stderr : ''}`
      );
    } catch (err) {
      setRetrainOutput(`retrain failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRetrainBusy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (error && !metrics) {
    return (
      <div className="error-banner">
        <strong>{error}</strong>
        <div style={{ marginTop: 8 }}>
          Start the tracker: <code>node ~/.claude/tools/router/savings-tracker.js</code>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {/* KPI tiles */}
      <section>
        <h2>Overview</h2>
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Prompts classified</div>
            <div className="kpi-value">{metrics?.prompts ?? '–'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Estimated saved</div>
            <div className="kpi-value" style={{ color: 'var(--t0)' }}>
              {metrics ? fmtUsd(metrics.saved) : '–'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Savings %</div>
            <div className="kpi-value">{metrics ? fmtPct(metrics.saved_pct) : '–'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Avg saved / prompt</div>
            <div className="kpi-value">
              {metrics ? `$${metrics.avg_saved_per_prompt?.toFixed(5) ?? '0'}` : '–'}
            </div>
          </div>
          {metrics?.arbiter && (
            <div className="kpi">
              <div className="kpi-label">Arbiter calls</div>
              <div className="kpi-value">
                {metrics.arbiter.calls_total}
                <span
                  style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 6 }}
                >
                  · {fmtPct(metrics.arbiter.cache_hit_rate * 100)} cache
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tier distribution */}
      <section>
        <h2>Tier distribution</h2>
        <div className="dist-bar">
          {TIERS.map((t) => {
            const pct = metrics?.pct_by_tier?.[t] ?? 0;
            return (
              <div
                key={t}
                className={`dist-seg ${t}`}
                style={{ flex: Math.max(1, pct), opacity: pct > 0 ? 1 : 0.15 }}
                title={`${t} ${MODEL_BY_TIER[t]} — ${fmtPct(pct)}`}
              >
                {pct > 3 ? `${t} ${Math.round(pct)}%` : ''}
              </div>
            );
          })}
        </div>
      </section>

      {/* Decisions + filters */}
      <section>
        <h2>Decisions</h2>
        <div className="filters">
          <label>window</label>
          <select value={windowKey} onChange={(e) => setWindowKey(e.target.value)}>
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="all">all</option>
          </select>

          <label>tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">all</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label>category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">all</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label>conf ≥</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={minConf}
            onChange={(e) => setMinConf(parseFloat(e.target.value) || 0)}
            style={{ width: 70 }}
          />

          <label>conf ≤</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={maxConf}
            onChange={(e) => setMaxConf(parseFloat(e.target.value) || 1)}
            style={{ width: 70 }}
          />

          <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 11 }}>
            {decisions.length} shown
          </span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 480 }}>
          {decisions.length === 0 ? (
            <div className="empty">no decisions in window</div>
          ) : (
            <table className="decisions">
              <thead>
                <tr>
                  <th>ago</th>
                  <th>tier</th>
                  <th>category</th>
                  <th>conf</th>
                  <th>len</th>
                  <th>preview</th>
                  <th>esc</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d, i) => (
                  <tr key={i}>
                    <td>{d.ts_ms ? fmtAgo(d.ts_ms) : '–'}</td>
                    <td>
                      <span className={`chip ${d.tier}`}>{d.tier}</span>
                    </td>
                    <td>{d.task_category}</td>
                    <td>{d.confidence?.toFixed(2)}</td>
                    <td>{d.prompt_len}</td>
                    <td className="preview" title={d.prompt_preview}>
                      {d.prompt_preview}
                    </td>
                    <td style={{ color: 'var(--fg-dim)' }}>
                      {d.escalation_rule && d.escalation_rule !== 'none'
                        ? d.escalation_rule
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Cost trend */}
      <section>
        <h2>Cost trend ({windowKey})</h2>
        <div className="card">
          {costSeries.points.length < 2 ? (
            <div className="empty">not enough data for a trend</div>
          ) : (
            <CostTrendSvg data={costSeries} />
          )}
        </div>
      </section>

      {/* Tuning preview */}
      <section>
        <h2>Router tuning</h2>
        <div className="card">
          {!tuning || tuning.error ? (
            <div className="empty">
              {tuning?.error || 'No router-tuning.json yet. Run backtest first.'}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginBottom: 12,
                  color: 'var(--fg-dim)',
                  fontSize: 11,
                  fontFamily: 'var(--mono)',
                }}
              >
                <span>generated: {tuning.generated_at?.slice(0, 19)}</span>
                <span>sample: {tuning.sample_size}</span>
                <span>threshold: {tuning.complexity_threshold}</span>
              </div>
              <div className="row">
                <div className="col">
                  <h2>Demote (→ lower tier)</h2>
                  {tuning.demote.length === 0 ? (
                    <div className="empty">(none)</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {tuning.demote.map((e, i) => (
                        <li
                          key={i}
                          style={{
                            padding: '8px 10px',
                            borderBottom: '1px solid var(--border)',
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ color: 'var(--t2)' }}>{e.pattern}</div>
                          <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                            {e.explanation}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="col">
                  <h2>Promote to T0</h2>
                  {tuning.promote.length === 0 ? (
                    <div className="empty">(none)</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {tuning.promote.map((e, i) => (
                        <li
                          key={i}
                          style={{
                            padding: '8px 10px',
                            borderBottom: '1px solid var(--border)',
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ color: 'var(--t0)' }}>{e.pattern}</div>
                          <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                            {e.explanation}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {tuning.notes.length > 0 && (
                <pre style={{ marginTop: 16 }}>{tuning.notes.join('\n')}</pre>
              )}
            </>
          )}
        </div>
      </section>

      {/* Retrain */}
      <section>
        <h2>Retrain</h2>
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="ghost"
              disabled={retrainBusy}
              onClick={() => runRetrain(true)}
            >
              {retrainBusy ? 'Running…' : 'Preview (--dry-run)'}
            </button>
            <button
              className="primary"
              disabled={retrainBusy}
              onClick={() => runRetrain(false)}
            >
              {retrainBusy ? 'Running…' : 'Retrain now'}
            </button>
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
              Runs <code>backtest.js</code> → <code>update-router.js</code>. Preview
              shows the block without writing.
            </span>
          </div>
          {retrainOutput && <pre style={{ marginTop: 12 }}>{retrainOutput}</pre>}
        </div>
      </section>
    </>
  );
}

// ── Cost trend chart (plain SVG, no chart lib) ──────────────────────────────
type SeriesPoint = { t: number; real: number; naive: number };
type CostSeries = { points: SeriesPoint[]; realTotal: number; naiveTotal: number };

// Naive cost model for a tier (rough — matches backtest.js TIER_COST).
const TIER_COST: Record<string, number> = { T0: 0, T1: 0.002, T2: 0.008, T3: 0.045 };
const NAIVE_PER_PROMPT = TIER_COST.T3;

function buildCostSeries(decisions: Decision[]): CostSeries {
  if (decisions.length === 0) return { points: [], realTotal: 0, naiveTotal: 0 };
  // Bucket decisions into 30 equal buckets across the window.
  const sorted = decisions
    .filter((d) => d.ts_ms)
    .sort((a, b) => (a.ts_ms || 0) - (b.ts_ms || 0));
  if (sorted.length === 0) return { points: [], realTotal: 0, naiveTotal: 0 };
  const tMin = sorted[0].ts_ms!;
  const tMax = sorted[sorted.length - 1].ts_ms!;
  const span = Math.max(1, tMax - tMin);
  const buckets = 30;
  const bucketMs = span / buckets;
  const pts: SeriesPoint[] = Array.from({ length: buckets }, (_, i) => ({
    t: tMin + i * bucketMs,
    real: 0,
    naive: 0,
  }));
  let realTotal = 0;
  let naiveTotal = 0;
  for (const d of sorted) {
    const idx = Math.min(buckets - 1, Math.floor(((d.ts_ms! - tMin) / span) * buckets));
    const r = TIER_COST[d.tier || 'T3'] ?? 0;
    pts[idx].real += r;
    pts[idx].naive += NAIVE_PER_PROMPT;
    realTotal += r;
    naiveTotal += NAIVE_PER_PROMPT;
  }
  // Cumulative
  for (let i = 1; i < pts.length; i++) {
    pts[i].real += pts[i - 1].real;
    pts[i].naive += pts[i - 1].naive;
  }
  return { points: pts, realTotal, naiveTotal };
}

function CostTrendSvg({ data }: { data: CostSeries }) {
  const W = 900;
  const H = 220;
  const P = 30; // padding
  const maxY = Math.max(data.naiveTotal, 0.001);
  const xOf = (i: number) => P + (i / (data.points.length - 1)) * (W - P * 2);
  const yOf = (v: number) => H - P - (v / maxY) * (H - P * 2);

  const pathReal = data.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.real).toFixed(1)}`)
    .join(' ');
  const pathNaive = data.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.naive).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* grid */}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#252220" strokeWidth="1" />
      <line x1={P} y1={P} x2={P} y2={H - P} stroke="#252220" strokeWidth="1" />

      {/* naive (baseline) — terracotta = expensive all-Opus */}
      <path d={pathNaive} fill="none" stroke="#D46A5A" strokeWidth="2" strokeDasharray="4 4" />
      {/* real — green = the saved path */}
      <path d={pathReal} fill="none" stroke="#4CAF6A" strokeWidth="2.5" />

      {/* labels */}
      <text x={W - P} y={yOf(data.naiveTotal) - 6} fill="#D46A5A" fontSize="11" textAnchor="end" fontFamily="monospace">
        naive Opus ${data.naiveTotal.toFixed(3)}
      </text>
      <text x={W - P} y={yOf(data.realTotal) - 6} fill="#4CAF6A" fontSize="11" textAnchor="end" fontFamily="monospace">
        frugal ${data.realTotal.toFixed(3)}
      </text>
    </svg>
  );
}
