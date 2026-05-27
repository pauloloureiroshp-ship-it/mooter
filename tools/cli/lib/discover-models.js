'use strict';

/**
 * discover-models.js — enumerate the AI models a user can pin via the
 * dynamically generated `/mooter-<slug>` slash commands.
 *
 * Sessão A scope: Anthropic catalog only (Opus / Sonnet / Haiku). Non-Anthropic
 * providers (Codex CLI, OpenAI direct, Ollama) are layered on in Sessão B.
 *
 * Availability is sourced from the canonical detector in
 * `tools/router/detect-subscriptions.js` (NOT from quota-state.json — that file
 * only tracks usage windows and has no subscription field). Each detector is a
 * pure-ish function exported by that module; requiring the module is
 * side-effect-free thanks to its `require.main === module` guard.
 *
 * Every discover function accepts an options bag with an injectable detector so
 * tests never touch the real filesystem / spawn the real `codex` CLI.
 */

let detectSubs = {};
try {
  // tools/cli/lib → ../../router
  detectSubs = require('../../router/detect-subscriptions');
} catch {
  /* detector module unavailable → discover functions degrade to unavailable */
}

/**
 * Static Anthropic catalog. `model` strings must match the tierMap keys in
 * inject_context.js's MOOTER_PIN_MODEL hook so a pin resolves to the right tier.
 * @type {ReadonlyArray<{slug:string, model:string, tier:string, subagent:string, displayName:string, provider:string}>}
 */
const ANTHROPIC_CATALOG = Object.freeze([
  { slug: 'opus-4-7',  model: 'claude-opus-4-7',   tier: 'T3', subagent: 'model-architect', displayName: 'Opus 4.7',  provider: 'anthropic' },
  { slug: 'opus-4-6',  model: 'claude-opus-4-6',   tier: 'T3', subagent: 'model-architect', displayName: 'Opus 4.6',  provider: 'anthropic' },
  { slug: 'sonnet-4-6', model: 'claude-sonnet-4-6', tier: 'T2', subagent: 'model-reasoner',  displayName: 'Sonnet 4.6', provider: 'anthropic' },
  { slug: 'haiku-4-5',  model: 'claude-haiku-4-5',  tier: 'T1', subagent: 'cheap-triage',     displayName: 'Haiku 4.5',  provider: 'anthropic' },
].map(Object.freeze));

/**
 * Return the Anthropic catalog, each entry flagged available iff an Anthropic
 * subscription (Claude Code OAuth) or ANTHROPIC_API_KEY is detected.
 *
 * Per-model quota filtering is intentionally deferred (T-01 step 5) — all
 * catalog entries share the single account-level availability flag.
 *
 * @param {{detectAnthropic?: () => {available?: boolean}}} [opts]
 * @returns {Array<{slug:string, model:string, tier:string, subagent:string, displayName:string, provider:string, available:boolean}>}
 */
function discoverAnthropicModels(opts = {}) {
  // Honor an explicitly-passed detector even when it is null/undefined (tests
  // rely on this to exercise the unavailable path); only fall back to the real
  // detector when the caller omitted the key entirely.
  const detect = Object.prototype.hasOwnProperty.call(opts, 'detectAnthropic')
    ? opts.detectAnthropic
    : detectSubs.detectAnthropic;
  let available = false;
  try {
    if (typeof detect === 'function') {
      const r = detect();
      available = !!(r && r.available);
    }
  } catch {
    available = false; // graceful: any detector failure → treat as unavailable
  }
  return ANTHROPIC_CATALOG.map((m) => Object.assign({}, m, { available }));
}

module.exports = {
  discoverAnthropicModels,
  ANTHROPIC_CATALOG,
};
