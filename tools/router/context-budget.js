'use strict';

// context-budget.js — Wave 61 GAP 4 primitive (context budget per tier).
//
// The "context axis" lever: how much conversation/context to spend on a dispatch,
// and whether to send it RAW or DISTILLED — keyed by the routing tier. Principle
// (context rot): a small focused slice beats a dumped window, so distill where
// tokens are expensive and context-rot bites (T3/T5) and send raw where tokens are
// free (T0 local). This mirrors the brief's "T0 cru / T3 destilado".
//
// SCOPE (Wave 61 Day-0, see WAVE61_DAY0_RECON.md): this is the ONE design-agnostic
// piece of GAP 4 — a PURE POLICY primitive. It is a parameter any context mechanism
// consumes; it does NOT read a transcript, build a code graph, or decide the
// context-bridge architecture (that is the still-undecided Wave 65 RFC). The
// graphify-specific blocks (code-graph pack, graph-context-bridge, graph-aware
// routing, 🕸 chip) are DEFERRED — their brief does not exist yet.
//
// Pure: zero IO, zero LLM, never throws. Token figures are ADVISORY policy
// defaults (not measured savings); callers may override. We never claim a "typical"
// multiplier like "71×" — context savings from applying a budget are advisory.

/** @typedef {'raw'|'distilled'} ContextMode */

// Per-tier policy. `max_context_tokens` is an advisory ceiling on the context a
// stateless/secondary dispatch should receive at that tier; `mode` says whether to
// send it verbatim (raw) or focus it first (distilled). Rationale per row.
const CONTEXT_BUDGETS = {
  // Local, free, small window — spend freely but stay within a small model's reach;
  // no point distilling tokens that cost nothing.
  T0: { max_context_tokens: 8_000, mode: 'raw', rationale: 'local/free — raw, small-model-bound' },
  // Haiku — cheap; a light raw slice is fine.
  T1: { max_context_tokens: 8_000, mode: 'raw', rationale: 'cheap cloud — light raw slice' },
  // Sonnet — start focusing to control mid-tier cost.
  T2: { max_context_tokens: 16_000, mode: 'distilled', rationale: 'mid cost — begin distilling' },
  // Opus — large window but expensive and context-rot-prone; focus the tokens.
  T3: { max_context_tokens: 24_000, mode: 'distilled', rationale: 'expensive/rot-prone — distilled focus' },
  // Fable (opt-in frontier) — focus like T3.
  T5: { max_context_tokens: 24_000, mode: 'distilled', rationale: 'frontier opt-in — distilled focus' },
};

/** Safe default for an unknown tier: the conservative mid policy (never raw-dump). */
const DEFAULT_BUDGET = { max_context_tokens: 16_000, mode: 'distilled', rationale: 'unknown tier — safe mid default' };

/**
 * Context budget policy for a routing tier. Pure; never throws.
 * @param {string} tier  T0|T1|T2|T3|T5 (case-insensitive)
 * @returns {{ tier: string, max_context_tokens: number, mode: ContextMode, rationale: string, advisory: true }}
 */
function contextBudget(tier) {
  const key = String(tier || '').toUpperCase();
  const policy = Object.prototype.hasOwnProperty.call(CONTEXT_BUDGETS, key)
    ? CONTEXT_BUDGETS[key]
    : DEFAULT_BUDGET;
  return { tier: key || 'unknown', ...policy, advisory: true };
}

/** True when the tier's policy is to distil context before sending it. */
function shouldDistill(tier) {
  return contextBudget(tier).mode === 'distilled';
}

module.exports = { contextBudget, shouldDistill, CONTEXT_BUDGETS, DEFAULT_BUDGET };
