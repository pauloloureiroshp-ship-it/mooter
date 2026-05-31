'use strict';

// Safety boost layer (Wave 3 Day 1). Post-classify uplift that protects against
// architecture-grade prompts silently landing on a small local Moo — the MAJ-1
// finding from the Wave 2.7 audit ("design a sharding strategy" → qwen2.5:3b).
//
// CRITICAL: this never touches classify.js (P11 invariant). It runs AFTER the
// regex classifier + arbiter settle, examines the prompt for architectural
// signals, and only ever UPGRADES the tier (never downgrades) — with an explicit,
// verifiable reason (no black-box). High-confidence trivial prompts are left
// alone so casual mentions ("the colour I designed last week") don't false-fire.

// Broad architectural vocabulary — a match here only boosts when the classifier
// was already unsure (T0/T1 + confidence < 0.9).
const ARCHITECTURAL_KEYWORDS = [
  'design', 'strategy', 'architecture', 'architect', 'audit', 'review',
  'refactor', 'redesign', 'migration', 'migrate', 'sharding', 'partitioning',
  'schema', 'consistency', 'distributed', 'scalability',
];

// Critical phrases — an architecture-grade task that must reach Opus (T3)
// regardless of what the classifier said, short of an explicit user downgrade.
const CRITICAL_PHRASES = [
  /design\s+(?:a\s+|the\s+)?sharding/i,
  /sharding\s+strategy/i,
  /design\s+(?:a\s+|the\s+)?partitioning/i,
  /partitioning\s+strategy/i,
  /schema\s+migration/i,
  /migrat\w*\s+(?:plan|strategy|from)/i,
  /redesign\s+(?:the\s+)?architect/i,
  /design\s+(?:a\s+|the\s+)?(?:distributed|multi-tenant|scalable)/i,
  /security\s+audit/i,
  /database\s+(?:schema|sharding|design)/i,
  /distributed\s+(?:transaction|consistency|system)/i,
];

// Canonical tier → backend/model (mirrors inject_context.js TIER_DEFAULTS).
const TIER_TARGET = {
  T2: { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6' },
  T3: { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6' },
};

const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

/** First critical phrase that matches, or null. */
function matchedCriticalPhrase(promptText) {
  for (const re of CRITICAL_PHRASES) if (re.test(promptText)) return re.source;
  return null;
}

/**
 * Apply the safety boost to a settled classification. Returns a NEW object
 * (never mutates the input). `safety_boost_applied` is always present so the
 * caller can log it. Only upgrades; a downgrade is never produced here.
 * @param {{tier?:string, confidence?:number, recommended_model?:string, recommended_backend?:string}} classification
 * @param {string} promptText
 */
function applySafetyBoost(classification, promptText) {
  const c = classification || {};
  const text = String(promptText || '');
  const lower = text.toLowerCase();
  const tier = c.tier || 'T0';
  const conf = Number.isFinite(c.confidence) ? c.confidence : 0;
  const tierIdx = TIER_ORDER.indexOf(tier);

  const hasKw = ARCHITECTURAL_KEYWORDS.some((k) => lower.includes(k));
  const critical = matchedCriticalPhrase(text);

  // Critical architectural phrase → force T3 (unless already T3+).
  if (critical && tierIdx < TIER_ORDER.indexOf('T3')) {
    return {
      ...c,
      ...TIER_TARGET.T3,
      tier: 'T3',
      safety_boost_applied: true,
      safety_boost_reason: `critical_phrase_match: ${critical}`,
      safety_boost_from: tier,
    };
  }

  // Architectural keyword + low-confidence T0/T1 → uplift to T2 (Sonnet).
  if (hasKw && (tier === 'T0' || tier === 'T1') && conf < 0.9) {
    return {
      ...c,
      ...TIER_TARGET.T2,
      tier: 'T2',
      safety_boost_applied: true,
      safety_boost_reason: `architectural_keyword + low_confidence (${conf.toFixed(2)})`,
      safety_boost_from: tier,
    };
  }

  return { ...c, safety_boost_applied: false };
}

module.exports = { applySafetyBoost, matchedCriticalPhrase, ARCHITECTURAL_KEYWORDS, CRITICAL_PHRASES, TIER_TARGET };
