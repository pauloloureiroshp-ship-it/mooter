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
    };
  } catch {
    return { quiet: false, badge_position: 'inline', statusline_view: 'auto' };
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
 * Build the `[tier·model·conf]` badge from a router decision. Missing/invalid
 * fields degrade to `T?` / `unknown` / `0.00` rather than throwing.
 * @param {{ tier?: string, recommended_model?: unknown, confidence?: unknown }} decision
 * @returns {string}
 */
function buildBadge(decision) {
  const d = decision || {};
  const tier = d.tier ? String(d.tier) : 'T?';
  const model = shortModel(d.recommended_model);
  const conf = Number(d.confidence);
  const confStr = Number.isFinite(conf) ? conf.toFixed(2) : '0.00';
  return `[${tier}·${model}·${confStr}]`;
}

module.exports = { readPrefs, shortModel, buildBadge, DEFAULT_PREFS };
