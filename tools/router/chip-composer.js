#!/usr/bin/env node
'use strict';
/**
 * chip-composer.js — Wave 58 A.5 (statusline unification).
 *
 * SINGLE SOURCE OF TRUTH for the modular line-3 / appended chip set. Both the
 * WIRED statusline (gsd-statusline.js) and the modular composer
 * (statusline-multi.js) call into this module so the two can never drift again.
 *
 * --- Why two membership tiers? ---
 * Before A.5 the chip loop lived only inside statusline-multi.js#buildLine3(),
 * which is NOT the wired entry AND is itself behind a line-level opt-in
 * (`statusline_line3` / MOOTER_STATUSLINE_LINE3=1). That line-level gate is the
 * ONLY thing that kept two ALWAYS-ON chips quiet:
 *   - mlwr-status.js        → always returns "📊 local routes · run benchmark"
 *   - terminal-name-status.js → always returns "🪟 <branch>"
 * Neither self-gates on a preference. If we ran the full list in the always-on
 * wired statusline, those two would suddenly appear for every user with empty
 * preferences — violating the A.5 contract that the ONLY new default-visible
 * content is the 🎯 matrix chip.
 *
 * So we split the roster:
 *   DEFAULT_ELIGIBLE — chips that self-gate (return '' until opted in) OR are
 *     default-ON (matrix). These are safe to render in the always-on wired
 *     statusline because, with empty preferences, only the matrix chip emits.
 *   CHIP_MODULES     — the full historic list (DEFAULT_ELIGIBLE + the always-on
 *     line-3-only chips). Rendered only when the caller passes lineGateOn=true,
 *     i.e. the legacy `statusline_line3` opt-in is active. This preserves
 *     statusline-multi.js#buildLine3()'s exact behaviour.
 *
 * Contract (matches the old buildLine3 loop exactly):
 *   - Each chip module exposes statusLine() returning a string ('' / null when
 *     inactive). Falsy results are dropped.
 *   - SESSION_AWARE modules receive the current session id; the rest are called
 *     with no args (extra args are ignored by the others, but dogfood-status
 *     takes a positional `now`, so the session id is passed ONLY to the aware set).
 *   - Every module is lazy-required inside the loop and wrapped in try/catch so a
 *     single broken/throwing chip can never break the statusline. Latency budget:
 *     each chip is a couple of small file reads.
 */

// Wave 53 — modules that need the current session id (to scope / self-exclude).
const SESSION_AWARE = new Set(['./sessions-status.js', './agent-focus-status.js']);

// Chips safe for the ALWAYS-ON wired statusline. Each either self-gates to ''
// until the user opts in, or (matrix) is default-ON. Order = render order.
// With default/empty preferences ONLY './matrix-status.js' emits → the A.5
// contract holds (matrix is the sole new default-visible chip).
const DEFAULT_ELIGIBLE = [
  // Wave 53 Phase B.3 — 🤖 live subagent focus (self-gates: '' when no agent / not opted in).
  './agent-focus-status.js',
  // Wave 33.6 Block P6 — 🔒 conductor lock count (self-gates: '' when no live locks).
  './conductor-status.js',
  // Wave 53 Phase A′ — ⇄ cross-session sister visibility (self-gates: '' when solo).
  './sessions-status.js',
  // Wave 53 Phase H.1 — 🧪 MooterBench accuracy (opt-IN: '' unless statusline_chips.bench).
  './bench-status.js',
  // Wave 55 Phase C.4 — 📜 CCA-F audit pass-rate (opt-IN: '' unless statusline_chips.cca_f / env).
  './cca-f-status.js',
  // Wave 58 A.5 — 🎯 specialization-matrix coverage (DEFAULT-ON; hide via
  // hidden_chips:["matrix"] or MOOTER_STATUSLINE_MATRIX=0). Honest `?` on read fail.
  './matrix-status.js',
  // Wave 58 A.1 — 🤖 multi-agent workflow progress (opt-IN: '' unless
  // statusline_chips.agents_progress / MOOTER_STATUSLINE_AGENTS_PROGRESS=1).
  './agents-progress-status.js',
  // Wave 66 Block 6 — 🕸 code knowledge graph (opt-IN: '' unless
  // statusline_chips.graph / MOOTER_STATUSLINE_GRAPH=1). Default OFF →
  // byte-identical statusline. Honest `🕸 ?` when opted in but no breadcrumb.
  './graph-status.js',
  // W3 Autopilot Loop polish — 🔄 loop wave+round+cost chip (opt-IN: '' unless
  // preferences.statusline_loop === true). Default OFF → byte-identical statusline
  // (A.5 contract preserved). Reads STATE.json + ledger.jsonl from disk — naturally
  // cross-restart persistent. Honest `🔄 ?` when opted-in but bus not found.
  './loop-status.js',
];

// The full historic chip list, in render order. Extracted verbatim from the old
// statusline-multi.js#buildLine3() loop and extended with the Wave 58 chips.
// This is rendered ONLY behind the legacy line-3 opt-in (lineGateOn=true) because
// it contains always-on chips (mlwr, terminal-name) that must not surface in the
// default wired statusline. KEEP IN SYNC: buildLine3 imports this list from here.
const CHIP_MODULES = [
  './compression-status.js', './setup-status.js', './ecosystem-status.js',
  './wave-status.js', './dogfood-status.js', './mlwr-status.js', './limits-status.js', './pastor-status.js',
  // Wave 58.4 Block D — 🎓 Pastor v2 honest TF-IDF chip (self-gates: '' until
  // decisions.log ≥ 50). CHIP_MODULES only (line-3), NOT DEFAULT_ELIGIBLE, so it
  // never breaks the A.5 "matrix is the only new default-visible chip" contract.
  './pastor-lora-status.js',
  './effort-status.js', './quant-status.js', './vector-status.js',
  // Wave 60.5 Block C — 🧠 reasoning-effort axis chip (opt-IN via
  // statusline_chips.reasoning_effort / MOOTER_STATUSLINE_REASONING_EFFORT=1;
  // self-gates to '' otherwise). CHIP_MODULES only (line-3), NOT DEFAULT_ELIGIBLE,
  // so the default wired statusline stays byte-identical (A.5 contract + invariant 6).
  './reasoning-effort-status.js',
  // Wave 58.2 — 🎮 GPU/VRAM chip (reads gpu-probe's hw-capability.json cache;
  // self-gates to '' on CPU-only / no cache). The one Wave-Mega dense-line
  // segment that had no chip. Dense-line only (here), never in DEFAULT_ELIGIBLE.
  './gpu-status.js',
  './turboquant-status.js',
  './eagle3-status.js', './minimax-status.js', './arbitrage-status.js',
  // Wave 33.5 Block A — terminal-name (A.7) + workflow-progress dots (A.6).
  './terminal-name-status.js', './workflow-progress-status.js',
  // Wave 33.5 Block B.5 — 🐝 active spawns.
  './spawns-status.js',
  // Wave 53 Phase B.3 — 🤖 live subagent focus (identity · model · duration).
  './agent-focus-status.js',
  // Wave 33.6 Block P6 — 🔒 conductor lock count.
  './conductor-status.js',
  // Wave 53 Phase A′ — ⇄ cross-session sister visibility (heartbeats).
  './sessions-status.js',
  // Wave 33.8 Block E — 👤 signed-in identity (opaque hash, silent logged-out).
  './user-status.js',
  // Wave 53 Phase B.5 — user-pluggable segment (~/.mooter/statusline/custom.js).
  './custom-status.js',
  // Wave 53 Phase H.1 — 🧪 MooterBench accuracy (opt-IN; `?` when no results).
  './bench-status.js',
  // Wave 55 Phase J — 🔥 burn-rate $/h (opt-IN via statusline_chips.burn_rate
  // or MOOTER_STATUSLINE_BURN=1; trailing-60min real spend, pricing.js SSOT).
  './burn-rate-status.js',
  // Wave 55 Phase C.4 — 📜 CCA-F audit pass-rate (opt-IN via statusline_chips.cca_f
  // or MOOTER_STATUSLINE_CCAF=1; reads latest ~/.mooter/cca-f/audit report, `?` until run).
  './cca-f-status.js',
  // Wave 58 A.5 — 🎯 specialization-matrix coverage (DEFAULT-ON).
  './matrix-status.js',
  // Wave 58 A.1 — 🤖 multi-agent workflow progress (opt-IN).
  './agents-progress-status.js',
  // Wave 66 Block 6 — 🕸 code knowledge graph (opt-IN).
  './graph-status.js',
  // W3 Autopilot Loop polish — 🔄 loop wave+round+cost (opt-IN via
  // preferences.statusline_loop === true). Default OFF. See loop-status.js.
  './loop-status.js',
];

/**
 * Collect every active chip string from `modules`, in order.
 *
 * @param {string[]} modules       chip module require-paths
 * @param {string}   [selfSessionId] current session id (passed only to SESSION_AWARE chips)
 * @returns {string[]} the non-empty chip strings (may be empty)
 */
function collectFrom(modules, selfSessionId) {
  const chips = [];
  for (const mod of modules) {
    try {
      const c = SESSION_AWARE.has(mod)
        ? require(mod).statusLine(selfSessionId)
        : require(mod).statusLine();
      if (c) chips.push(c);
    } catch { /* skip a broken chip, never break the statusline */ }
  }
  return chips;
}

/**
 * Collect the active chips for a given gate.
 *
 * @param {string}  [selfSessionId]
 * @param {object}  [opts]
 * @param {boolean} [opts.lineGateOn] when true the FULL historic list runs
 *   (legacy `statusline_line3` opt-in); when false (default) only the
 *   DEFAULT_ELIGIBLE self-gating / default-ON chips run.
 * @returns {string[]}
 */
function collectChips(selfSessionId, opts = {}) {
  const modules = opts.lineGateOn ? CHIP_MODULES : DEFAULT_ELIGIBLE;
  return collectFrom(modules, selfSessionId);
}

/**
 * Join the active chips with ' · ' (the established line-3 separator).
 *
 * @param {string}  [selfSessionId]
 * @param {object}  [opts] see collectChips()
 * @returns {string|null} the composed chip line, or null when no chip is active
 */
function composeChips(selfSessionId, opts = {}) {
  const chips = collectChips(selfSessionId, opts);
  return chips.length ? chips.join(' · ') : null;
}

module.exports = {
  CHIP_MODULES,
  DEFAULT_ELIGIBLE,
  SESSION_AWARE,
  collectFrom,
  collectChips,
  composeChips,
};
