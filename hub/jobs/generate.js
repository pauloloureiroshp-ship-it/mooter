/**
 * generate.js — daily cron job.
 *
 * Generates a new community router-tuning JSON from the aggregated
 * deltas of the last 7 days. Publishes to R2 as both versioned and
 * "latest" objects so hub-pull.js can fetch the current config.
 */

async function runGenerate(env) {
  const db = env.DB;
  const minTrust = parseFloat(env.MIN_TRUST_SCORE || '0.4');

  // 1. Read trusted deltas from last 7 days
  const deltas = await db.prepare(`
    SELECT hw_tier, sub_profile, tier_distribution, keyword_signals,
           feedback_signals, prompt_count, trust_score
    FROM deltas
    WHERE received_at > datetime('now', '-7 days')
      AND trust_score >= ?
    ORDER BY trust_score DESC
  `).bind(minTrust).all();

  const rows = deltas.results || [];
  if (rows.length < 5) return; // not enough data

  // 2. Aggregate keyword signals by tier
  const keywordWeights = {};
  for (const row of rows) {
    if (!row.keyword_signals) continue;
    let signals;
    try { signals = JSON.parse(row.keyword_signals); } catch { continue; }
    if (!Array.isArray(signals)) continue;
    for (const s of signals) {
      if (!s.signal) continue;
      if (!keywordWeights[s.signal]) {
        keywordWeights[s.signal] = { total: 0, t3_sum: 0, t2_sum: 0, count: 0 };
      }
      keywordWeights[s.signal].total += s.count || 1;
      keywordWeights[s.signal].t3_sum += (s.t3_rate || 0) * (s.count || 1);
      keywordWeights[s.signal].t2_sum += (s.t2_rate || 0) * (s.count || 1);
      keywordWeights[s.signal].count += 1;
    }
  }

  const processedWeights = {};
  for (const [signal, data] of Object.entries(keywordWeights)) {
    if (data.count < 3) continue; // need consensus
    const avgT3 = data.total > 0 ? data.t3_sum / data.total : 0;
    const avgT2 = data.total > 0 ? data.t2_sum / data.total : 0;
    const tier = avgT3 > 0.5 ? 't3' : avgT2 > 0.3 ? 't2' : 't1';
    processedWeights[signal] = {
      tier,
      weight: Math.round(Math.max(avgT3, avgT2) * 100) / 100,
    };
  }

  // 3. Compute threshold adjustments per hw_tier
  const hwBuckets = {};
  for (const row of rows) {
    if (!hwBuckets[row.hw_tier]) hwBuckets[row.hw_tier] = [];
    try {
      const td = JSON.parse(row.tier_distribution);
      hwBuckets[row.hw_tier].push(td);
    } catch { /* skip */ }
  }

  const thresholdAdjustments = {};
  for (const [hwTier, dists] of Object.entries(hwBuckets)) {
    const avgT0 = dists.reduce((s, d) => s + (d.t0 || 0), 0) / dists.length;
    // If T0 rate is high, this hw_tier handles local well — boost T0 threshold
    if (avgT0 > 0.7) {
      thresholdAdjustments[hwTier] = { t0_boost: Math.round((avgT0 - 0.7) * 100) / 100 };
    } else if (avgT0 < 0.3) {
      thresholdAdjustments[hwTier] = { t0_penalty: Math.round((0.3 - avgT0) * 100) / 100 };
    }
  }

  // 4. Determine version (increment from current)
  let currentVersion = '0.0.0';
  try {
    const existing = await env.STORAGE.get('router-tuning-latest.json');
    if (existing) {
      const parsed = JSON.parse(await existing.text());
      currentVersion = parsed._version || '0.0.0';
    }
  } catch { /* first run */ }

  const parts = currentVersion.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  const newVersion = parts.join('.');

  // 5. Build and publish
  const tuning = {
    _version: newVersion,
    _generated: new Date().toISOString(),
    _samples: rows.length,
    _hw_tiers: Object.keys(hwBuckets),
    keyword_weights: processedWeights,
    threshold_adjustments: thresholdAdjustments,
  };

  const body = JSON.stringify(tuning, null, 2);
  await env.STORAGE.put(`router-tuning-v${newVersion}.json`, body);
  await env.STORAGE.put('router-tuning-latest.json', body);
}

export { runGenerate };
