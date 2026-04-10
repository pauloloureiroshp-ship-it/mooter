/**
 * notify.js — weekly cron job + on-demand anomaly notifier.
 *
 * Sends pending anomalies to Paulo via webhook. Also prunes expired
 * deltas and old aggregated_stats to keep D1 lean.
 */

async function sendWebhook(url, payload) {
  if (!url) return false;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function runNotify(env) {
  const db = env.DB;
  const webhookUrl = env.PAULO_WEBHOOK_URL;

  // 1. Send pending anomalies
  const pending = await db.prepare(`
    SELECT id, detected_at, type, severity, description, payload
    FROM anomalies
    WHERE paulo_notified = 0
    ORDER BY severity DESC, detected_at ASC
    LIMIT 20
  `).all();

  for (const anomaly of (pending.results || [])) {
    const payload = {
      timestamp: anomaly.detected_at,
      type: anomaly.type,
      severity: anomaly.severity,
      title: formatTitle(anomaly.type, anomaly.severity),
      body: anomaly.description,
      data: anomaly.payload ? JSON.parse(anomaly.payload) : null,
    };

    const sent = await sendWebhook(webhookUrl, payload);
    if (sent) {
      await db.prepare(
        'UPDATE anomalies SET paulo_notified = 1 WHERE id = ?'
      ).bind(anomaly.id).run();
    }
  }

  // 2. Weekly summary
  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total_deltas,
      SUM(prompt_count) as total_prompts,
      AVG(trust_score) as avg_trust
    FROM deltas
    WHERE received_at > datetime('now', '-7 days')
  `).first();

  const newModels = await db.prepare(`
    SELECT COUNT(*) as count FROM model_signals
    WHERE first_seen > datetime('now', '-7 days')
  `).first();

  if (stats && stats.total_deltas > 0) {
    await sendWebhook(webhookUrl, {
      timestamp: new Date().toISOString(),
      type: 'weekly_summary',
      severity: 'info',
      title: 'frugal-hub weekly summary',
      body: `${stats.total_deltas} deltas, ${stats.total_prompts} prompts, avg trust ${(stats.avg_trust || 0).toFixed(3)}, ${newModels?.count || 0} new model signals`,
      data: {
        deltas: stats.total_deltas,
        prompts: stats.total_prompts,
        avg_trust: stats.avg_trust,
        new_models: newModels?.count || 0,
      },
    });
  }

  // 3. Prune expired deltas
  await db.prepare(
    "DELETE FROM deltas WHERE expires_at < datetime('now')"
  ).run();

  // 4. Prune old aggregated stats (keep 30 days of hourly, 90 days of daily)
  await db.prepare(
    "DELETE FROM aggregated_stats WHERE period = 'hourly' AND period_start < datetime('now', '-30 days')"
  ).run();
  await db.prepare(
    "DELETE FROM aggregated_stats WHERE period = 'daily' AND period_start < datetime('now', '-90 days')"
  ).run();

  // 5. Prune resolved anomalies older than 30 days
  await db.prepare(
    "DELETE FROM anomalies WHERE resolved = 1 AND detected_at < datetime('now', '-30 days')"
  ).run();
}

function formatTitle(type, severity) {
  const prefix = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
  const titles = {
    new_model: 'New model detected by community',
    accuracy_drop: 'Router accuracy degradation',
    hub_stale: 'Hub receiving no deltas',
    hw_tier_spike: 'New hardware tier emerging',
    sub_change: 'Subscription profile shift',
    weekly_summary: 'Weekly summary',
  };
  return `${prefix} frugal: ${titles[type] || type}`;
}

export { runNotify };
