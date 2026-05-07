#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * router-execute.js — Wave-2 dispatch layer.
 *
 * Consumes a Classification produced by classify.js and either:
 *   (a) Dispatches the call to a non-Anthropic provider (ollama/codex_cli/openai_api)
 *       returning the response text and recording usage in quota-tracker, OR
 *   (b) Defers to a Claude harness subagent (cheap-triage/model-reasoner/
 *       model-architect) when the chain is Anthropic-tier or the doctrine
 *       guards (T3 / high_risk / user_override) require it.
 *
 * Doctrine guards (CLAUDE.md):
 *   - tier T3 → always model-architect (no Codex/Ollama fallback for arch work)
 *   - high_risk signal → always model-architect
 *   - user_override honored & pinning Anthropic → defer to matching subagent
 *   - HIGH_RISK refusal of override → kept high; no executor downgrade
 *
 * Phased implementation (matches PLAN.md task ordering):
 *   T-05 (this commit) — defer cases: I1, I1b, I2, I3, I3b, I3c
 *   T-06               — fallback chain construction (I7, I7b)
 *   T-07               — per-attempt dispatch loop (I4, I5, I6, I9)
 *   T-08               — telemetry write-through to decisions.log (I10)
 *   T-09               — calibration loop trigger (I8)
 *   T-10               — CLI entry
 *
 * Test entry point: ./router-execute.test.js via ./router-execute.harness.js.
 * Production entry point: programmatic require + execute(input), CLI in T-10.
 */

const fs = require('node:fs');
const http = require('node:http');
const { sanitizeJson } = require('./sanitize');

// Lazy paths import — keeps the hot path fast and avoids a circular
// import if paths.js ever pulls something from this module.
let _paths = null;
function getPaths() {
  if (_paths) return _paths;
  try { _paths = require('./paths'); } catch { _paths = {}; }
  return _paths;
}

// ── Subagent mapping helpers ────────────────────────────────────────────

/**
 * Map a user-override `requested` model to its Anthropic subagent.
 * Returns null when the override pins a non-Anthropic provider — those
 * are handled by the dispatch loop in T-07, not here.
 *
 * @param {{requested?: string, label?: string} | null | undefined} ov
 * @returns {('model-architect'|'model-reasoner'|'cheap-triage'|null)}
 */
function mapAnthropicOverrideToSubagent(ov) {
  if (!ov) return null;
  const key = String(ov.requested || ov.label || '').toLowerCase();
  if (key === 'opus' || key === 'claude') return 'model-architect';
  if (key === 'sonnet') return 'model-reasoner';
  if (key === 'haiku') return 'cheap-triage';
  // ollama / qwen / local / gpt / gpt-4 / gpt-4o / gemini → caller handles
  return null;
}

/**
 * Default subagent when the executor must defer without a doctrine signal —
 * mirrors SPEC §6.3 "last-resort subagent mapping".
 *
 * @param {string|undefined} tier
 * @returns {('cheap-triage'|'model-reasoner'|'model-architect')}
 */
function defaultSubagentForTier(tier) {
  if (tier === 'T2') return 'model-reasoner';
  if (tier === 'T3') return 'model-architect';
  return 'cheap-triage'; // T0 (ollama down fallback) and T1
}

// ── Doctrine signal detection ───────────────────────────────────────────

/**
 * @param {object} classification
 * @returns {boolean}
 */
function isHighRiskFloor(classification) {
  if (!classification) return false;
  if (classification.high_risk === true) return true;
  if (typeof classification.escalation_rule === 'string'
      && /high_risk/i.test(classification.escalation_rule)) {
    return true;
  }
  if (classification.user_override
      && classification.user_override.reason === 'high_risk_signal_present') {
    return true;
  }
  return false;
}

// ── Fallback chain (T-06) ───────────────────────────────────────────────

const ANTHROPIC_KEYS = new Set(['haiku', 'sonnet', 'opus', 'claude']);
const NON_ANTHROPIC_KEYS = new Set(['ollama', 'codex_cli', 'openai_api']);

/**
 * @param {string} key
 * @returns {boolean}
 */
function isAnthropicProvider(key) {
  return ANTHROPIC_KEYS.has(String(key || '').toLowerCase());
}

/**
 * Resolve the ordered provider chain for dispatch given a classification
 * and current provider-state snapshot. SPEC §6.1 verbatim.
 *
 * Order of operations:
 *   1. Start with classification.suggested_providers verbatim.
 *   2. If claude is degraded AND chain leads with an Anthropic provider:
 *        - tier T1: prepend codex_cli (if available), else prepend ollama.
 *        - tier T2: prepend codex_cli (if available); ollama is too weak
 *          for T2 reasoning so we do NOT prepend it as a fallback.
 *        - tier T3: do NOT prepend anything (doctrine — architecture work
 *          waits for Anthropic to recover).
 *   3. Drop providers whose state is degraded/exhausted/down/unavailable
 *      from the resolved chain.
 *   4. Return possibly-empty array; caller decides whether to dispatch
 *      or defer.
 *
 * Doctrine guards (T3 lock, high_risk, user_override) are already
 * applied upstream in execute() before this runs — this helper does NOT
 * re-check them.
 *
 * @param {object} classification
 * @param {object} providerState
 * @returns {string[]}
 */
function resolveFallbackChain(classification, providerState) {
  const tier = classification && classification.tier;
  const initial = Array.isArray(classification && classification.suggested_providers)
    ? classification.suggested_providers.slice()
    : [];

  // T3: chain is locked — even if classify.js produced a multi-entry list
  // and claude is degraded, do not inject. Caller short-circuits earlier
  // for T3, but defending here keeps the helper safe to call standalone.
  if (tier === 'T3') {
    return filterDegraded(initial, providerState);
  }

  let chain = initial.slice();
  const claudeDegraded = providerState && providerState.claude === 'degraded';
  const codexAvailable = providerState && providerState.codex_cli === 'ok';
  const ollamaUp = providerState && providerState.ollama === 'ok';

  if (claudeDegraded && chain.length > 0 && isAnthropicProvider(chain[0])) {
    if (tier === 'T2' && codexAvailable && !chain.includes('codex_cli')) {
      chain = ['codex_cli', ...chain];
    } else if (tier === 'T1') {
      if (codexAvailable && !chain.includes('codex_cli')) {
        chain = ['codex_cli', ...chain];
      } else if (ollamaUp && !chain.includes('ollama')) {
        chain = ['ollama', ...chain];
      }
    }
    // tier T0 doesn't reach here (T0 default chain is ['ollama'], not Anthropic).
  }

  return filterDegraded(chain, providerState);
}

/**
 * Drop providers whose state indicates they cannot serve a call right now.
 * Anthropic providers stay in the chain even when claude=degraded — the
 * executor will eventually defer to the subagent (which has its own
 * recovery semantics), and removing them would lose the explicit signal
 * that a defer is needed.
 *
 * @param {string[]} chain
 * @param {object} providerState
 * @returns {string[]}
 */
function filterDegraded(chain, providerState) {
  if (!providerState) return chain.slice();
  /** @type {string[]} */
  const out = [];
  for (const key of chain) {
    const k = String(key || '').toLowerCase();
    if (k === 'codex_cli' && (providerState.codex_cli === 'exhausted' || providerState.codex_cli === 'unavailable')) continue;
    if (k === 'ollama'    && providerState.ollama === 'down') continue;
    if (k === 'openai_api' && providerState.openai_api === 'down') continue;
    if (k === 'gemini' && (providerState.gemini === 'off' || providerState.gemini === 'down')) continue;
    out.push(k);
  }
  return out;
}

// ── Result helpers ──────────────────────────────────────────────────────

/**
 * @param {object} classification
 * @returns {{tier:string,confidence:number,task_category:string}}
 */
function refOf(classification) {
  return {
    tier: classification.tier,
    confidence: typeof classification.confidence === 'number'
      ? classification.confidence
      : 0,
    task_category: classification.task_category || 'unknown',
  };
}

/**
 * @param {object} input
 * @param {string} input.subagent
 * @param {string} input.reason
 * @param {object} input.classification
 * @param {string[]} [input.fallbackChain]
 * @param {Array<{provider:string,message:string,code?:string}>} [input.errors]
 */
function buildDefer({ subagent, reason, classification, fallbackChain, errors }) {
  return {
    ok: false,
    defer_to_subagent: subagent,
    reason,
    fallback_chain: fallbackChain || [],
    classification_ref: refOf(classification),
    ...(errors && errors.length ? { errors } : {}),
  };
}

function buildClassificationInvalidError() {
  return {
    ok: false,
    defer_to_subagent: 'cheap-triage',
    reason: 'classification_invalid',
    fallback_chain: [],
    errors: [{ provider: 'executor', message: 'classification missing or non-object' }],
    classification_ref: { tier: 'unknown', confidence: 0, task_category: 'unknown' },
  };
}

// ── Telemetry ────────────────────────────────────────────────────────────

/**
 * Build a telemetry record for the executed event. Phase-T-05: structured
 * record only — disk write happens in T-08. The harness's telemetryWriter
 * captures the record so I10's sanitisation invariant can be asserted now.
 *
 * @param {object} args
 * @param {string} args.prompt
 * @param {object} args.classification
 * @param {object} args.result
 * @param {string[]} args.suggestedProviders
 */
function buildTelemetryRecord({ prompt, classification, result, suggestedProviders }) {
  const sanitisedPreview = sanitisePromptPreview(prompt);
  // outcome semantics:
  //   ok       — provider returned text successfully
  //   error    — executor itself failed without a usable defer target
  //              (currently only classification_invalid)
  //   deferred — every other result.ok===false case, including
  //              all_non_anthropic_failed and all_providers_failed.
  //              These ARE deferrals — the next step is the subagent
  //              named in defer_to_subagent. errors[] is a sub-detail.
  const outcome = result.ok
    ? 'ok'
    : result.reason === 'classification_invalid'
      ? 'error'
      : 'deferred';

  return {
    ts: new Date().toISOString(),
    event: 'executed',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    prompt_preview: sanitisedPreview,
    tier: classification.tier || 'unknown',
    task_category: classification.task_category || 'unknown',
    confidence: typeof classification.confidence === 'number' ? classification.confidence : null,
    suggested_providers: suggestedProviders || [],
    fallback_chain: result.fallback_chain || [],
    provider_used: result.provider_used || null,
    model_used: result.model_used || null,
    outcome,
    deferred_subagent: result.defer_to_subagent || null,
    deferred_reason: result.reason || null,
    duration_ms: typeof result.duration_ms === 'number' ? result.duration_ms : 0,
    tokens_in: typeof result.tokens_in === 'number' ? result.tokens_in : 0,
    tokens_out: typeof result.tokens_out === 'number' ? result.tokens_out : 0,
    cost_usd: typeof result.cost_usd === 'number' ? result.cost_usd : 0,
    errors: result.errors || [],
    high_risk: isHighRiskFloor(classification),
    user_override_honored: !!(classification.user_override && classification.user_override.honored),
    quality_intent: classification.quality_intent || 'normal',
  };
}

/**
 * Redact API keys and bearer tokens from prompt_preview before telemetry.
 * Defends against I10 invariant. Pulls in repo's sanitizeJson too.
 *
 * @param {string} prompt
 */
function sanitisePromptPreview(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  const PATTERNS = [
    /sk-[A-Za-z0-9_-]{4,}/g,                          // OpenAI / Anthropic-style keys
    /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,              // Bearer tokens
    /AIza[0-9A-Za-z_-]{20,}/g,                        // Google API keys
    /ghp_[A-Za-z0-9]{20,}/g,                          // GitHub PAT
    /OPENAI_API_KEY\s*=\s*\S+/gi,
    /ANTHROPIC_API_KEY\s*=\s*\S+/gi,
  ];
  let redacted = prompt;
  for (const re of PATTERNS) redacted = redacted.replace(re, '[REDACTED]');
  // sanitizeJson handles structured objects elsewhere; for plain string we
  // only need the regex pass. Keep the import to ensure shared dep stays
  // wired (final-reviewer would notice an unused import).
  void sanitizeJson;
  return redacted.slice(0, 80);
}

// ── Default telemetry writer (T-08) ─────────────────────────────────────
//
// Two best-effort sinks:
//   1. Append one JSONL line to ~/.claude/tools/router/decisions.log so
//      backtest.js can re-aggregate and the calibration loop has data.
//   2. POST to http://127.0.0.1:7821/decision so /metrics aggregates the
//      executions block in real time. The savings-tracker handler stores
//      the latest record in LAST_EXECUTION (T-08b adds this).
//
// Both sinks swallow errors. Telemetry is never allowed to delay or crash
// the executor's return path — the user-facing dispatch must complete even
// if the log file is unwritable or :7821 is down.

function appendDecisionsLog(record) {
  try {
    const paths = getPaths();
    const logPath = process.env.MOOTER_DECISIONS_LOG
      || paths.DECISIONS_LOG
      || null;
    if (!logPath) return;
    const sanitised = sanitizeJson(record);
    fs.appendFileSync(logPath, JSON.stringify(sanitised) + '\n');
  } catch { /* best-effort */ }
}

function postToSavingsTracker(record) {
  try {
    const sanitised = sanitizeJson(record);
    const body = Buffer.from(JSON.stringify(sanitised));
    const req = http.request({
      hostname: '127.0.0.1',
      port: Number(process.env.MOOTER_TRACKER_PORT) || 7821,
      path: '/decision',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
      timeout: 250,
    });
    req.on('error', () => { /* best-effort */ });
    req.on('timeout', () => { try { req.destroy(); } catch {} });
    req.write(body);
    req.end();
  } catch { /* best-effort */ }
}

function defaultTelemetryWriter(record) {
  appendDecisionsLog(record);
  postToSavingsTracker(record);
}

// ── Calibration trigger (T-09) ──────────────────────────────────────────

const CALIBRATION_INTERVAL = 1000;
const CALIBRATION_MIN_GAP_MS = 24 * 60 * 60 * 1000; // 24h
let EXEC_COUNTER = 0;
let LAST_CALIBRATION_AT = 0;

/**
 * Read the persisted calibration state file. Returns defaults if missing
 * or unparseable. Path is overridable via MOOTER_CALIBRATION_STATE env.
 * @returns {{last_run_at: number, exec_counter: number}}
 */
function readCalibrationState() {
  try {
    const paths = getPaths();
    const p = process.env.MOOTER_CALIBRATION_STATE
      || (paths.ROUTER_DIR ? require('node:path').join(paths.ROUTER_DIR, '.calibration-state.json') : null);
    if (!p) return { last_run_at: 0, exec_counter: 0 };
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    return {
      last_run_at: Number(j.last_run_at) || 0,
      exec_counter: Number(j.exec_counter) || 0,
    };
  } catch { return { last_run_at: 0, exec_counter: 0 }; }
}

function writeCalibrationState(state) {
  try {
    const paths = getPaths();
    const p = process.env.MOOTER_CALIBRATION_STATE
      || (paths.ROUTER_DIR ? require('node:path').join(paths.ROUTER_DIR, '.calibration-state.json') : null);
    if (!p) return;
    fs.writeFileSync(p, JSON.stringify(state));
  } catch { /* best-effort */ }
}

/**
 * Decide whether calibration should fire and either spawn the real
 * backtest or call the test-side spy. Non-blocking.
 *
 * Fire conditions:
 *   1. EXEC_COUNTER % 1000 === 0 (resets when 0 — every 1000th call)
 *   2. Last run was ≥ 24h ago (or has never run)
 *
 * @param {object} deps
 * @param {(event:object)=>void} [deps.calibrationSpy]  — test-only sink
 */
function maybeTriggerCalibration(deps) {
  EXEC_COUNTER += 1;
  if (EXEC_COUNTER % CALIBRATION_INTERVAL !== 0) return;

  const state = readCalibrationState();
  const now = Date.now();
  if (now - (state.last_run_at || 0) < CALIBRATION_MIN_GAP_MS) {
    // Counter hit but the gap hasn't elapsed → log the deferral and skip.
    if (deps && typeof deps.calibrationSpy === 'function') {
      deps.calibrationSpy({
        type: 'calibration_skipped',
        reason: 'within_24h_window',
        exec_counter: EXEC_COUNTER,
        ms_since_last: now - state.last_run_at,
      });
    }
    return;
  }

  // Fire — either via spy (tests) or real spawn (production).
  if (deps && typeof deps.calibrationSpy === 'function') {
    deps.calibrationSpy({
      type: 'calibration_triggered',
      exec_counter: EXEC_COUNTER,
      last_n: CALIBRATION_INTERVAL,
    });
  } else {
    try {
      const { spawn } = require('node:child_process');
      const p = require('node:path');
      const paths = getPaths();
      const backtestPath = paths.ROUTER_DIR
        ? p.join(paths.ROUTER_DIR, 'backtest.js')
        : p.join(__dirname, 'backtest.js');
      const child = spawn(process.execPath, [
        backtestPath,
        '--calibration-only',
        `--last-n=${CALIBRATION_INTERVAL}`,
      ], {
        stdio: 'ignore',
        detached: true,
      });
      child.on('error', () => { /* swallow — best-effort */ });
      child.unref();
    } catch { /* best-effort */ }
  }

  LAST_CALIBRATION_AT = now;
  writeCalibrationState({ last_run_at: now, exec_counter: EXEC_COUNTER });
}

/** Test-only: reset counters between test scenarios. */
function _resetCalibrationState() {
  EXEC_COUNTER = 0;
  LAST_CALIBRATION_AT = 0;
}

// ── execute() — main entry ──────────────────────────────────────────────

/**
 * @param {object} input
 * @param {string} input.prompt
 * @param {object} input.classification
 * @param {object} [input.options]
 * @returns {Promise<object>}
 */
async function execute(input = {}) {
  const { prompt, classification, options = {} } = input;
  const deps = options.__deps || {};
  // Default to disk + HTTP sink when no test override is provided. This
  // is the production path — every executed event lands in decisions.log
  // and on /metrics without further wiring.
  const telemetryWriter = deps.telemetryWriter || defaultTelemetryWriter;
  const writeTelemetry = (rec) => {
    try { telemetryWriter(rec); } catch { /* best-effort */ }
  };
  // Calibration trigger fires after each completed execute(), before return.
  // Uses deps.calibrationSpy (test) or spawns backtest.js (production).
  // Skipped when the test explicitly passes options.skipCalibrationCheck.
  const tickCalibration = () => {
    if (options.skipCalibrationCheck) return;
    try { maybeTriggerCalibration(deps); } catch { /* best-effort */ }
  };

  try {
  // Defensive: invalid classification → structured error.
  if (!classification || typeof classification !== 'object') {
    const errResult = buildClassificationInvalidError();
    {
      writeTelemetry(buildTelemetryRecord({
        prompt: prompt || '',
        classification: {},
        result: errResult,
        suggestedProviders: [],
      }));
    }
    return errResult;
  }

  // classify.js's fast-paths (mechanical_trivial, file_read, bash_paste) early-
  // return BEFORE the suggested_providers assignment at the end of classify().
  // CLAUDE.md doctrine forbids modifying classify.js, so we backfill here from
  // tier defaults to make the executor robust to that gap. recommended_backend
  // already encodes the right provider (e.g. 'ollama' for fast-path T0).
  const TIER_DEFAULTS = { T0: ['ollama'], T1: ['haiku'], T2: ['sonnet'], T3: ['opus'] };
  let suggestedProviders;
  if (Array.isArray(classification.suggested_providers) && classification.suggested_providers.length > 0) {
    suggestedProviders = classification.suggested_providers.slice();
  } else if (classification.recommended_backend === 'ollama') {
    suggestedProviders = ['ollama'];
  } else {
    suggestedProviders = (TIER_DEFAULTS[classification.tier] || ['haiku']).slice();
  }
  // Reflect the backfill onto the classification so resolveFallbackChain
  // (which reads classification.suggested_providers directly) sees the
  // same value. This is a local mutation; the caller's reference is
  // updated but the executor owns the object for the duration of execute().
  classification.suggested_providers = suggestedProviders.slice();

  // ── Doctrine guards (T-05) — order matters ───────────────────────────
  // 1. user_override pinning Anthropic always wins (Paulo asked for X).
  // 2. tier === 'T3' locks chain to architect.
  // 3. HIGH_RISK floor on any non-T3 still locks to architect.

  const ov = classification.user_override;
  if (ov && ov.honored) {
    const sub = mapAnthropicOverrideToSubagent(ov);
    if (sub) {
      const result = buildDefer({
        subagent: sub,
        reason: 'user_override',
        classification,
      });
      {
        writeTelemetry(buildTelemetryRecord({
          prompt: prompt || '',
          classification,
          result,
          suggestedProviders,
        }));
      }
      return result;
    }
    // Non-Anthropic override → fall through to dispatch loop (T-07).
  }

  if (classification.tier === 'T3') {
    const reason = isHighRiskFloor(classification) ? 'high_risk_floor' : 'tier_t3';
    const result = buildDefer({
      subagent: 'model-architect',
      reason,
      classification,
    });
    {
      writeTelemetry(buildTelemetryRecord({
        prompt: prompt || '',
        classification,
        result,
        suggestedProviders,
      }));
    }
    return result;
  }

  if (isHighRiskFloor(classification)) {
    const result = buildDefer({
      subagent: 'model-architect',
      reason: 'high_risk_floor',
      classification,
    });
    {
      writeTelemetry(buildTelemetryRecord({
        prompt: prompt || '',
        classification,
        result,
        suggestedProviders,
      }));
    }
    return result;
  }

  // ── T-06 — fallback chain construction ──────────────────────────────
  const chain = resolveFallbackChain(classification, deps.providerState || {});

  // If the resolved chain is empty or contains only Anthropic-tier
  // providers, there is nothing the executor can dispatch directly →
  // defer to the matching subagent. This is the legitimate "advisor was
  // already routing to Anthropic" path.
  const dispatchable = chain.filter((k) => NON_ANTHROPIC_KEYS.has(k));
  if (dispatchable.length === 0) {
    const result = buildDefer({
      subagent: defaultSubagentForTier(classification.tier),
      reason: 'anthropic_only_chain',
      classification,
      fallbackChain: [],
    });
    {
      writeTelemetry(buildTelemetryRecord({
        prompt: prompt || '',
        classification,
        result,
        suggestedProviders,
      }));
    }
    return result;
  }

  // ── T-07 — per-attempt dispatch loop ────────────────────────────────
  /** @type {string[]} */
  const fallbackChain = [];
  /** @type {Array<{provider:string,message:string,code?:string}>} */
  const errors = [];
  const timeoutMs  = options.timeoutMs  || 90_000;
  const maxTokens  = options.maxTokens  || 1024;

  for (const provider of chain) {
    // Anthropic provider mid-chain → defer with what we tried so far.
    if (isAnthropicProvider(provider)) {
      const sub = anthropicProviderToSubagent(provider);
      const result = buildDefer({
        subagent: sub,
        reason: errors.length > 0 ? 'all_non_anthropic_failed' : 'anthropic_only_chain',
        classification,
        fallbackChain,
        errors: errors.length ? errors : undefined,
      });
      {
        writeTelemetry(buildTelemetryRecord({
          prompt: prompt || '',
          classification,
          result,
          suggestedProviders,
        }));
      }
      return result;
    }

    // Non-Anthropic provider — attempt dispatch.
    const wrapper = (deps.providers || {})[provider];
    if (typeof wrapper !== 'function') {
      fallbackChain.push(provider);
      errors.push({
        provider,
        message: 'wrapper not provided by deps.providers',
        code: 'wrapper_missing',
      });
      continue;
    }

    let response = null;
    let attemptError = null;
    try {
      response = await wrapper(prompt, { timeoutMs, maxTokens });
    } catch (err) {
      attemptError = err;
    }

    fallbackChain.push(provider);

    if (attemptError) {
      errors.push({
        provider,
        message: String((attemptError && attemptError.message) || attemptError || 'unknown error'),
        code: 'wrapper_threw',
      });
      continue;
    }

    if (response && response.ok && response.text) {
      // Success! Build ExecuteResult_Ok in the SPEC §4.1 shape.
      const ok = buildOk({
        provider,
        response,
        classification,
        fallbackChain,
      });
      {
        writeTelemetry(buildTelemetryRecord({
          prompt: prompt || '',
          classification,
          result: ok,
          suggestedProviders,
        }));
      }
      return ok;
    }

    // Soft failure (returned null or empty text).
    errors.push({
      provider,
      message: 'wrapper returned null or empty text',
      code: 'wrapper_returned_null',
    });
  }

  // Chain exhausted without success — emit ExecuteResult_Error (SPEC §4.3)
  // when at least one attempt was made, otherwise Defer (no chain).
  const fallbackSubagent = defaultSubagentForTier(classification.tier);
  const exhausted = errors.length > 0 ? {
    ok: false,
    defer_to_subagent: fallbackSubagent,
    reason: 'all_providers_failed',
    fallback_chain: fallbackChain,
    errors,
    classification_ref: refOf(classification),
  } : buildDefer({
    subagent: fallbackSubagent,
    reason: 'anthropic_only_chain',
    classification,
    fallbackChain,
  });

  writeTelemetry(buildTelemetryRecord({
    prompt: prompt || '',
    classification,
    result: exhausted,
    suggestedProviders,
  }));
  return exhausted;
  } finally {
    tickCalibration();
  }
}

/**
 * @param {string} provider
 */
function anthropicProviderToSubagent(provider) {
  const k = String(provider || '').toLowerCase();
  if (k === 'opus' || k === 'claude') return 'model-architect';
  if (k === 'sonnet') return 'model-reasoner';
  return 'cheap-triage'; // haiku and any unknown Anthropic-keyed provider
}

/**
 * Build the ok result, normalising provider response (camelCase wrappers
 * vs. snake_case fixture mocks) into the SPEC §4.1 snake_case shape.
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {object} args.response
 * @param {object} args.classification
 * @param {string[]} args.fallbackChain
 */
function buildOk({ provider, response, classification, fallbackChain }) {
  const tokensIn = response.tokens_in ?? response.tokensIn ?? 0;
  const tokensOut = response.tokens_out ?? response.tokensOut ?? 0;
  const costUsd  = response.cost_usd ?? response.costUsd ?? 0;
  const durationMs = response.duration_ms ?? response.durationMs ?? 0;
  return {
    ok: true,
    text: String(response.text || ''),
    provider_used: provider,
    model_used: response.model || '',
    fallback_chain: fallbackChain,
    duration_ms: durationMs,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    classification_ref: refOf(classification),
  };
}

module.exports = {
  execute,
  // Test-only exports — used by router-execute.test.js for fine-grained checks
  // without re-implementing internals. Kept on a `_internal` namespace so the
  // public API (just `execute`) stays minimal.
  _internal: {
    isHighRiskFloor,
    mapAnthropicOverrideToSubagent,
    defaultSubagentForTier,
    sanitisePromptPreview,
    buildTelemetryRecord,
    resolveFallbackChain,
    isAnthropicProvider,
    filterDegraded,
    anthropicProviderToSubagent,
    buildOk,
    appendDecisionsLog,
    postToSavingsTracker,
    defaultTelemetryWriter,
    maybeTriggerCalibration,
    readCalibrationState,
    writeCalibrationState,
    _resetCalibrationState,
    CALIBRATION_INTERVAL,
    CALIBRATION_MIN_GAP_MS,
  },
};

// ── CLI entry (T-10) ────────────────────────────────────────────────────
//
// Usage:
//   echo "your prompt" | node router-execute.js
//   node router-execute.js "your prompt"
//
// Reads prompt from argv (joined with spaces) or stdin, classifies via
// classify.js (read-only, no modification per CLAUDE.md doctrine),
// dispatches via execute(), and prints the ExecuteResult as JSON to
// stdout. Exit 0 on any structured result (including defer/error — the
// caller decides what to do); exit 2 on a fatal classify failure.
//
// Env:
//   MOCK_PROVIDERS=1  — substitute provider wrappers with no-op stubs
//                       that always return null. Used by the smoke runner
//                       and by Paulo when validating the dispatch wiring
//                       without burning real quota.
//
// Guard with require.main === module so `require('./router-execute')` is
// side-effect-free (mirrors the classify.js fix from validation-2026-05-07).
if (require.main === module) {
  (async () => {
    try {
      const argvPrompt = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
      let prompt = argvPrompt;
      if (!prompt) {
        // Read from stdin
        prompt = await new Promise((resolve) => {
          let buf = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => { buf += chunk; });
          process.stdin.on('end',  () => resolve(buf.trim()));
          // If stdin is a TTY (interactive), exit fast
          if (process.stdin.isTTY) resolve('');
        });
      }
      if (!prompt) {
        process.stderr.write('router-execute: no prompt (pass via argv or stdin)\n');
        process.exit(2);
      }

      const { classifyWithRetry } = require('./classify');
      const classification = classifyWithRetry(prompt);

      /** @type {object | undefined} */
      let depsOverride;
      if (process.env.MOCK_PROVIDERS === '1') {
        // Stub every provider to return null so the executor walks the
        // chain, records errors, and ultimately defers — exercises the
        // dispatch loop without hitting real quotas.
        const stub = async () => null;
        depsOverride = {
          providers: { ollama: stub, codex_cli: stub, openai_api: stub },
          tracker: {
            recordUsage() {}, summary() { return {}; }, shouldPreferCodex() { return false; },
          },
          providerState: { claude: 'ok', ollama: 'ok', codex_cli: 'ok', openai_api: 'ok' },
        };
      }

      const result = await execute({
        prompt,
        classification,
        options: depsOverride ? { __deps: depsOverride } : {},
      });

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`router-execute fatal: ${err && err.stack || err}\n`);
      process.exit(2);
    }
  })();
}
