/**
 * model-detect.js — detects unknown models mentioned in deltas.
 *
 * When a delta contains unknown_models, each model name is upserted into
 * the model_signals table. The aggregate job later checks thresholds and
 * triggers notifications to Paulo.
 */

async function processUnknownModels(db, delta) {
  const raw = delta.unknown_models;
  if (!raw) return;

  const models = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(models) || models.length === 0) return;

  const now = new Date().toISOString();
  const hwTier = delta.hw_tier || 'unknown';

  for (const modelName of models) {
    if (!modelName || typeof modelName !== 'string') continue;
    const clean = modelName.trim().toLowerCase().slice(0, 100);
    if (!clean) continue;

    const existing = await db.prepare(
      'SELECT model_name, mention_count, hw_tiers FROM model_signals WHERE model_name = ?'
    ).bind(clean).first();

    if (existing) {
      // Update: increment count, merge hw_tiers, update last_seen
      let hwTiers = {};
      try { hwTiers = JSON.parse(existing.hw_tiers || '{}'); } catch { hwTiers = {}; }
      hwTiers[hwTier] = (hwTiers[hwTier] || 0) + 1;

      await db.prepare(`
        UPDATE model_signals
        SET mention_count = mention_count + 1,
            last_seen = ?,
            hw_tiers = ?
        WHERE model_name = ?
      `).bind(now, JSON.stringify(hwTiers), clean).run();
    } else {
      // Insert new model signal
      const hwTiers = JSON.stringify({ [hwTier]: 1 });
      await db.prepare(`
        INSERT INTO model_signals (model_name, first_seen, last_seen, mention_count, hw_tiers, status)
        VALUES (?, ?, ?, 1, ?, 'pending')
      `).bind(clean, now, now, hwTiers).run();
    }
  }
}

export { processUnknownModels };
