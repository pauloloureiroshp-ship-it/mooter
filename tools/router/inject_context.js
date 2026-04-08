#!/usr/bin/env node
/**
 * inject_context.js — UserPromptSubmit hook entry point.
 *
 * Reads the user prompt from the hook stdin payload and prints a short
 * routing hint to stdout. Claude Code's UserPromptSubmit hook injects
 * stdout as additional context for the turn — non-blocking, non-destructive.
 *
 * Designed to NEVER fail loudly: any error → silent exit 0 (no context).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFile } = require('child_process');

// v0.7 feature flag — set FRUGAL_V07_DISABLE=1 to revert to v0.6.1 behaviour
// (no hook cache, sync budget fetch, no quality intent bypass). Useful as a
// kill-switch if anything regresses.
const V07_DISABLED = process.env.FRUGAL_V07_DISABLE === '1';

// frugal savings-tracker + Ollama warmup — auto-start if pid file is stale.
// v0.7: pid-file check replaces the fire-and-forget HTTP GET /health socket
// (avoids TCP connect overhead on every hook invocation) and also drives the
// Ollama warmup helper so T0 calls don't pay a cold-start penalty.
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const TRACKER_PID_PATH = path.join(ROUTER_DIR, '.tracker.pid');
const TRACKER_STALE_MS = 60 * 60 * 1000; // 1h

(function startTracker() {
  let stale = true;
  try {
    const stat = fs.statSync(TRACKER_PID_PATH);
    if (Date.now() - stat.mtimeMs < TRACKER_STALE_MS) stale = false;
  } catch { /* no pid file → stale */ }
  if (!stale) return;

  const script = path.join(ROUTER_DIR, 'savings-tracker.js');
  if (!fs.existsSync(script)) return;
  try {
    const child = execFile('node', [script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* best-effort */ }

  // Fire-and-forget Ollama warmup — primes qwen2.5:3b in RAM with keep_alive=-1
  // so Option A and T0-general calls don't eat the 8-10s cold load. The warmup
  // script returns immediately after POSTing; Ollama holds the model.
  try {
    const warmup = path.join(ROUTER_DIR, 'ollama-warmup.js');
    if (fs.existsSync(warmup)) {
      const wc = execFile('node', [warmup], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      wc.unref();
    }
  } catch { /* best-effort */ }
})();

// ── Budget cache & async refresh (v0.7) ─────────────────────────────────────
// Before v0.7 the hook was blocked up to 3s on every cache miss while it
// spawned a child to hit /api/oauth/usage. That's ~20% of prompts after a
// sleep/wake cycle. Now:
//   1. Cache hit  → return immediately (~1ms).
//   2. Cache miss → return null and spawn a DETACHED child to refresh in
//      background. Next hook invocation sees the fresh cache.
//   3. HIGH_RISK prompt + stale cache → keep sync behaviour (safety).
const BUDGET_CACHE_PATH = path.join(ROUTER_DIR, '.budget-cache.json');
const BUDGET_REFRESH_LOCK = path.join(ROUTER_DIR, '.budget-refresh.lock');
const BUDGET_CACHE_MS = 2 * 60 * 60 * 1000;      // 2h — considered fresh
const BUDGET_STALE_HARD_MS = 4 * 60 * 60 * 1000; // 4h — sync fetch on HIGH_RISK
const BUDGET_LOCK_STALE_MS = 30 * 1000;          // 30s — assume refresh died

function readBudgetCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
    if (!cached || !cached.ts) return null;
    const age = Date.now() - cached.ts;
    return { cached, age, stale: age >= BUDGET_CACHE_MS, veryStale: age >= BUDGET_STALE_HARD_MS };
  } catch { return null; }
}

function spawnBudgetRefresh() {
  // Guard: don't spawn if another refresh is in flight.
  try {
    const stat = fs.statSync(BUDGET_REFRESH_LOCK);
    if (Date.now() - stat.mtimeMs < BUDGET_LOCK_STALE_MS) return;
  } catch { /* no lock → proceed */ }
  try {
    fs.writeFileSync(BUDGET_REFRESH_LOCK, String(Date.now()));
  } catch { /* non-fatal */ }

  const refreshScript = path.join(ROUTER_DIR, 'refresh-budget.js');
  if (!fs.existsSync(refreshScript)) return;
  try {
    const child = execFile('node', [refreshScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* best-effort */ }
}

/**
 * Get budget for tier capping.
 * - Always returns in < 5ms when cache is fresh.
 * - Spawns a background refresh when stale but not expired.
 * - Only blocks (≤ 2500ms) on very-stale cache + HIGH_RISK prompt.
 */
function getBudget(promptText, isHighRisk) {
  if (V07_DISABLED) return fetchBudgetSyncLegacy();

  const state = readBudgetCache();

  // Fresh cache → return immediately.
  if (state && !state.stale && state.cached.data && state.cached.data.type !== 'error') {
    return state.cached.data;
  }

  // Stale but not expired → async refresh + return null (no cap, safe default).
  // EXCEPT if we're in a HIGH_RISK path and the cache is very stale — then
  // block to get fresh data because guardrail accuracy matters more than UX.
  const veryStaleHighRisk = isHighRisk && (!state || state.veryStale);
  if (!veryStaleHighRisk) {
    spawnBudgetRefresh();
    if (state && state.cached.data && state.cached.data.type !== 'error') {
      // Best-effort: use stale data if we have it rather than null.
      return state.cached.data;
    }
    return null;
  }

  // Sync fetch fallback (HIGH_RISK + very stale).
  return fetchBudgetSyncLegacy();
}

// Legacy sync fetch — preserved as the slow fallback path for HIGH_RISK
// prompts with very-stale cache, and as the kill-switch implementation when
// FRUGAL_V07_DISABLE=1. Behaviour identical to the v0.6.1 version.
function fetchBudgetSyncLegacy() {
  try {
    const cached = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
    if (cached && Date.now() - cached.ts < BUDGET_CACHE_MS && cached.data && cached.data.type !== 'error') {
      return cached.data;
    }
  } catch { /* miss */ }

  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    if (!token) return null;

    const fetchScript = `
      const https = require('https');
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + process.argv[2] }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(2500, () => { req.destroy(); process.exit(2); });
      req.end();
    `;
    const r = spawnSync(process.execPath, ['-e', fetchScript, token], {
      encoding: 'utf8',
      timeout: 3000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    const data = JSON.parse(r.stdout);
    if (data && data.type === 'error') {
      try {
        fs.writeFileSync(BUDGET_CACHE_PATH, JSON.stringify({ ts: Date.now(), data, error: true }));
      } catch { /* non-fatal */ }
      return null;
    }
    try {
      fs.writeFileSync(BUDGET_CACHE_PATH, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* non-fatal */ }
    return data;
  } catch {
    return null;
  }
}

function applyBudgetCap(tier, budget) {
  if (!budget) return tier;
  const fiveHour = budget.five_hour || budget.fiveHour || 0;
  const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

  let maxTier;
  if (fiveHour < 50) maxTier = 'T3';
  else if (fiveHour < 70) maxTier = 'T2';
  else if (fiveHour < 85) maxTier = 'T1';
  else maxTier = 'T0';

  const current = TIER_ORDER.indexOf(tier);
  const max = TIER_ORDER.indexOf(maxTier);
  return current > max ? maxTier : tier;
}

const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');

function logDecision(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* never fail the hook over telemetry */ }
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ── Hook classify cache (v0.7) ──────────────────────────────────────────────
// Cross-session LRU cache keyed by SHA256(prompt). In v0.6.1 classify.js had
// an in-memory Map() that was useless because the hook spawns a fresh Node
// process every turn — the cache always started empty. Now we persist to
// disk. On cache hit we skip the classify.js spawn entirely (~80ms saved).
//
// Invalidation:
//   - TTL 24h
//   - LRU cap 1000 entries
//   - router-tuning.json mtime changes → entire cache wiped
//   - user_override entries are NOT cached (intent may change)
const CLASSIFY_CACHE_PATH = path.join(ROUTER_DIR, '.classify-cache.json');
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');
const CLASSIFY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CLASSIFY_CACHE_MAX = 1000;

function hashPrompt(p) {
  return crypto.createHash('sha256').update(p).digest('hex');
}

function tuningMtime() {
  try { return Math.floor(fs.statSync(TUNING_PATH).mtimeMs); } catch { return 0; }
}

function loadClassifyCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CLASSIFY_CACHE_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') return { tuning_mtime: 0, entries: {} };
    // Invalidate entire cache if router-tuning.json changed since last save.
    if (raw.tuning_mtime !== tuningMtime()) return { tuning_mtime: tuningMtime(), entries: {} };
    return raw;
  } catch { return { tuning_mtime: tuningMtime(), entries: {} }; }
}

function saveClassifyCache(cache) {
  try {
    // LRU eviction: sort by ts, keep newest MAX entries.
    const keys = Object.keys(cache.entries);
    if (keys.length > CLASSIFY_CACHE_MAX) {
      const sorted = keys
        .map((k) => ({ k, ts: cache.entries[k].ts || 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, CLASSIFY_CACHE_MAX);
      const kept = {};
      for (const { k } of sorted) kept[k] = cache.entries[k];
      cache.entries = kept;
    }
    fs.writeFileSync(CLASSIFY_CACHE_PATH, JSON.stringify(cache));
  } catch { /* non-fatal */ }
}

function getClassifyCached(prompt) {
  if (V07_DISABLED) return null;
  const cache = loadClassifyCache();
  const key = hashPrompt(prompt);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CLASSIFY_CACHE_TTL_MS) return null;
  return { decision: entry.decision, cache };
}

function setClassifyCached(prompt, decision, cache) {
  if (V07_DISABLED) return;
  if (decision && decision.user_override) return; // never cache override results
  const c = cache || loadClassifyCache();
  c.entries[hashPrompt(prompt)] = { ts: Date.now(), decision };
  saveClassifyCache(c);
}

// HIGH_RISK marker mirror (for the budget sync fetch decision).
// Kept minimal — classify.js has the exhaustive list; we just need a hint
// for whether to pay the extra 2.5s for fresh budget data on very-stale cache.
const HIGH_RISK_HINT = /\b(?:push|deploy|release|migration|migrac|drop\s+table|rm\s+-rf|reset\s+--hard|\.env|secret|credential|api[_ ]?key|architect|arquitetur|refactor|refator|critical|cr[ií]tic|audit|review\s+final|merge|ci\s+pipeline|\.github\/workflow)/i;

let raw = '';
try {
  raw = require('fs').readFileSync(0, 'utf8');
} catch { /* no stdin */ }

const payload = safeJson(raw) || {};
const prompt =
  payload.prompt ||
  payload.user_prompt ||
  payload.message ||
  (payload.messages && payload.messages[payload.messages.length - 1] &&
    payload.messages[payload.messages.length - 1].content) ||
  '';

if (!prompt || typeof prompt !== 'string' || prompt.length < 4) {
  process.exit(0);
}

// Hook cache lookup before spawning classify.js
let decision = null;
let cacheHit = false;
const cachedResult = getClassifyCached(prompt);
if (cachedResult) {
  decision = cachedResult.decision;
  cacheHit = true;
}

if (!decision) {
  const classifier = path.join(__dirname, 'classify.js');
  const res = spawnSync(process.execPath, [classifier, prompt], {
    encoding: 'utf8',
    timeout: 1500,
  });

  if (res.status !== 0 || !res.stdout) {
    logDecision({ ts: new Date().toISOString(), event: 'classifier_failed', prompt_len: prompt.length });
    process.exit(0);
  }

  decision = safeJson(res.stdout);
  if (!decision) {
    logDecision({ ts: new Date().toISOString(), event: 'parse_failed', prompt_len: prompt.length });
    process.exit(0);
  }

  // Cache the fresh decision (skipped if user_override detected — handled inside setClassifyCached)
  setClassifyCached(prompt, decision);
}

// Always log the decision (low-confidence too — useful for tuning).
// v0.7.2: include ts_ms and session_id so the Stop hook can pair start→end
// events and the savings-tracker can compute turn-level latency.
const sessionId = payload.session_id || (payload.session && payload.session.id) || 'unknown';
logDecision({
  ts: new Date().toISOString(),
  ts_ms: Date.now(),
  event: 'classified',
  session_id: sessionId,
  prompt_len: prompt.length,
  prompt_preview: prompt.slice(0, 80).replace(/\s+/g, ' '),
  tier: decision.tier,
  task_category: decision.task_category,
  recommended_backend: decision.recommended_backend,
  recommended_model: decision.recommended_model,
  confidence: decision.confidence,
  escalation_rule: decision.escalation_rule,
  quality_intent: decision.quality_intent || false,
  cache_hit: cacheHit,
});

// Apply budget guardrail before deciding what to emit.
// v0.7: getBudget is async-by-default; only blocks on HIGH_RISK prompts with
// very-stale cache (safety). High-risk hint is cheap local regex, not the
// full HIGH_RISK list — just needs to cover push/deploy/secret/etc. triggers.
const isHighRisk = HIGH_RISK_HINT.test(prompt);
const budget = getBudget(prompt, isHighRisk);
if (budget) {
  const originalTier = decision.tier;
  decision.tier = applyBudgetCap(decision.tier, budget);
  decision.max_tier = applyBudgetCap('T3', budget);
  if (decision.tier !== originalTier) {
    decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
      ? decision.escalation_rule + '+budget_cap'
      : 'budget_cap';
  }
} else {
  decision.max_tier = 'T3';
}

// Only emit hint when confident enough that it adds value.
if (decision.confidence < 0.6) process.exit(0);

// OPTION A — pre-compute answer via Ollama for confident T0 tasks.
// Injects <suggested_answer> so Claude can output it verbatim, saving
// most reasoning tokens. Falls back silently if Ollama is unavailable.
//
// SKIP Option A when:
//   - The user explicitly pinned a model (user_override honored)
//   - Quality-intent was detected (user wants real reasoning, not regurgitation)
//   - The recommended model is NOT the general 3b model (sub-tier specialists
//     like qwen2.5-coder:14b are too slow for pre-compute and used in the
//     session directly)
//
// Timeout reduced from 9s → 4s in v0.7 — with keep_alive=-1 and the warmup
// helper, qwen2.5:3b answers short prompts in <2s. If we miss, the hint is
// still emitted, so the Claude session just processes normally.
let suggestedAnswer = null;
const userPinnedOverride = decision.user_override && decision.user_override.honored === true;
const isGeneralOllama = decision.recommended_model === 'qwen2.5:3b' || /^qwen2\.5:3b$/.test(decision.recommended_model || '');
if (
  !userPinnedOverride &&
  !decision.quality_intent &&
  decision.tier === 'T0' &&
  isGeneralOllama &&
  decision.confidence >= 0.8 &&
  prompt.length < 500
) {
  try {
    const callScript = path.join(__dirname, 'ollama_call_node.js');
    const ollamaRes = spawnSync(process.execPath, [callScript, prompt], {
      encoding: 'utf8',
      timeout: 4000,
      env: process.env,
    });
    if (ollamaRes.status === 0 && ollamaRes.stdout && ollamaRes.stdout.trim().length > 5) {
      suggestedAnswer = ollamaRes.stdout.trim();
      logDecision({ ts: new Date().toISOString(), event: 'option_a_hit', prompt_len: prompt.length });
    } else {
      logDecision({ ts: new Date().toISOString(), event: 'option_a_miss', status: ollamaRes.status, stderr: (ollamaRes.stderr || '').slice(0, 120) });
    }
  } catch {
    logDecision({ ts: new Date().toISOString(), event: 'option_a_error' });
  }
}

// User override surface — when the prompt explicitly mentions a model, the
// hint includes a USER_OVERRIDE block so the doctrine can honor it without
// re-parsing. Two states: honored=true (user got what they asked for) or
// honored=false (high-risk guardrail refused a downgrade).
const overrideLines = [];
if (decision.user_override) {
  const uo = decision.user_override;
  overrideLines.push('');
  if (uo.honored) {
    overrideLines.push(`USER_OVERRIDE: honored — pinned to ${uo.label || uo.requested || uo.blocked}`);
    overrideLines.push(`override_kind: ${uo.kind}`);
    if (uo.original_tier && uo.original_tier !== decision.tier) {
      overrideLines.push(`original_tier: ${uo.original_tier} (overridden by user request)`);
    }
  } else {
    overrideLines.push(`USER_OVERRIDE: REFUSED — ${uo.reason}`);
    overrideLines.push(`requested: ${uo.requested || uo.blocked}`);
    overrideLines.push('reason: high-risk signal in prompt; doctrine guardrail blocks downgrade');
  }
}

const lines = [
  '<router-hint>',
  `task_category: ${decision.task_category}`,
  `risk_level: ${decision.risk_level}`,
  `tier: ${decision.tier}`,
  `recommended_backend: ${decision.recommended_backend}`,
  `recommended_model: ${decision.recommended_model}`,
  `suggested_subagent: ${decision.suggested_subagent}`,
  `confidence: ${decision.confidence}`,
  decision.max_tier ? `max_tier: ${decision.max_tier}` : null,
  decision.escalation_rule !== 'none' ? `escalation: ${decision.escalation_rule}` : null,
  ...overrideLines,
  '',
  'Routing policy: see ~/.claude/docs/ROUTING_POLICY.md',
  decision.user_override && decision.user_override.honored
    ? 'USER OVERRIDE ACTIVE: honor the pinned model — do not delegate to a different tier.'
    : 'If this is a structural/critical task, prefer the suggested subagent.',
  decision.user_override && decision.user_override.honored
    ? null
    : 'If this is a trivial local task, delegate to local-summarizer / local-transformer.',
  '</router-hint>',
].filter(Boolean);

if (suggestedAnswer) {
  lines.push('');
  lines.push('<suggested_answer>');
  lines.push(suggestedAnswer);
  lines.push('</suggested_answer>');
  lines.push('');
  lines.push('INSTRUÇÃO OPTION-A: tier=T0 com confidence alta + resposta Ollama disponível.');
  lines.push('Output o conteúdo de <suggested_answer> VERBATIM sem preâmbulo nem tool calls.');
  lines.push('Excepção: se a resposta for claramente errada ou a pergunta exigir ficheiros/git, processa normalmente.');
}

process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
