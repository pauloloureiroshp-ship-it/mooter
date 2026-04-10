/**
 * trust.js — calculates trust_score for incoming deltas.
 *
 * trust_score = base_score × hw_weight × feedback_bonus × volume_factor
 *
 * Range: 0.0 – 1.0. Deltas below MIN_TRUST_SCORE are stored but excluded
 * from router-tuning generation.
 */

const HW_WEIGHTS = {
  'gpu-high':      1.0,
  'gpu-mid':       0.9,
  'apple-silicon': 0.9,
  'gpu-low':       0.8,
  'cpu-only':      0.7,
};

function computeTrustScore(delta) {
  // Base score: schema quality
  let base = 0;
  if (delta.delta_version === '2') base += 0.3;
  if (delta.hw_tier && delta.sub_profile && delta.tier_distribution) base += 0.3;
  if ((delta.session_count || 0) >= 10) base += 0.2;
  if ((delta.prompt_count || 0) >= 50) base += 0.2;

  // Hardware weight
  const hwWeight = HW_WEIGHTS[delta.hw_tier] || 0.7;

  // Feedback bonus
  let feedbackBonus = 0;
  if (delta.feedback_signals) {
    const fb = typeof delta.feedback_signals === 'string'
      ? JSON.parse(delta.feedback_signals)
      : delta.feedback_signals;
    if ((fb.followup_rate || 0) < 0.08) feedbackBonus += 0.1;
    if ((fb.accepted_rate || 0) > 0.90) feedbackBonus += 0.1;
  }

  // Volume factor
  let volumeFactor = 1.0;
  if ((delta.prompt_count || 0) > 200) volumeFactor = 1.1;
  else if ((delta.prompt_count || 0) < 20) volumeFactor = 0.8;

  const raw = (base + feedbackBonus) * hwWeight * volumeFactor;
  return Math.min(1.0, Math.max(0.0, Math.round(raw * 1000) / 1000));
}

export { computeTrustScore };
