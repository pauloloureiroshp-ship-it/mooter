'use strict';

// decisions_v2.js — Wave 19 (19.B): structured per-call decision log.
//
// A richer companion to decisions.log: one JSON line per routed decision, shaped
//   { ts, op, tier, llm, tokens_in, tokens_out, reason, via }
// `mooter trail --calls` reads it for a per-call breakdown. The legacy
// decisions.log writer is left untouched — this is an additive DUAL write, so
// every existing reader (statusline, backtest, `mooter trail`) keeps working.
//
// PRIVACY: records carry ONLY routing metadata. The raw prompt and the
// decisions.log `prompt_preview` field are NEVER copied here — `sanitize()`
// whitelists exactly the schema fields as defense-in-depth.

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_FIELDS = ['ts', 'op', 'tier', 'llm', 'tokens_in', 'tokens_out', 'reason', 'via'];

function routerDir() {
  const claude = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || path.join(os.homedir(), '.claude');
  return path.join(claude, 'tools', 'router');
}

/** Path to decisions_v2.jsonl (env-overridable for tests). */
function logPath() {
  return process.env.MOOTER_DECISIONS_V2_LOG || path.join(routerDir(), 'decisions_v2.jsonl');
}

/** Short, stable llm label from a model id, falling back to the tier default. */
function shortLlm(model, tier) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (/qwen|llama|gemma|deepseek|mistral|phi/.test(m)) return m.split(/[@\s]/)[0];
  if (m) return m;
  return { T0: 'qwen3:30b', T1: 'haiku', T2: 'sonnet', T3: 'opus' }[tier] || 'unknown';
}

/**
 * Human-readable routing reason, built ONLY from real decision fields — never
 * invented. Mirrors the brief's vocabulary (safety_boost_*, classify_score=X).
 */
function deriveReason(d = {}) {
  if (d.safety_boost_applied && d.safety_boost_reason) {
    return `safety_boost_${String(d.safety_boost_reason).split(/[:(]/)[0].trim()}`;
  }
  if (d.escalation_rule) return String(d.escalation_rule);
  const conf = typeof d.confidence === 'number' ? d.confidence.toFixed(2) : '?';
  return `classify_score=${conf} ${d.tier || '?'}`;
}

/**
 * Build a v2 record from a classify decision object. Pure. Only emits schema
 * fields — token counts default to 0 when the decision predates execution
 * (they are not invented; real per-tier token totals live in token_tracker.js).
 */
function recordFromDecision(d = {}, opts = {}) {
  return {
    ts: opts.ts || d.ts || new Date(opts.now || Date.now()).toISOString(),
    op: d.task_category || d.op || 'classify',
    tier: d.tier || null,
    llm: shortLlm(d.recommended_model || d.llm, d.tier),
    tokens_in: Number(d.tokens_in) || 0,
    tokens_out: Number(d.tokens_out) || 0,
    reason: deriveReason(d),
    via: d.suggested_subagent || d.via || d.recommended_backend || 'inline',
  };
}

/** Whitelist to exactly the schema fields (defense-in-depth against PII). */
function sanitize(rec = {}) {
  const out = {};
  for (const k of SCHEMA_FIELDS) {
    if (rec[k] !== undefined) out[k] = rec[k];
    else out[k] = (k === 'tokens_in' || k === 'tokens_out') ? 0 : null;
  }
  return out;
}

/** Append one decision as a sanitized JSONL line. Best-effort, never throws. */
function appendFromDecision(d, opts = {}) {
  try {
    const rec = sanitize(recordFromDecision(d, opts));
    fs.appendFileSync(opts.logPath || logPath(), JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  } catch {
    return null; // telemetry is best-effort — never break the caller
  }
}

/**
 * Read v2 records (newest `limit` kept). Skips junk + tierless lines. Returns []
 * on a missing file. Pure read — never throws. Used by `mooter trail --calls`
 * and the Stop session report.
 */
function readRecords(opts = {}) {
  let raw;
  try { raw = fs.readFileSync(opts.logPath || logPath(), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r && r.tier) out.push(r);
  }
  return opts.limit ? out.slice(-opts.limit) : out;
}

module.exports = {
  SCHEMA_FIELDS,
  shortLlm,
  deriveReason,
  recordFromDecision,
  sanitize,
  appendFromDecision,
  readRecords,
  logPath,
};
