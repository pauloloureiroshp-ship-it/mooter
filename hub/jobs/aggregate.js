/**
 * aggregate.js — hourly cron job.
 *
 * Aggregates recent deltas into aggregated_stats rows by hw_tier and
 * sub_profile. Also runs anomaly detection after aggregation.
 */

import { detectAnomalies } from '../lib/anomaly.js';

async function runAggregate(env) {
  const db = env.DB;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();

  // Aggregate deltas from the last hour
  const rows = await db.prepare(`
    SELECT
      hw_tier,
      sub_profile,
      COUNT(*) as sample_count,
      AVG(json_extract(tier_distribution, '$.t0')) as avg_t0,
      AVG(json_extract(tier_distribution, '$.t2')) as avg_t2,
      AVG(json_extract(tier_distribution, '$.t3')) as avg_t3,
      AVG(json_extract(feedback_signals, '$.followup_rate')) as avg_followup
    FROM deltas
    WHERE received_at > datetime('now', '-1 hour')
      AND trust_score >= ?
    GROUP BY hw_tier, sub_profile
  `).bind(parseFloat(env.MIN_TRUST_SCORE || '0.4')).all();

  for (const row of (rows.results || [])) {
    // Estimate savings: 1 - weighted cost ratio
    const avgSavings = 1 - (
      (row.avg_t0 || 0) * 0 +
      (row.avg_t2 || 0) * 0.178 +
      (row.avg_t3 || 0) * 1.0
    );

    await db.prepare(`
      INSERT OR REPLACE INTO aggregated_stats
        (period, period_start, hw_tier, sub_profile, sample_count,
         avg_t0_rate, avg_t2_rate, avg_t3_rate, avg_savings, avg_followup)
      VALUES ('hourly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      periodStart, row.hw_tier, row.sub_profile, row.sample_count,
      row.avg_t0 || 0, row.avg_t2 || 0, row.avg_t3 || 0,
      avgSavings, row.avg_followup || 0
    ).run();
  }

  // Run anomaly detection after aggregation
  await detectAnomalies(db, env);
}

export { runAggregate };
