#!/usr/bin/env node
// @ts-check
/**
 * shadow-mode.js — sampling + flag module for Shadow Mode Lite.
 *
 * Shadow mode runs the tier-below model in background on a sample of T2/T3
 * prompts. The shadow response is never shown to the user — it's stored in
 * decisions.log as a `shadow_pair` event and judged nightly by shadow-judge.js.
 *
 * This module handles:
 *   - Feature flag (SHADOW_MODE_ENABLED in .mooter-mode.json or env)
 *   - Sampling decision (5% of eligible prompts)
 *   - Tier mapping (T2→T1, T3→T2)
 *   - Background spawn (Windows-safe detached+unref)
 *
 * INVARIANTS (from docs/METHODOLOGY.md + SPRINT_B master prompt):
 *   1. Default OFF — enabled via .mooter-mode.json or env var
 *   2. Zero blast radius — shadow output is silent, user never sees it
 *   3. 5% sampling via Math.random() (non-deterministic)
 *   4. HIGH_RISK prompts never enter shadow
 *   5. No changes to classify.js or inject_context.js (this is a new module)
 *   6. Privacy: previews truncated to 200 chars
 *
 * Usage (from inject_context.js callsite):
 *   const shadow = require('./shadow-mode');
 *   if (shadow.isEnabled() && shadow.shouldSample(prompt, tier, classification)) {
 *     shadow.spawnShadow(prompt, tier, decisionId, sessionId);
 *   }
 */

'use strict';

/**
 * @typedef {'T0'|'T1'|'T2'|'T3'} Tier
 * @typedef {Object} Classification
 * @property {string} [risk_level]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_PATH = path.join(ROUTER_DIR, '.mooter-mode.json');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');

const SAMPLE_RATE = 0.05; // 5%
const PREVIEW_MAX_CHARS = 200;
const MIN_ELIGIBLE_TIER = 'T2';

const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

// ────────────────────────────────────────────────────────────────────────
// Feature flag
// ────────────────────────────────────────────────────────────────────────
function isEnabled() {
  if (process.env.SHADOW_MODE_ENABLED === 'true') return true;
  if (process.env.SHADOW_MODE_ENABLED === 'false') return false;
  try {
    const mode = JSON.parse(fs.readFileSync(MODE_PATH, 'utf8'));
    return mode.shadow_mode === true;
  } catch (_) {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Sampling decision
// ────────────────────────────────────────────────────────────────────────
/**
 * @param {string} prompt
 * @param {string} tier
 * @param {Classification | null | undefined} classification
 * @returns {boolean}
 */
function shouldSample(prompt, tier, classification) {
  if (!prompt || !tier) return false;
  const tierIdx = TIER_ORDER.indexOf(tier);
  const minIdx = TIER_ORDER.indexOf(MIN_ELIGIBLE_TIER);
  if (tierIdx < minIdx) return false;
  if (classification && classification.risk_level === 'high') return false;
  if (Math.random() >= SAMPLE_RATE) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────────
// Tier mapping
// ────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tier
 * @returns {string | null}
 */
function shadowTierFor(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx <= 0) return null;
  return TIER_ORDER[idx - 1];
}

// ────────────────────────────────────────────────────────────────────────
// Log shadow_pair event
// ────────────────────────────────────────────────────────────────────────
/**
 * @param {string} decisionId
 * @param {string | null | undefined} sessionId
 * @param {string} primaryTier
 * @param {string} shadowTier
 * @param {string | null | undefined} primaryPreview
 * @param {string | null | undefined} shadowPreview
 * @returns {object}
 */
function logShadowPair(decisionId, sessionId, primaryTier, shadowTier, primaryPreview, shadowPreview) {
  const event = {
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
    event: 'shadow_pair',
    decision_id: decisionId,
    session_id: sessionId || null,
    primary_tier: primaryTier,
    shadow_tier: shadowTier,
    primary_preview: (primaryPreview || '').slice(0, PREVIEW_MAX_CHARS),
    shadow_preview: (shadowPreview || '').slice(0, PREVIEW_MAX_CHARS),
    judge_verdict: null,
  };
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(event) + '\n');
  } catch (_) { /* non-fatal */ }
  return event;
}

// ────────────────────────────────────────────────────────────────────────
// Background spawn — fire-and-forget
// ────────────────────────────────────────────────────────────────────────
/**
 * @param {string} prompt
 * @param {string} primaryTier
 * @param {string} decisionId
 * @param {string | null | undefined} sessionId
 * @returns {object | null}
 */
function spawnShadow(prompt, primaryTier, decisionId, sessionId) {
  const shadowTier = shadowTierFor(primaryTier);
  if (!shadowTier) return null;

  const truncPrompt = (prompt || '').slice(0, PREVIEW_MAX_CHARS);

  // Build the command based on shadow tier:
  //   T1 (Haiku) → anthropic_call.sh
  //   T0 (Ollama) → ollama_call.sh
  let cmd, args;
  if (shadowTier === 'T1') {
    cmd = 'bash';
    args = [path.join(ROUTER_DIR, 'anthropic_call.sh'), '--text', truncPrompt];
  } else {
    cmd = 'bash';
    args = [path.join(ROUTER_DIR, 'ollama_call.sh'), '--text', truncPrompt];
  }

  try {
    const child = spawn(cmd, args, {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        SHADOW_DECISION_ID: decisionId,
        SHADOW_SESSION_ID: sessionId || '',
        SHADOW_PRIMARY_TIER: primaryTier,
        SHADOW_TIER: shadowTier,
      },
    });
    child.unref();

    logShadowPair(decisionId, sessionId, primaryTier, shadowTier, truncPrompt, null);
    return { decisionId, primaryTier, shadowTier, spawned: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { decisionId, primaryTier, shadowTier, spawned: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────
module.exports = {
  isEnabled,
  shouldSample,
  shadowTierFor,
  spawnShadow,
  logShadowPair,
  SAMPLE_RATE,
  MIN_ELIGIBLE_TIER,
  TIER_ORDER,
  PREVIEW_MAX_CHARS,
};

// CLI: `node shadow-mode.js --status`
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    console.log(JSON.stringify({
      enabled: isEnabled(),
      sample_rate: SAMPLE_RATE,
      min_tier: MIN_ELIGIBLE_TIER,
      mode_file: MODE_PATH,
      mode_file_exists: fs.existsSync(MODE_PATH),
    }, null, 2));
  }
}
