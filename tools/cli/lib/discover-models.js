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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { paths } = require('./paths');

let detectSubs = {};
try {
  // tools/cli/lib → ../../router
  detectSubs = require('../../router/detect-subscriptions');
} catch {
  /* detector module unavailable → discover functions degrade to unavailable */
}

function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

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

// ── Sessão B — non-Anthropic providers ─────────────────────────────────
// Codex CLI, OpenAI direct, and local Ollama. Unlike the Anthropic catalog
// (whose entries map to subagents pinnable via the router hint), these models
// are dispatched by router-execute.js and carry no subagent — the generated
// skill invokes the executor directly (leaky tool-result UX).

// OpenAI models the router actually knows (model-intelligence.json, web
// 2026-05): gpt-5.4 is the current OpenAI T2 pick (replaced gpt-4o); o3 is the
// reasoning model. We do NOT invent identifiers the codebase never references.
const OPENAI_CATALOG = Object.freeze([
  { slug: 'openai-gpt-5-4', model: 'gpt-5.4', displayName: 'GPT-5.4 (OpenAI API)', provider: 'openai-api' },
  { slug: 'openai-o3',      model: 'o3',      displayName: 'o3 (OpenAI API)',      provider: 'openai-api' },
].map(Object.freeze));

/** Codex CLI — runs whatever model `codex` is configured with (no pin). */
function discoverCodexModels(opts = {}) {
  const detect = hasOwn(opts, 'detectCodex') ? opts.detectCodex : detectSubs.detectCodexCli;
  let available = false;
  try {
    if (typeof detect === 'function') {
      const r = detect();
      available = !!(r && r.available);
    }
  } catch { available = false; }
  // model:null → router-execute omits -m and uses the Codex CLI default.
  return [{ slug: 'codex', model: null, displayName: 'Codex CLI (ChatGPT)', provider: 'codex-cli', available }];
}

/** OpenAI direct — available iff OPENAI_API_KEY is present (no smoke ping). */
function discoverOpenAiModels(opts = {}) {
  const available = hasOwn(opts, 'available')
    ? !!opts.available
    : !!process.env.OPENAI_API_KEY;
  return OPENAI_CATALOG.map((m) => Object.assign({}, m, { available }));
}

function loadHwCapability(opts = {}) {
  if (hasOwn(opts, 'hwCapability')) return opts.hwCapability;
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.router, 'hw-capability.json'), 'utf8'));
  } catch { return null; }
}

/** Slugify an Ollama model id: `qwen3:30b` → `qwen3-30b`, `qwen2.5-coder:7b` → `qwen2-5-coder-7b`. */
function ollamaSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Local Ollama models from `ollama list`. Excludes embedding models and any
 * model the hw-capability probe marked can_run:false. Returns [] when Ollama
 * is unavailable or the listing fails.
 */
function discoverOllamaModels(opts = {}) {
  let available;
  if (hasOwn(opts, 'available')) {
    available = !!opts.available;
  } else {
    try {
      const r = typeof detectSubs.detectOllama === 'function' ? detectSubs.detectOllama() : null;
      available = !!(r && r.available);
    } catch { available = false; }
  }
  if (!available) return [];

  let listOutput = opts.listOutput;
  if (listOutput === undefined) {
    try {
      listOutput = execSync('ollama list', { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return []; }
  }

  const hw = loadHwCapability(opts);
  const blocked = new Set();
  if (hw && Array.isArray(hw.t0_models_available)) {
    for (const e of hw.t0_models_available) {
      if (e && e.can_run === false && e.model) blocked.add(e.model);
    }
  }

  const out = [];
  const seen = new Set();
  for (const line of String(listOutput).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const name = trimmed.split(/\s+/)[0];
    if (!name || /^name$/i.test(name)) continue;  // header row
    if (/embed/i.test(name)) continue;             // embedding model, not a chat model
    if (blocked.has(name)) continue;               // GPU can't run it
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      slug: ollamaSlug(name),
      model: name,
      displayName: `${name} (local Ollama)`,
      provider: 'ollama',
      available: true,
    });
  }
  return out;
}

/**
 * Discover every pinnable model across all providers.
 * @returns {{anthropic:Array, codex:Array, openai:Array, ollama:Array, preferCodex:boolean}}
 */
function discoverAllModels(opts = {}) {
  const anthropic = discoverAnthropicModels(opts.anthropic || {});
  const codex = discoverCodexModels(opts.codex || {});
  const openai = discoverOpenAiModels(opts.openai || {});
  const ollama = discoverOllamaModels(opts.ollama || {});
  // When both a ChatGPT sub (Codex) and an OpenAI key exist, prefer Codex
  // (quota is bundled / cheaper) — surfaced as a marker, both stay available.
  const preferCodex = codex.some((m) => m.available) && openai.some((m) => m.available);
  return { anthropic, codex, openai, ollama, preferCodex };
}

/** Flatten a discoverAllModels() result into a single ordered array. */
function flattenModels(all) {
  return [...all.anthropic, ...all.codex, ...all.openai, ...all.ollama];
}

module.exports = {
  discoverAnthropicModels,
  discoverCodexModels,
  discoverOpenAiModels,
  discoverOllamaModels,
  discoverAllModels,
  flattenModels,
  ollamaSlug,
  ANTHROPIC_CATALOG,
  OPENAI_CATALOG,
};
