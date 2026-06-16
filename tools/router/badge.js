'use strict';

// Tier badge helpers (Wave 2.5 Day 3). A compact [tier·model·conf] marker that
// inject_context.js emits alongside the <router-hint> — unless the user has run
// `mooter quiet`. Kept pure + side-effect-light so badge.test.js unit-tests it
// without spawning the hook. The hint is already gated to confidence >= 0.6
// upstream, so the badge inherits that threshold; here we only honor `quiet`.

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @typedef {{ quiet: boolean, badge_position: string, statusline_view: string }} Prefs
 */

/** @type {Prefs} */
const DEFAULT_PREFS = { quiet: false, badge_position: 'inline', statusline_view: 'auto' };

/**
 * Read ~/.mooter/preferences.json (or an explicit path, for tests). Any failure
 * — missing file, malformed JSON — falls back to defaults so the hook never
 * breaks on a fresh machine that has not run the wizard yet.
 * @param {string} [prefsPath]
 * @returns {Prefs}
 */
function readPrefs(prefsPath) {
  try {
    const p = prefsPath || path.join(os.homedir(), '.mooter', 'preferences.json');
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      quiet: !!(obj && obj.quiet === true),
      badge_position: (obj && typeof obj.badge_position === 'string') ? obj.badge_position : 'inline',
      statusline_view: (obj && typeof obj.statusline_view === 'string') ? obj.statusline_view : 'auto',
      // Wave 5 D4 — badge display prefs (always-on by default).
      badge_off: !!(obj && obj.badge_off === true),
      badge_threshold: (obj && typeof obj.badge_threshold === 'number') ? obj.badge_threshold : 0,
    };
  } catch {
    return { quiet: false, badge_position: 'inline', statusline_view: 'auto', badge_off: false, badge_threshold: 0 };
  }
}

/**
 * Collapse a full model id (claude-opus-4-6, qwen3:30b) to a short badge label.
 * @param {unknown} model
 * @returns {string}
 */
function shortModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('gpt')) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  if (/qwen|llama|deepseek|gemma|mistral|phi/.test(m)) return 'ollama';
  return m || 'unknown';
}

/**
 * Estimated savings for this decision vs the naive all-Opus baseline, using the
 * SAME prompt-length heuristic the savings-tracker uses (no new cost model). An
 * ESTIMATE (tokens aren't known at classify time); returns 0 for T3 (no saving
 * vs the T3 default) or when pricing is unavailable. Wave 2.8 Ponto #5.
 * @param {{ tier?: string, prompt_len?: unknown }} d
 * @returns {number} USD saved estimate (>= 0)
 */
function estimateBadgeSavings(d) {
  try {
    if (!d || d.tier === 'T3') return 0;
    const len = Number(d.prompt_len);
    if (!Number.isFinite(len) || len <= 0) return 0;
    const { naiveOpusCost, estimateTurnCost } = require('./pricing.js');
    const saved = naiveOpusCost(len) - estimateTurnCost(d.tier, len);
    return saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

/**
 * Build the tier badge from a router decision. Wave 2.6 D3 led with the Moo
 * glyph (`[🐂 ☁ sonnet 0.84]`); Wave 2.8 Ponto #5 appends an estimated savings
 * chip for non-T3 tiers (`[🐂 ☁ sonnet 0.84 · saved $0.034]`). Wrapped so a
 * missing module degrades to the legacy form — feeds the live UserPromptSubmit
 * hook. Missing fields degrade to `T?` / `unknown` / `0.00` rather than throwing.
 * @param {{ tier?: string, recommended_model?: unknown, recommended_backend?: unknown, confidence?: unknown, prompt_len?: unknown }} decision
 * @returns {string}
 */
function buildBadge(decision) {
  const d = decision || {};
  const tier = d.tier ? String(d.tier) : 'T?';
  const model = shortModel(d.recommended_model);
  const conf = Number(d.confidence);
  const confStr = Number.isFinite(conf) ? conf.toFixed(2) : '0.00';
  const saved = estimateBadgeSavings(d);
  const savedChip = saved > 0 ? ` · saved $${saved.toFixed(3)}` : '';
  // Wave 5 D4 — low-confidence (< 0.5) uses a `?` glyph instead of the tier glyph,
  // so an always-on badge honestly signals "uncertain tier".
  const lowConf = Number.isFinite(conf) && conf < 0.5;
  // Wave 5 D4 — surface a safety boost on the badge: `boosted from T1 · <reason>`.
  let boostChip = '';
  if (d.safety_boost_applied && d.safety_boost_from) {
    const kind = typeof d.safety_boost_reason === 'string' ? d.safety_boost_reason.split(/[:(]/)[0].trim() : 'safety_boost';
    boostChip = ` boosted from ${d.safety_boost_from} · ${kind}`;
  }
  try {
    const { glyphFor, providerBucket } = require('./glyphs.js');
    const glyph = lowConf ? '?' : glyphFor({ tier, provider: providerBucket(d.recommended_backend) });
    return `[${glyph} ${model} ${confStr}${savedChip}${boostChip}]`;
  } catch {
    return `[${lowConf ? '?' : tier}·${model}·${confStr}${savedChip}${boostChip}]`;
  }
}

/**
 * Wave 5 D4 — badge display mode from prefs. Always-on by default (threshold 0);
 * `--badge-off` suppresses; `--badge-threshold=X` raises the floor; `--badge-always`
 * forces 0. The router-hint quality gate (0.6) is separate — this is display only.
 * @param {Prefs & { badge_off?: boolean, badge_threshold?: number }} prefs
 */
function badgeMode(prefs) {
  const p = prefs || {};
  return {
    off: p.badge_off === true,
    threshold: typeof p.badge_threshold === 'number' ? p.badge_threshold : 0,
  };
}

module.exports = { readPrefs, shortModel, buildBadge, estimateBadgeSavings, badgeMode, DEFAULT_PREFS };
