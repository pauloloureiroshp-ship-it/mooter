'use client';

import { useEffect, useMemo, useState } from 'react';

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

const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

function fmtAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export default function MisroutesPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [windowKey, setWindowKey] = useState('7d');
  const [tier, setTier] = useState('');
  const [category, setCategory] = useState('');
  const [confThreshold, setConfThreshold] = useState(0.65);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('window', windowKey);
    if (tier) params.set('tier', tier);
    if (category) params.set('category', category);
    params.set('min_conf', '0');
    params.set('max_conf', String(confThreshold));
    params.set('limit', '500');
    fetch(`/api/decisions?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setDecisions(data.decisions || []);
          setError(null);
        }
      })
      .catch((err) => setError(`fetch failed: ${err.message}`));
  }, [windowKey, tier, category, confThreshold]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of decisions) if (d.task_category) set.add(d.task_category);
    return [...set].sort();
  }, [decisions]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of decisions) {
      const t = d.tier || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [decisions]);

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <section>
        <h2>Misroutes (confidence &lt; threshold)</h2>
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
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <label>category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">all</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label>conf &le;</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={confThreshold}
            onChange={(e) => setConfThreshold(parseFloat(e.target.value) || 0.65)}
            style={{ width: 70 }}
          />

          <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 11 }}>
            {decisions.length} suspect decisions
          </span>
        </div>
      </section>

      <section>
        <h2>Breakdown by tier</h2>
        <div className="kpi-grid">
          {TIERS.map((t) => (
            <div className="kpi" key={t}>
              <div className="kpi-label">{t}</div>
              <div className="kpi-value">
                <span className={`chip ${t}`}>{tierCounts[t] || 0}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 600 }}>
          {decisions.length === 0 ? (
            <div className="empty">No misroutes found in this window. Good routing!</div>
          ) : (
            <table className="decisions">
              <thead>
                <tr>
                  <th>ago</th>
                  <th>tier</th>
                  <th>category</th>
                  <th>conf</th>
                  <th>len</th>
                  <th>model</th>
                  <th>escalation</th>
                  <th>preview</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d, i) => (
                  <tr key={i} style={{ background: (d.confidence ?? 1) < 0.5 ? '#2a131320' : undefined }}>
                    <td>{d.ts_ms ? fmtAgo(d.ts_ms) : '-'}</td>
                    <td><span className={`chip ${d.tier}`}>{d.tier}</span></td>
                    <td>{d.task_category}</td>
                    <td style={{ color: (d.confidence ?? 1) < 0.5 ? 'var(--danger)' : 'var(--warn)' }}>
                      {d.confidence?.toFixed(2)}
                    </td>
                    <td>{d.prompt_len}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                      {d.recommended_model || '-'}
                    </td>
                    <td style={{ color: 'var(--fg-dim)' }}>
                      {d.escalation_rule && d.escalation_rule !== 'none' ? d.escalation_rule : ''}
                    </td>
                    <td className="preview" title={d.prompt_preview}>
                      {d.prompt_preview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
