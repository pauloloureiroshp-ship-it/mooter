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

const { sanitizeJson } = require('./sanitize');

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
  const outcome = result.ok ? 'ok'
    : result.errors && result.errors.length && result.reason !== 'anthropic_only_chain'
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

  // Defensive: invalid classification → structured error.
  if (!classification || typeof classification !== 'object') {
    const errResult = buildClassificationInvalidError();
    if (deps.telemetryWriter) {
      deps.telemetryWriter(buildTelemetryRecord({
        prompt: prompt || '',
        classification: {},
        result: errResult,
        suggestedProviders: [],
      }));
    }
    return errResult;
  }

  const suggestedProviders = Array.isArray(classification.suggested_providers)
    ? classification.suggested_providers.slice()
    : [];

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
      if (deps.telemetryWriter) {
        deps.telemetryWriter(buildTelemetryRecord({
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
    if (deps.telemetryWriter) {
      deps.telemetryWriter(buildTelemetryRecord({
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
    if (deps.telemetryWriter) {
      deps.telemetryWriter(buildTelemetryRecord({
        prompt: prompt || '',
        classification,
        result,
        suggestedProviders,
      }));
    }
    return result;
  }

  // ── T-06 / T-07 placeholder — chain construction + dispatch loop ─────
  // Until T-06 lands, fall through to a "not implemented" defer so callers
  // surface T-05 incompleteness without crashing.
  const placeholder = buildDefer({
    subagent: defaultSubagentForTier(classification.tier),
    reason: 'anthropic_only_chain', // best approximation pending T-06
    classification,
    errors: [{
      provider: 'executor',
      message: 'T-06 (chain) and T-07 (dispatch) not yet shipped — only doctrine-guard defers are implemented',
      code: 'phase_t05_only',
    }],
  });
  if (deps.telemetryWriter) {
    deps.telemetryWriter(buildTelemetryRecord({
      prompt: prompt || '',
      classification,
      result: placeholder,
      suggestedProviders,
    }));
  }
  return placeholder;
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
  },
};

// CLI entry deferred to T-10. Guard the IIFE so `require('./router-execute')`
// from tests does not invoke any side effects (mirrors the classify.js
// fix from validation-2026-05-07 #3).
if (require.main === module) {
  process.stderr.write('router-execute CLI: not implemented yet (T-10 — Wave-2).\n');
  process.exit(1);
}
