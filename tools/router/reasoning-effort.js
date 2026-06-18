'use strict';

// reasoning-effort.js — Wave 60.5, axis 2 (reasoning/output) of the Mooter
// multi-axis router. Host-side, pure, zero-LLM.
//
// The reasoning/thinking tokens of a modern reasoning model dominate cost and
// vary 5–25× WITHIN a single tier. This module emits the SECOND natural output
// of the deterministic classifier: a semantic reasoning-effort level per task,
// derived ENTIRELY from signals classify.js already computed (tier, risk_level,
// task_category, safety floor). It never calls a model, never re-classifies, and
// never touches classify.js (FROZEN) — it reads the `decision` object the hook
// already holds and returns one of four STABLE semantic labels.
//
// Why semantic labels, not token counts: 'none'|'low'|'medium'|'high' map onto
// the effort knobs every major provider exposes (Anthropic extended-thinking
// budget, OpenAI reasoning_effort, Gemini thinking) and stay stable as those
// token scales change. We NEVER squeeze max_tokens — that truncates a reasoning
// model mid-thought and still bills the thinking. The only knob is the effort.
//
// Doctrine (Master Prompt invariant 5): HIGH_RISK / architecture / cross-file /
// safety-floor ALWAYS resolve to 'high' — effort is never cut on a high-blast-
// radius task, even under a budget cap or zen mode.

/** @typedef {'none'|'low'|'medium'|'high'} ReasoningEffort */

// Categories classify.js actually emits, via its `category` variable
// (classify.js:666-729) plus the early fast-path returns. This is NOT the 24-cat
// task-categories.ts taxonomy — that lives in the Wave 58 matrix engine and never
// reaches the host-side `decision`. Verified Wave 60.5 Day-0 (REFUTATIONS_LOG R1).
const HIGH_CATEGORIES = new Set([
  'cross_file_change',        // multi-file change → high blast radius
  'architecture_or_critical', // architecture / critical change
]);

const NONE_CATEGORIES = new Set([
  'bash_command_paste', // pasting a shell command for a one-line explanation
  'file_read_intent',   // "read X" — mechanical, no reasoning to spend
]);

const MEDIUM_CATEGORIES = new Set([
  'reasoning_intermediate', // root-cause / planning / comparison (Sonnet-class)
]);

const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Derive the reasoning-effort level for a classified decision. Pure, never
 * throws: any unexpected shape falls through to the safe 'medium' middle.
 *
 * Precedence is deliberate and matches the doctrine:
 *   1. HIGH  — guardrail floor (high risk / T3 / architecture / safety-floor / beast).
 *   2. NONE  — purely mechanical tasks with no reasoning to spend.
 *   3. MEDIUM— intermediate reasoning tier.
 *   4. LOW   — trivial / simple / ambiguous local work.
 *   5. default 'medium' on an unknown shape (never 'none' under uncertainty).
 *
 * T5 (Fable) is intentionally NOT special-cased: it is a pin-driven opt-in
 * decoupled from task complexity, so its effort derives from risk/category like
 * any other prompt — a `@fable` trivial task gets 'low', not 'high' (R4).
 *
 * @param {Record<string, unknown>} decision  classify.js output (possibly
 *   annotated by inject_context.js layers — safety_boost, adapter, mode).
 * @returns {ReasoningEffort}
 */
function reasoningEffort(decision) {
  const d = decision || {};
  const tier = str(d.tier).toUpperCase();
  const risk = str(d.risk_level).toLowerCase();
  const cat = str(d.task_category).toLowerCase();
  const esc = str(d.escalation_rule).toLowerCase();

  // 1. HIGH — doctrine hard floor. High risk, architecture/cross-file work, the
  //    critical-phrase safety floor, beast mode, and T3 (Opus, complexity-driven)
  //    all warrant maximum reasoning. Never cut here (invariant 5).
  if (
    risk === 'high' ||
    tier === 'T3' ||
    HIGH_CATEGORIES.has(cat) ||
    d.safety_boost_applied === true ||
    /safety_floor|beast/.test(esc)
  ) {
    return 'high';
  }

  // 2. NONE — purely mechanical tasks with no reasoning to spend (paste a
  //    command for explanation, read a file). Spending thinking here is waste.
  if (NONE_CATEGORIES.has(cat)) {
    return 'none';
  }

  // 3. MEDIUM — intermediate reasoning tier (Sonnet-class root-cause, planning).
  if (tier === 'T2' || risk === 'medium' || MEDIUM_CATEGORIES.has(cat)) {
    return 'medium';
  }

  // 4. LOW — trivial/simple/ambiguous local work (T0/T1, minimal/low risk).
  if (tier === 'T0' || tier === 'T1' || risk === 'minimal' || risk === 'low') {
    return 'low';
  }

  // 5. DEFAULT — unknown shape → safe middle (never 'none' on uncertainty).
  return 'medium';
}

module.exports = { reasoningEffort };
