'use client';

import { useEffect, useState } from 'react';

type CommunityStats = {
  total_events?: number;
  unique_instances?: number;
  tier_distribution?: Record<string, number>;
  top_categories?: Array<{ category: string; count: number }>;
  period?: string;
  error?: string;
};

function fmtPct(n: number): string {
  return `${(n ?? 0).toFixed(1)}%`;
}

const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

export default function CommunityPage() {
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [localTiers, setLocalTiers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/community', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/metrics', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([community, metrics]) => {
        if (community.error) setError(community.error);
        else setStats(community);
        if (metrics.pct_by_tier) setLocalTiers(metrics.pct_by_tier);
      })
      .catch((err) => setError(`fetch failed: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="empty">Loading community stats...</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <section>
        <h2>Community hub</h2>
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Total events</div>
            <div className="kpi-value">{stats?.total_events ?? '-'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Unique instances</div>
            <div className="kpi-value">{stats?.unique_instances ?? '-'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Period</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{stats?.period ?? '-'}</div>
          </div>
        </div>
      </section>

      <section>
        <h2>Tier distribution: community vs local</h2>
        <div className="card">
          <table className="decisions">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Community</th>
                <th>Local</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const community = stats?.tier_distribution?.[t] ?? 0;
                const local = localTiers[t] ?? 0;
                const delta = local - community;
                return (
                  <tr key={t}>
                    <td><span className={`chip ${t}`}>{t}</span></td>
                    <td>{fmtPct(community)}</td>
                    <td>{fmtPct(local)}</td>
                    <td style={{ color: delta > 5 ? 'var(--warn)' : delta < -5 ? 'var(--t0)' : 'var(--fg-dim)' }}>
                      {delta > 0 ? '+' : ''}{fmtPct(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {stats?.top_categories && stats.top_categories.length > 0 && (
        <section>
          <h2>Top categories</h2>
          <div className="card">
            <table className="decisions">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_categories.map((c, i) => (
                  <tr key={i}>
                    <td>{c.category}</td>
                    <td>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
