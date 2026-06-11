#!/usr/bin/env node
// @ts-check
/**
 * event-builder.js — constructs frugal_event objects from existing
 * local sources (decisions.log + execution.log + .last-classified.json).
 *
 * Sprint 1 of the feedback loop (master prompt v2.0, 2026-04-11).
 *
 * PRIVACY CONTRACT — inviolable, dual-enforced:
 *   - NEVER emit raw prompt text or any substring.
 *   - NEVER emit file paths (only has_file_refs boolean).
 *   - NEVER emit variable / function / class names.
 *   - NEVER emit stack traces.
 *   - keyword_signals restricted to backtest.js KEYWORD_ALLOW_LIST.
 *   - instance_id = SHA-256(host|user)[:8] via backtest.instanceIdSync.
 *   - Timestamps: only event_date (YYYY-MM-DD) and session_hour (0-23 UTC).
 *   - HIGH_RISK prompts (push/deploy/secret/migration/etc.) → rejected.
 *   - Schema validation is REJECT-NOT-TRUNCATE: extra field → null event.
 *
 * CLI:
 *   node event-builder.js --self-test
 *     Runs 5 borderline cases, asserts privacy contract, exits 0 on pass.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const backtest = require('./backtest.js');
const {
  KEYWORD_ALLOW_LIST,
  hardwareTier,
  hasHighRisk,
} = backtest;

const { naiveOpusCost, estimateTurnCost } = require('./pricing.js');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const VERSION_PATH = path.join(ROUTER_DIR, 'version.json');
const CLASSIFY_PATH = path.join(ROUTER_DIR, 'classify.js');

// ─── Allowed output schema ───────────────────────────────────────────────
// Any key on a produced event that is not in this set is a schema bug and
// causes validateEventPrivacy() to reject the whole event.
const ALLOWED_FIELDS = new Set([
  'id', 'instance_id', 'frugal_version', 'classifier_version',
  'hardware_tier', 'ab_variant',
  'decided_tier', 'confidence', 'task_category', 'escalation_rule',
  'prompt_len_bucket', 'has_file_refs', 'has_code_block', 'keyword_signals',
  'actual_model_used', 'subagent_spawned', 'wall_clock_ms',
  'inter_prompt_gap_ms', 'response_len_bucket', 'cascade_upgrade',
  'retry_detected', 'ollama_warm', 'gpu_util_pct',
  'explicit_rating', 'explicit_feedback_type',
  'algorithm_version', 'prompt_complexity_score',
  'outcome_score', 'outcome_source', 'per_decision_savings_usd',
  'session_hour', 'event_date', 'created_at',
  'user_id_hash',
]);

// 16-hex stable hash of the authenticated Supabase user_id. Persisted by
// mooter-login.js after GitHub OAuth; absent for anonymous installs.
const USER_HASH_PATH = path.join(os.homedir(), '.frugal', 'user.hash');
const USER_HASH_RE = /^[a-f0-9]{16}$/;

// ─── Banned content patterns ────────────────────────────────────────────
// Scanned across every string-valued field (except id/instance_id/
// created_at/event_date which have trusted shapes). Any hit → reject.
const BANNED_PATTERNS = [
  /\//,                                    // unix-style path separator
  /\\/,                                    // windows path separator
  /\.(ts|tsx|js|jsx|py|go|rs|md|json|yml|yaml|sql|sh|env|toml)\b/i, // extensions
  /\b[A-Z][a-z]+Error\b/,                  // stack trace error names
  /\bat\s+\w+\s*\(/,                       // stack frame
  /T\d{2}:\d{2}:\d{2}/,                    // minute/second-precision ISO
  /https?:/i,                              // URLs
];

// Fields exempt from the BANNED_PATTERNS scan (their shape is controlled
// upstream — UUID, 8-char hex, ISO date, etc.).
const EXEMPT_FIELDS = new Set([
  'id', 'instance_id', 'created_at', 'event_date',
]);

// ─── Utilities ──────────────────────────────────────────────────────────

/** @param {number | null | undefined} n @returns {string} */
function lenBucket(n) {
  const v = n || 0;
  if (v < 50) return '0-50';
  if (v < 100) return '50-100';
  if (v < 200) return '100-200';
  if (v < 500) return '200-500';
  return '500+';
}

/** @param {number | null | undefined} n @returns {string} */
function responseBucketFromLen(n) {
  const v = n || 0;
  if (v < 500) return '0-500';
  if (v < 1000) return '500-1000';
  if (v < 2000) return '1000-2000';
  return '2000+';
}

function instanceIdSync() {
  try {
    const mid = os.hostname() + '|' + (os.userInfo().username || '');
    return crypto.createHash('sha256').update(mid).digest('hex').slice(0, 8);
  } catch { return 'unknown0'; }
}

function readFrugalVersion() {
  try {
    const j = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
    return String(j.version || '0.0.0');
  } catch { return '0.0.0'; }
}

function readClassifierVersion() {
  try {
    const src = fs.readFileSync(CLASSIFY_PATH, 'utf8');
    return crypto.createHash('sha256').update(src).digest('hex').slice(0, 8);
  } catch { return 'unknown0'; }
}

function readUserIdHash() {
  try {
    const v = fs.readFileSync(USER_HASH_PATH, 'utf8').trim();
    return USER_HASH_RE.test(v) ? v : null;
  } catch { return null; }
}

/** @param {string | null | undefined} preview @returns {string[]} */
function extractKeywordSignals(preview) {
  if (!preview || typeof preview !== 'string') return [];
  const low = preview.toLowerCase();
  const hits = [];
  for (const kw of KEYWORD_ALLOW_LIST) {
    if (low.includes(kw)) hits.push(kw);
  }
  return hits;
}

function makeId() {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return crypto.randomBytes(16).toString('hex');
}

// ─── Privacy validation ─────────────────────────────────────────────────

/**
 * @param {Record<string, any> | null | undefined} event
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateEventPrivacy(event) {
  if (!event || typeof event !== 'object') {
    return { ok: false, reason: 'not_object' };
  }

  // Field allow-list — reject any extra top-level keys.
  for (const k of Object.keys(event)) {
    if (!ALLOWED_FIELDS.has(k)) {
      return { ok: false, reason: `extra_field:${k}` };
    }
  }

  // Required fields.
  const required = [
    'id', 'instance_id', 'frugal_version', 'classifier_version',
    'hardware_tier', 'decided_tier', 'confidence', 'task_category',
    'prompt_len_bucket', 'has_file_refs', 'has_code_block',
    'keyword_signals', 'session_hour', 'event_date', 'created_at',
  ];
  for (const k of required) {
    if (event[k] === undefined || event[k] === null) {
      return { ok: false, reason: `missing_required:${k}` };
    }
  }

  // Scan string values for banned content patterns.
  for (const [k, v] of Object.entries(event)) {
    if (typeof v !== 'string') continue;
    if (EXEMPT_FIELDS.has(k)) continue;
    // keyword_signals is the JSON-encoded allow-listed array — skip here,
    // we validate it field-wise below.
    if (k === 'keyword_signals') continue;
    for (const pat of BANNED_PATTERNS) {
      if (pat.test(v)) {
        return { ok: false, reason: `banned_pattern_in:${k}` };
      }
    }
  }

  // keyword_signals must be a JSON array of tokens from KEYWORD_ALLOW_LIST.
  try {
    const kws = JSON.parse(event.keyword_signals);
    if (!Array.isArray(kws)) return { ok: false, reason: 'keyword_signals_not_array' };
    for (const kw of kws) {
      if (typeof kw !== 'string') return { ok: false, reason: 'keyword_signals_not_string' };
      if (!KEYWORD_ALLOW_LIST.has(kw)) {
        return { ok: false, reason: `banned_keyword:${kw}` };
      }
    }
  } catch { return { ok: false, reason: 'keyword_signals_parse' }; }

  // Tier must be canonical.
  if (!['T0', 'T1', 'T2', 'T3'].includes(event.decided_tier)) {
    return { ok: false, reason: 'invalid_tier' };
  }

  // event_date shape guard (YYYY-MM-DD exact).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) {
    return { ok: false, reason: 'event_date_shape' };
  }

  // session_hour shape guard (0..23 integer).
  const sh = event.session_hour;
  if (!Number.isInteger(sh) || sh < 0 || sh > 23) {
    return { ok: false, reason: 'session_hour_shape' };
  }

  return { ok: true };
}

// ─── Event builder ──────────────────────────────────────────────────────
/**
 * Build a frugal_event from a decisions.log `classified` entry plus
 * optional execution.log rows and .last-classified.json state.
 *
 * Returns a validated event object, or null on any rejection (missing
 * fields, schema violation, privacy violation, HIGH_RISK content).
 *
 * Parameters
 * ──────────
 *   classified       — parsed decisions.log entry (event='classified')
 *   execEntries      — array of parsed execution.log rows for the same
 *                       session in the turn window. Each row shape:
 *                       { ts_ms, session, model, role, cmd }
 *   lastClassified   — parsed .last-classified.json for this session;
 *                       provides turn_end_ts, response_len_bucket,
 *                       cascade_upgrade, inter_prompt_gap_ms when set
 *   opts             — { explicit_rating, explicit_feedback_type,
 *                       ab_variant, frugal_version, classifier_version }
 */
/**
 * @param {Record<string, any> | null | undefined} classified
 * @param {Array<Record<string, any>> | null | undefined} execEntries
 * @param {Record<string, any> | null | undefined} lastClassified
 * @param {Record<string, any> | null | undefined} opts
 * @returns {Record<string, any> | null}
 */
function buildEvent(classified, execEntries, lastClassified, opts) {
  opts = opts || {};
  if (!classified || typeof classified !== 'object') return null;
  if (classified.event !== 'classified') return null;
  if (!classified.tier) return null;

  // Dual-enforce HIGH_RISK filter. Anything that matches the guardrail
  // must NEVER enter the feedback corpus, even if the classifier already
  // routed it correctly.
  if (hasHighRisk(classified.prompt_preview || '')) return null;

  const promptLen = classified.prompt_len || 0;
  const promptLenBucket = lenBucket(promptLen);
  const keywordSignals = extractKeywordSignals(classified.prompt_preview || '');

  // actual_model_used + subagent_spawned derived from exec rows.
  // First non-null model wins; subagent_spawned=1 if any cmd starts with
  // "agent:" (exec-logger replaces the command with an "agent:<type>"
  // marker when the tool call was an Agent/Task spawn).
  let actualModelUsed = null;
  let subagentSpawned = 0;
  if (Array.isArray(execEntries)) {
    for (const e of execEntries) {
      if (!e) continue;
      if (!actualModelUsed && e.model && e.model !== 'unknown') {
        actualModelUsed = e.model;
      }
      if (e.cmd && typeof e.cmd === 'string' && e.cmd.startsWith('agent:')) {
        subagentSpawned = 1;
      }
    }
  }

  // wall_clock_ms — only if .last-classified provided a turn_end_ts that
  // post-dates the classified event. Otherwise null (Stop hook may not
  // have paired yet).
  let wallClockMs = null;
  if (lastClassified && lastClassified.turn_end_ts && classified.ts_ms) {
    const delta = lastClassified.turn_end_ts - classified.ts_ms;
    if (delta >= 0 && delta < 30 * 60 * 1000) wallClockMs = delta;
  }

  // Temporal: derive session_hour + event_date from the classified ts
  // (UTC hour only, date without time).
  let eventDate = null;
  let sessionHour = null;
  try {
    const d = classified.ts ? new Date(classified.ts) : new Date();
    eventDate = d.toISOString().slice(0, 10);
    sessionHour = d.getUTCHours();
  } catch {
    const now = new Date();
    eventDate = now.toISOString().slice(0, 10);
    sessionHour = now.getUTCHours();
  }

  const event = {
    id: makeId(),
    instance_id: instanceIdSync(),
    frugal_version: opts.frugal_version || readFrugalVersion(),
    classifier_version: opts.classifier_version || readClassifierVersion(),
    hardware_tier: hardwareTier(),
    ab_variant: opts.ab_variant || null,

    decided_tier: classified.tier,
    confidence: Number(classified.confidence || 0),
    task_category: classified.task_category || 'unknown',
    escalation_rule: classified.escalation_rule && classified.escalation_rule !== 'none'
      ? classified.escalation_rule
      : null,
    prompt_len_bucket: promptLenBucket,
    has_file_refs: classified.has_file_refs ? 1 : 0,
    has_code_block: classified.has_code_block ? 1 : 0,
    keyword_signals: JSON.stringify(keywordSignals),

    actual_model_used: actualModelUsed,
    subagent_spawned: subagentSpawned,
    wall_clock_ms: wallClockMs,
    inter_prompt_gap_ms: (lastClassified && Number.isInteger(lastClassified.inter_prompt_gap_ms))
      ? lastClassified.inter_prompt_gap_ms : null,
    response_len_bucket: (lastClassified && lastClassified.response_len_bucket) || null,
    cascade_upgrade: (lastClassified && lastClassified.cascade_upgrade != null)
      ? (lastClassified.cascade_upgrade ? 1 : 0) : null,
    retry_detected: (lastClassified && lastClassified.retry_detected != null)
      ? (lastClassified.retry_detected ? 1 : 0) : null,
    ollama_warm: (lastClassified && lastClassified.ollama_warm != null)
      ? (lastClassified.ollama_warm ? 1 : 0) : null,
    gpu_util_pct: null,

    explicit_rating: (opts.explicit_rating === -1 || opts.explicit_rating === 0 || opts.explicit_rating === 1)
      ? opts.explicit_rating : null,
    explicit_feedback_type: opts.explicit_feedback_type || null,

    algorithm_version: classified.algorithm_version || null,
    prompt_complexity_score: classified.prompt_complexity_score != null
      ? Number(classified.prompt_complexity_score) : null,
    outcome_score: null,
    outcome_source: null,
    per_decision_savings_usd: (() => {
      try {
        const naive = naiveOpusCost(promptLen);
        const actual = estimateTurnCost(classified.tier, promptLen);
        return Math.round((naive - actual) * 1e6) / 1e6;
      } catch { return null; }
    })(),

    session_hour: sessionHour,
    event_date: eventDate,
    created_at: new Date().toISOString(),

    user_id_hash: opts.user_id_hash || readUserIdHash(),
  };

  // Strip user_id_hash if it ended up null — the privacy validator's
  // "missing required" check is name-based, but the ALLOWED_FIELDS check
  // does not require optional fields. Keeping it as `null` is fine, but
  // we drop it for a cleaner shape on disk and lower bandwidth.
  if (event.user_id_hash == null) delete event.user_id_hash;

  const val = validateEventPrivacy(event);
  if (!val.ok) {
    return null;
  }
  return event;
}

// ─── Self-test ──────────────────────────────────────────────────────────

/** @returns {number} */
function runSelfTest() {
  /** @type {Array<{ name: string, pass: boolean, detail: string }>} */
  const results = [];
  let failed = 0;

  /**
   * @param {string} name
   * @param {boolean} pass
   * @param {string} detail
   */
  function record(name, pass, detail) {
    results.push({ name, pass, detail });
    if (!pass) failed++;
  }

  // Case 1 — normal classified event should produce a valid event.
  {
    const classified = {
      ts: '2026-04-11T14:23:45.000Z',
      ts_ms: 1776000000000,
      event: 'classified',
      session_id: 'sess-001',
      prompt_len: 87,
      prompt_preview: 'please summarize the commit message and explain',
      tier: 'T0',
      task_category: 'trivial_local',
      confidence: 0.88,
      escalation_rule: 'none',
      has_file_refs: false,
      has_code_block: false,
    };
    const evt = buildEvent(classified, [], null, {
      frugal_version: '0.9.4',
      classifier_version: 'abcd1234',
    });
    const pass = evt !== null
      && evt.decided_tier === 'T0'
      && evt.prompt_len_bucket === '50-100'
      && JSON.parse(evt.keyword_signals).includes('commit')
      && JSON.parse(evt.keyword_signals).includes('message')
      && JSON.parse(evt.keyword_signals).includes('summarize')
      && JSON.parse(evt.keyword_signals).includes('explain');
    record('case_1_normal_t0', pass, evt ? JSON.stringify(Object.keys(evt)).slice(0, 120) : 'null');
  }

  // Case 2 — HIGH_RISK prompt (git push --force) must be rejected.
  {
    const classified = {
      ts: '2026-04-11T14:23:45.000Z',
      ts_ms: 1776000000000,
      event: 'classified',
      session_id: 'sess-002',
      prompt_len: 30,
      prompt_preview: 'git push --force origin main',
      tier: 'T3',
      task_category: 'critical',
      confidence: 0.95,
      escalation_rule: 'high_risk',
      has_file_refs: false,
      has_code_block: false,
    };
    const evt = buildEvent(classified, [], null, {});
    record('case_2_high_risk_rejected', evt === null, evt ? 'leaked' : 'rejected');
  }

  // Case 3 — classified + exec entries showing subagent spawn should
  // surface subagent_spawned=1 and actual_model_used=qwen.
  {
    const classified = {
      ts: '2026-04-11T10:00:00.000Z',
      ts_ms: 1775990000000,
      event: 'classified',
      session_id: 'sess-003',
      prompt_len: 140,
      prompt_preview: 'explain this bug please',
      tier: 'T1',
      task_category: 'explain_error',
      confidence: 0.72,
      escalation_rule: 'none',
      has_file_refs: false,
      has_code_block: false,
    };
    const execEntries = [
      { ts_ms: 1775990010000, session: 'sess-003', model: 'qwen3:30b', role: 'local', cmd: 'agent:local-summarizer' },
      { ts_ms: 1775990015000, session: 'sess-003', model: 'qwen3:30b', role: 'local', cmd: 'node something' },
    ];
    const evt = buildEvent(classified, execEntries, null, {});
    const pass = evt !== null
      && evt.subagent_spawned === 1
      && evt.actual_model_used === 'qwen3:30b';
    record('case_3_subagent_spawn', pass, evt ? `sub=${evt.subagent_spawned} m=${evt.actual_model_used}` : 'null');
  }

  // Case 4 — lastClassified with turn_end_ts yields wall_clock_ms.
  {
    const classified = {
      ts: '2026-04-11T09:00:00.000Z',
      ts_ms: 1775980000000,
      event: 'classified',
      session_id: 'sess-004',
      prompt_len: 210,
      prompt_preview: 'please debug this error and explain the fix',
      tier: 'T2',
      task_category: 'bug_investigation',
      confidence: 0.80,
      escalation_rule: 'none',
      has_file_refs: false,
      has_code_block: false,
    };
    const last = {
      session_id: 'sess-004',
      turn_end_ts: 1775980004500,
      response_len_bucket: '500-1000',
      cascade_upgrade: false,
    };
    const evt = buildEvent(classified, [], last, {});
    const pass = evt !== null
      && evt.wall_clock_ms === 4500
      && evt.response_len_bucket === '500-1000'
      && evt.cascade_upgrade === 0;
    record('case_4_wall_clock_from_last', pass, evt ? `wc=${evt.wall_clock_ms}` : 'null');
  }

  // Case 5 — privacy attack: a crafted event with an extra top-level
  // field ("prompt_raw") carrying a file path must be rejected by
  // validateEventPrivacy.
  {
    const tainted = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      instance_id: 'abcd1234',
      frugal_version: '0.9.4',
      classifier_version: 'deadbeef',
      hardware_tier: 'gpu-high',
      ab_variant: null,
      decided_tier: 'T0',
      confidence: 0.9,
      task_category: 'trivial_local',
      escalation_rule: null,
      prompt_len_bucket: '0-50',
      has_file_refs: 0,
      has_code_block: 0,
      keyword_signals: '[]',
      actual_model_used: null,
      subagent_spawned: 0,
      wall_clock_ms: null,
      inter_prompt_gap_ms: null,
      response_len_bucket: null,
      cascade_upgrade: null,
      retry_detected: null,
      ollama_warm: null,
      gpu_util_pct: null,
      explicit_rating: null,
      explicit_feedback_type: null,
      session_hour: 10,
      event_date: '2026-04-11',
      created_at: '2026-04-11T10:00:00.000Z',
      // ——— attack surface ———
      prompt_raw: 'src/hub/worker.ts',
    };
    const val = validateEventPrivacy(tainted);
    record('case_5_extra_field_rejected', val.ok === false && /extra_field/.test(val.reason || ''), val.reason || 'ok');
  }

  // Case 6 (bonus) — banned pattern inside a legitimate field
  // (task_category containing a file path). Must be rejected.
  {
    const tainted = {
      id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
      instance_id: 'abcd1234',
      frugal_version: '0.9.4',
      classifier_version: 'deadbeef',
      hardware_tier: 'gpu-high',
      ab_variant: null,
      decided_tier: 'T0',
      confidence: 0.9,
      task_category: 'edit_file_src/hub/worker.ts',
      escalation_rule: null,
      prompt_len_bucket: '0-50',
      has_file_refs: 0,
      has_code_block: 0,
      keyword_signals: '[]',
      actual_model_used: null,
      subagent_spawned: 0,
      wall_clock_ms: null,
      inter_prompt_gap_ms: null,
      response_len_bucket: null,
      cascade_upgrade: null,
      retry_detected: null,
      ollama_warm: null,
      gpu_util_pct: null,
      explicit_rating: null,
      explicit_feedback_type: null,
      session_hour: 10,
      event_date: '2026-04-11',
      created_at: '2026-04-11T10:00:00.000Z',
    };
    const val = validateEventPrivacy(tainted);
    record('case_6_banned_pattern_rejected', val.ok === false && /banned_pattern/.test(val.reason || ''), val.reason || 'ok');
  }

  // Case 7 — scan every produced event's keys from case 1/3/4 and
  // assert none contain raw text markers. Belt-and-braces.
  {
    const classifieds = [
      { ts: '2026-04-11T14:00:00.000Z', ts_ms: 1, event: 'classified', session_id: 's', prompt_len: 42,
        prompt_preview: 'summarize the commit please', tier: 'T0', task_category: 'trivial_local',
        confidence: 0.9, escalation_rule: 'none', has_file_refs: false, has_code_block: false },
      { ts: '2026-04-11T14:00:00.000Z', ts_ms: 1, event: 'classified', session_id: 's', prompt_len: 220,
        prompt_preview: 'debug this error step by step', tier: 'T2', task_category: 'bug_investigation',
        confidence: 0.8, escalation_rule: 'none', has_file_refs: false, has_code_block: false },
    ];
    let allOk = true;
    for (const c of classifieds) {
      const evt = buildEvent(c, [], null, {});
      if (!evt) { allOk = false; break; }
      for (const [k, v] of Object.entries(evt)) {
        if (!ALLOWED_FIELDS.has(k)) { allOk = false; break; }
        if (typeof v === 'string' && !EXEMPT_FIELDS.has(k) && k !== 'keyword_signals') {
          for (const pat of BANNED_PATTERNS) {
            if (pat.test(v)) { allOk = false; break; }
          }
        }
      }
    }
    record('case_7_no_leak_across_produced_events', allOk, allOk ? 'clean' : 'leaked');
  }

  // Print report.
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`  [${mark}] ${r.name} — ${r.detail}\n`);
  }
  const total = results.length;
  const passed = total - failed;
  process.stdout.write(`\nevent-builder self-test: ${passed}/${total} passed\n`);
  return failed === 0 ? 0 : 1;
}

// ─── CLI ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(runSelfTest());
  }
  process.stdout.write('event-builder.js — use --self-test to run the privacy contract tests\n');
  process.exit(0);
}

module.exports = {
  buildEvent,
  validateEventPrivacy,
  ALLOWED_FIELDS,
  BANNED_PATTERNS,
  EXEMPT_FIELDS,
  lenBucket,
  responseBucketFromLen,
  extractKeywordSignals,
  instanceIdSync,
};
