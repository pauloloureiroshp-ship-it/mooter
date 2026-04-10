/**
 * anomaly.js — detects anomalies in aggregated data.
 *
 * Called by the hourly aggregate job. Compares current stats against
 * baselines and inserts anomaly records when thresholds are exceeded.
 */

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function detectAnomalies(db, env) {
  const anomalies = [];
  const now = new Date().toISOString();
  const accuracyThreshold = parseFloat(env.ACCURACY_DROP_THRESHOLD || '0.15');
  const modelThreshold = parseInt(env.NEW_MODEL_THRESHOLD || '10', 10);

  // 1. New models above threshold, not yet notified
  const newModels = await db.prepare(`
    SELECT model_name, mention_count, hw_tiers, first_seen
    FROM model_signals
    WHERE status = 'pending'
      AND mention_count >= ?
      AND paulo_notified = 0
  `).bind(modelThreshold).all();

  for (const m of (newModels.results || [])) {
    anomalies.push({
      id: uuid(),
      detected_at: now,
      type: 'new_model',
      severity: 'info',
      description: `Model "${m.model_name}" detected in ${m.mention_count} deltas since ${m.first_seen}`,
      payload: JSON.stringify({
        model_name: m.model_name,
        mention_count: m.mention_count,
        hw_tiers: m.hw_tiers,
        first_seen: m.first_seen,
      }),
    });

    await db.prepare(
      'UPDATE model_signals SET paulo_notified = 1 WHERE model_name = ?'
    ).bind(m.model_name).run();
  }

  // 2. Accuracy drop: compare last 24h followup_rate vs 7-day baseline
  const recent = await db.prepare(`
    SELECT AVG(avg_followup) as recent_followup
    FROM aggregated_stats
    WHERE period = 'hourly'
      AND period_start > datetime('now', '-24 hours')
  `).first();

  const baseline = await db.prepare(`
    SELECT AVG(avg_followup) as baseline_followup
    FROM aggregated_stats
    WHERE period = 'daily'
      AND period_start > datetime('now', '-7 days')
  `).first();

  if (recent && baseline && baseline.baseline_followup > 0) {
    const increase = (recent.recent_followup - baseline.baseline_followup) / baseline.baseline_followup;
    if (increase > accuracyThreshold) {
      anomalies.push({
        id: uuid(),
        detected_at: now,
        type: 'accuracy_drop',
        severity: 'warning',
        description: `Followup rate increased by ${(increase * 100).toFixed(1)}% vs 7-day baseline (${baseline.baseline_followup.toFixed(3)} → ${recent.recent_followup.toFixed(3)})`,
        payload: JSON.stringify({
          recent: recent.recent_followup,
          baseline: baseline.baseline_followup,
          increase_pct: increase,
        }),
      });
    }
  }

  // 3. No deltas in 48h
  const lastDelta = await db.prepare(`
    SELECT received_at FROM deltas ORDER BY received_at DESC LIMIT 1
  `).first();

  if (lastDelta) {
    const age = Date.now() - new Date(lastDelta.received_at).getTime();
    if (age > 48 * 60 * 60 * 1000) {
      anomalies.push({
        id: uuid(),
        detected_at: now,
        type: 'hub_stale',
        severity: 'critical',
        description: `No deltas received in ${Math.round(age / 3600000)}h`,
        payload: JSON.stringify({ last_received: lastDelta.received_at, age_hours: Math.round(age / 3600000) }),
      });
    }
  }

  // Insert all anomalies
  for (const a of anomalies) {
    await db.prepare(`
      INSERT INTO anomalies (id, detected_at, type, severity, description, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(a.id, a.detected_at, a.type, a.severity, a.description, a.payload || null).run();
  }

  return anomalies;
}

export { detectAnomalies, uuid };
