/**
 * update-profiles.js — daily cron job.
 *
 * Aggregates mooter_events into user_profiles for per-instance
 * performance tracking, cohort analysis, and personalized routing.
 *
 * Runs as part of the Cloudflare Worker scheduled() handler.
 * Designed for < 50k events — uses simple SQL aggregation.
 */

export async function runUpdateProfiles(env) {
  const db = env.DB;

  // Upsert user_profiles from mooter_events (via frugal_events table).
  // Uses INSERT OR REPLACE — each run produces a fresh snapshot.
  const profiles = await db.prepare(`
    SELECT
      instance_id,
      MIN(event_date) as first_seen,
      MAX(event_date) as last_seen,
      COUNT(*) as total_decisions,
      COUNT(DISTINCT event_date || '-' || session_hour) as total_sessions,

      -- Tier distribution
      ROUND(100.0 * SUM(CASE WHEN decided_tier = 'T0' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_t0,
      ROUND(100.0 * SUM(CASE WHEN decided_tier = 'T1' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_t1,
      ROUND(100.0 * SUM(CASE WHEN decided_tier = 'T2' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_t2,
      ROUND(100.0 * SUM(CASE WHEN decided_tier = 'T3' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_t3,

      -- Quality
      ROUND(AVG(outcome_score), 3) as avg_outcome_score,
      SUM(CASE WHEN explicit_rating IS NOT NULL THEN 1 ELSE 0 END) as explicit_feedback_count,
      ROUND(100.0 * SUM(CASE WHEN explicit_rating > 0 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN explicit_rating IS NOT NULL THEN 1 ELSE 0 END), 0), 1) as positive_feedback_pct,

      -- Savings
      ROUND(SUM(COALESCE(per_decision_savings_usd, 0)), 2) as total_savings_usd,
      ROUND(AVG(COALESCE(per_decision_savings_usd, 0)), 4) as avg_savings_per_decision,

      -- Environment (latest values via MAX — works because these don't change often)
      MAX(hardware_tier) as hardware_tier,

      -- Complexity
      ROUND(AVG(prompt_complexity_score), 3) as avg_prompt_complexity,

      -- Accuracy (% of labeled decisions with positive outcome)
      ROUND(100.0 * SUM(CASE WHEN outcome_score >= 0.3 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0), 1) as algorithm_accuracy

    FROM frugal_events
    GROUP BY instance_id
  `).all();

  if (!profiles?.results?.length) {
    return { updated: 0, skipped: 'no_events' };
  }

  // Build top_categories per instance (separate query — SQLite can't do this inline easily)
  const categories = await db.prepare(`
    SELECT instance_id, task_category, COUNT(*) as cnt
    FROM frugal_events
    GROUP BY instance_id, task_category
    ORDER BY instance_id, cnt DESC
  `).all();

  // Build a map: instance_id → top 5 categories
  const catMap = new Map();
  for (const r of (categories?.results || [])) {
    if (!catMap.has(r.instance_id)) catMap.set(r.instance_id, []);
    const arr = catMap.get(r.instance_id);
    if (arr.length < 5) arr.push({ cat: r.task_category, cnt: r.cnt });
  }

  // Complexity bucket mapping
  function complexityBucket(score) {
    if (score == null) return 'unknown';
    if (score < 0.05) return 'beginner';
    if (score < 0.12) return 'intermediate';
    if (score < 0.25) return 'advanced';
    return 'expert';
  }

  // Worst category: find category with lowest accuracy for each instance
  const worstCats = await db.prepare(`
    SELECT instance_id, task_category,
      ROUND(100.0 * SUM(CASE WHEN outcome_score >= 0.3 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0), 1) as acc
    FROM frugal_events
    WHERE outcome_score IS NOT NULL
    GROUP BY instance_id, task_category
    HAVING COUNT(*) >= 3
    ORDER BY instance_id, acc ASC
  `).all();

  const worstMap = new Map();
  for (const r of (worstCats?.results || [])) {
    if (!worstMap.has(r.instance_id)) worstMap.set(r.instance_id, r.task_category);
  }

  const now = new Date().toISOString();
  const batch = [];
  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO user_profiles (
      instance_id, first_seen, last_seen,
      total_decisions, total_sessions,
      pct_t0, pct_t1, pct_t2, pct_t3,
      top_categories,
      avg_outcome_score, explicit_feedback_count, positive_feedback_pct,
      total_savings_usd, avg_savings_per_decision,
      hardware_tier, has_ollama, has_api_key,
      avg_prompt_complexity, complexity_bucket,
      algorithm_accuracy, worst_category,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of profiles.results) {
    const topCats = catMap.get(p.instance_id) || [];
    const totalCnt = topCats.reduce((s, c) => s + c.cnt, 0) || p.total_decisions;
    const topCatsJson = JSON.stringify(topCats.map(c => ({
      cat: c.cat,
      pct: +(c.cnt / totalCnt).toFixed(3),
    })));

    batch.push(upsertStmt.bind(
      p.instance_id, p.first_seen, p.last_seen,
      p.total_decisions, p.total_sessions,
      p.pct_t0, p.pct_t1, p.pct_t2, p.pct_t3,
      topCatsJson,
      p.avg_outcome_score, p.explicit_feedback_count, p.positive_feedback_pct,
      p.total_savings_usd, p.avg_savings_per_decision,
      p.hardware_tier, null, null, // has_ollama/has_api_key not available from events
      p.avg_prompt_complexity, complexityBucket(p.avg_prompt_complexity),
      p.algorithm_accuracy, worstMap.get(p.instance_id) || null,
      now
    ));
  }

  if (batch.length > 0) {
    await db.batch(batch);
  }

  return { updated: batch.length, ts: now };
}
