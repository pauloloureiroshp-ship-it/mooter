#!/usr/bin/env node
'use strict';

// hint_coherence.js — Wave 21 (C3): the router-hint must never contradict itself.
//
// The Wave 20 hint emitted blocks like `tier: T0` + `recommended_model:
// claude-opus-4-6` + `suggested_subagent: model-architect` — mutually exclusive.
// Root cause (WAVE21_DAY1_RECON.md §C3): the budget cap (and zen cap) LOWER
// `decision.tier` for cost control but leave recommended_model / backend /
// suggested_subagent stale from classify/safety-boost.
//
// DECISION (deviates from the kickoff's stated "model→tier" direction, on purpose):
// the tier is AUTHORITATIVE. Every guardrail (budget cap, zen, beast, safety floor)
// manipulates the tier; the dominant real cause is budget_cap pulling the tier
// DOWN. Coercing model→tier (e.g. forcing tier=T3 because model=opus) would UNDO
// the budget cap and route a cost-capped task back to Opus — the opposite of what
// Paulo's doctrine wants. So we derive backend/model/subagent FROM the final tier.
// A user pin already sets tier+model+subagent together, so this is a no-op there.
//
// A field is rewritten ONLY when it disagrees with the tier, so tier-consistent
// specialisations survive (local-transformer at T0, final-reviewer at T3).
//
// Pure. No deps. Never throws.

/** Tier implied by a model name, or null for non-T0–T3 (gpt/gemini/unknown). */
function modelTier(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  if (m.includes('opus')) return 'T3';
  if (m.includes('sonnet')) return 'T2';
  if (m.includes('haiku')) return 'T1';
  if (/qwen|llama|gemma|deepseek|mistral|phi|ollama|local/.test(m)) return 'T0';
  return null;
}

// Canonical subagent → tier (the inverse of the tier→subagent map). An unknown
// subagent maps to null (left untouched — honest, never guessed).
const SUBAGENT_TIER = {
  'local-summarizer': 'T0', 'local-transformer': 'T0',
  'cheap-triage': 'T1', 'model-reasoner': 'T2',
  'model-architect': 'T3', 'final-reviewer': 'T3',
};

/** Canonical backend/model/subagent for a tier. t0Model defaults to qwen3:30b. */
function canonFor(tier, t0Model) {
  switch (tier) {
    case 'T0': return { recommended_backend: 'ollama',          recommended_model: t0Model || 'qwen3:30b',      suggested_subagent: 'local-summarizer' };
    case 'T1': return { recommended_backend: 'anthropic_api',   recommended_model: 'claude-haiku-4-5-20251001', suggested_subagent: 'cheap-triage' };
    case 'T2': return { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6',         suggested_subagent: 'model-reasoner' };
    case 'T3': return { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6',           suggested_subagent: 'model-architect' };
    default: return null;
  }
}

/** True when tier ↔ model ↔ subagent all agree (used by the test as an assertion). */
function isHintCoherent(decision) {
  if (!decision || !decision.tier) return true;
  const mt = modelTier(decision.recommended_model);
  if (mt && mt !== decision.tier) return false;
  const st = SUBAGENT_TIER[decision.suggested_subagent];
  if (st && st !== decision.tier) return false;
  return true;
}

/**
 * Reconcile a decision so the emitted hint is internally coherent. Mutates and
 * returns the decision (best-effort; tier-authoritative). @param {object} decision
 * @param {{t0Model?:string}} [opts]
 */
function coerceHintCoherent(decision, opts = {}) {
  if (!decision || !decision.tier) return decision;
  const canon = canonFor(decision.tier, opts.t0Model);
  if (!canon) return decision; // unknown tier — leave as-is (honest)

  if (modelTier(decision.recommended_model) !== decision.tier) {
    decision.recommended_model = canon.recommended_model;
    decision.recommended_backend = canon.recommended_backend;
  }
  if (SUBAGENT_TIER[decision.suggested_subagent] !== decision.tier) {
    decision.suggested_subagent = canon.suggested_subagent;
  }
  return decision;
}

module.exports = { coerceHintCoherent, isHintCoherent, modelTier, SUBAGENT_TIER, canonFor };
