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

// v0.9: hook-start timestamp for cascade latency reporting.
global.__frugal_hook_start = Date.now();

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

// ── Onboarding check (v0.9.2) ─────────────────────────────────────────────
// Se hw-capability.json ou subscription-profile.json estão ausentes,
// corre onboarding.js de forma síncrona antes de classificar.
// Só corre uma vez por instalação. Silencioso se onboarding.js não existe.
const HW_CAP_PATH   = path.join(ROUTER_DIR, 'hw-capability.json');
const SUB_PROF_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');

if (!fs.existsSync(HW_CAP_PATH) || !fs.existsSync(SUB_PROF_PATH)) {
  const onboardingPath = path.join(ROUTER_DIR, 'onboarding.js');
  if (fs.existsSync(onboardingPath)) {
    spawnSync(process.execPath, [onboardingPath], { stdio: 'inherit' });
  }
}
// ─────────────────────────────────────────────────────────────────────────

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

// ── Subscription profile (v0.9.1) ─────────────────────────────────────────
// Reads the user-declared subscription profile to adjust budget cap behaviour.
// Cached for the entire hook invocation (file read once, not per-prompt).
const SUB_PROFILE_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');
let _subProfileCache = undefined;

function readSubscriptionProfile() {
  if (_subProfileCache !== undefined) return _subProfileCache;
  try {
    _subProfileCache = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8'));
  } catch {
    _subProfileCache = null;
  }
  return _subProfileCache;
}

function applyBudgetCap(tier, budget) {
  if (!budget) return tier;

  // v0.9.1: Claude Max users have no budget cap
  const subProfile = readSubscriptionProfile();
  if (subProfile && subProfile.profiles && subProfile.profiles.anthropic === 'max') {
    return tier;
  }

  const fiveHour = budget.five_hour || budget.fiveHour || 0;
  const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

  let maxTier;
  if (fiveHour < 50) maxTier = 'T3';
  else if (fiveHour < 70) maxTier = 'T2';
  else if (fiveHour < 85) maxTier = 'T1';
  else maxTier = 'T0';

  // v0.9.1: api-free users get aggressive cap (shift thresholds down)
  if (subProfile && subProfile.profiles && subProfile.profiles.anthropic === 'api-free') {
    if (fiveHour < 30) maxTier = 'T3';
    else if (fiveHour < 50) maxTier = 'T1';
    else maxTier = 'T0';
  }

  const current = TIER_ORDER.indexOf(tier);
  const max = TIER_ORDER.indexOf(maxTier);
  return current > max ? maxTier : tier;
}

const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const EXEC_LOG_PATH = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');

// v0.12: session compliance — count how many Bash calls in this session
// actually ran in Opus vs a cheaper tier. Used to inject a runtime
// directive when compliance drops to 0% (session is all-Opus even though
// the router keeps recommending T0/T1). Bounded tail (256 KB), silent on
// failure. Returns { bashCount, opusCount, nonOpusCount } or null.
function readSessionCompliance(sid) {
  if (!sid || sid === 'unknown') return null;
  try {
    if (!fs.existsSync(EXEC_LOG_PATH)) return null;
    const stat = fs.statSync(EXEC_LOG_PATH);
    const start = Math.max(0, stat.size - 256 * 1024);
    const fd = fs.openSync(EXEC_LOG_PATH, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const rawLines = buf.toString('utf8').split('\n').filter(Boolean);
    let bashCount = 0;
    let opusCount = 0;
    for (const line of rawLines) {
      const sm = line.match(/session=(\S+)/);
      if (!sm || sm[1] !== sid) continue;
      const mm = line.match(/model=(\S+)/);
      if (!mm) continue;
      bashCount++;
      if (/opus/i.test(mm[1])) opusCount++;
    }
    return { bashCount, opusCount, nonOpusCount: bashCount - opusCount };
  } catch { return null; }
}

// v0.10: read the most recent classified tier for this session from
// decisions.log. Bounded tail (32 KB) — silent on failure. Used to seed
// FRUGAL_PREV_TIER for the follow-up inheritance rule in classify.js.
function readLastSessionTier(sid) {
  if (!sid || sid === 'unknown') return null;
  try {
    const stat = fs.statSync(LOG_PATH);
    const size = stat.size;
    const start = Math.max(0, size - 32768);
    const fd = fs.openSync(LOG_PATH, 'r');
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      if (obj.event !== 'classified') continue;
      if (obj.session_id !== sid) continue;
      if (obj.tier) return obj.tier;
    }
  } catch (e) {}
  return null;
}

function logDecision(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* never fail the hook over telemetry */ }
}

// v0.9: fire-and-forget POST to the tracker. Non-blocking, swallows errors.
// Used for /decision (statusline segment ③) and /arbiter-event (metrics).
function postTracker(urlPath, payload) {
  try {
    const body = JSON.stringify(payload);
    const scriptText = `
      const http = require('http');
      const body = process.argv[2];
      const req = http.request({
        hostname: '127.0.0.1',
        port: 7821,
        path: '${urlPath}',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, (res) => { res.on('data', () => {}); res.on('end', () => process.exit(0)); });
      req.on('error', () => process.exit(0));
      req.setTimeout(250, () => { req.destroy(); process.exit(0); });
      req.write(body);
      req.end();
    `;
    const child = execFile(process.execPath, ['-e', scriptText, body], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* non-fatal */ }
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

// v0.10: include prevTier in the cache key so short follow-ups with different
// inherited tiers don't collide across sessions.
function hashPrompt(p, prevTier) {
  const composite = (p || '') + '|' + (prevTier || '');
  return crypto.createHash('sha256').update(composite).digest('hex');
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

function getClassifyCached(prompt, prevTier) {
  if (V07_DISABLED) return null;
  const cache = loadClassifyCache();
  const key = hashPrompt(prompt, prevTier);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CLASSIFY_CACHE_TTL_MS) return null;
  return { decision: entry.decision, cache };
}

function setClassifyCached(prompt, decision, cache, prevTier) {
  if (V07_DISABLED) return;
  if (decision && decision.user_override) return; // never cache override results
  const c = cache || loadClassifyCache();
  c.entries[hashPrompt(prompt, prevTier)] = { ts: Date.now(), decision };
  saveClassifyCache(c);
}

// HIGH_RISK marker mirror (for the budget sync fetch decision).
// Kept minimal — classify.js has the exhaustive list; we just need a hint
// for whether to pay the extra 2.5s for fresh budget data on very-stale cache.
const HIGH_RISK_HINT = /\b(?:push|deploy|release|migration|migrac|drop\s+table|rm\s+-rf|reset\s+--hard|\.env|secret|credential|api[_ ]?key|architect|arquitetur|refactor|refator|critical|cr[ií]tic|audit|review\s+final|merge|ci\s+pipeline|\.github\/workflow)/i;

// ── Hardware capability cache (v0.9.1) ────────────────────────────────────
// Read hw-capability.json once per hook invocation. If missing, attempt to
// build it from a fresh GPU probe (best-effort, non-blocking).
const HW_CAPABILITY_PATH = path.join(ROUTER_DIR, 'hw-capability.json');
let _hwCapability = undefined;

(function initHwCapability() {
  try {
    _hwCapability = JSON.parse(fs.readFileSync(HW_CAPABILITY_PATH, 'utf8'));
  } catch {
    // No cached capability — try a fresh probe (fire-and-forget write)
    try {
      const { probeSync, buildHwCapability } = require('./gpu-probe');
      const probe = probeSync();
      if (probe && probe.vendor !== 'cpu') {
        _hwCapability = buildHwCapability(probe);
      }
    } catch { /* non-fatal */ }
  }
})();

// ── Hub pull (v0.9.1) — fire-and-forget community config update ────────────
// Checks for newer router-tuning and model-catalog from the hub on session
// startup. Respects a 4h cooldown. Never blocks the hook.
(function maybeHubPull() {
  try {
    const pullScript = path.join(ROUTER_DIR, 'hub-pull.js');
    if (!fs.existsSync(pullScript)) return;
    const lastPullPath = path.join(ROUTER_DIR, '.last-hub-pull');
    try {
      const stat = fs.statSync(lastPullPath);
      if (Date.now() - stat.mtimeMs < 4 * 60 * 60 * 1000) return; // 4h cooldown
    } catch { /* never pulled */ }
    const child = execFile(process.execPath, [pullScript, '--quiet'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* non-fatal */ }
})();

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

// v0.10: resolve prevTier early so both the disk cache lookup and the
// classify.js subprocess see the same session context. Silent on failure.
let _prevTier = null;
try {
  const _sid = payload.session_id || (payload.session && payload.session.id) || null;
  _prevTier = readLastSessionTier(_sid);
} catch (e) {}

// Hook cache lookup before spawning classify.js
let decision = null;
let cacheHit = false;
const cachedResult = getClassifyCached(prompt, _prevTier);
if (cachedResult) {
  decision = cachedResult.decision;
  cacheHit = true;
}

if (!decision) {
  const classifier = path.join(__dirname, 'classify.js');
  // v0.9.1: pass hw-recommended T0 model via env var
  const classifyEnv = Object.assign({}, process.env);
  if (_hwCapability && _hwCapability.recommended_t0) {
    classifyEnv.FRUGAL_HW_RECOMMENDED_T0 = _hwCapability.recommended_t0;
  }
  if (_hwCapability && _hwCapability.hw_tier) {
    classifyEnv.FRUGAL_HW_TIER = _hwCapability.hw_tier;
  }
  // v0.10: propagate prevTier to classify.js for short follow-up inheritance
  if (_prevTier) classifyEnv.FRUGAL_PREV_TIER = _prevTier;
  const res = spawnSync(process.execPath, [classifier, prompt], {
    encoding: 'utf8',
    timeout: 1500,
    env: classifyEnv,
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
  setClassifyCached(prompt, decision, null, _prevTier);
}

// ── v0.8 HAIKU ARBITER ─────────────────────────────────────────────────
// When the regex classifier is uncertain (confidence < 0.75 OR the
// task_category is ambiguous_medium / ambiguous_long), fall through to
// the Haiku arbiter. It's cheap (~$0.001/call), fast (~400ms), and has
// real semantic understanding of what the prompt is asking.
//
// Dual-enforce the HIGH_RISK guardrail: the arbiter can NEVER downgrade
// a prompt that matches the high-risk hint. If the arbiter says T0 on a
// `git push --force` prompt, we override it back to T3.
//
// Skip entirely when:
//   - v0.7 kill-switch is active (FRUGAL_V07_DISABLE=1)
//   - No ANTHROPIC_API_KEY in env (arbitrate() handles this as a no-op)
//   - Cache hit on the classifier cache (already decided)
//   - User override is honored (explicit intent wins)
//   - Regex was confident (>= 0.75) AND not in an ambiguous_* category
const AMBIGUOUS_CATEGORIES = new Set(['ambiguous_medium', 'ambiguous_long', 'ambiguous_short']);
if (
  !V07_DISABLED &&
  !cacheHit &&
  !(decision.user_override && decision.user_override.honored) &&
  (decision.confidence < 0.75 || AMBIGUOUS_CATEGORIES.has(decision.task_category))
) {
  try {
    const { arbitrate } = require('./arbiter.js');
    const arbiterResult = arbitrate(prompt);
    if (arbiterResult) {
      const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];
      const isHighRiskPrompt = HIGH_RISK_HINT.test(prompt);
      const regexIdx = TIER_ORDER.indexOf(decision.tier);
      const arbiterIdx = TIER_ORDER.indexOf(arbiterResult.tier);
      const isDowngrade = arbiterIdx < regexIdx;

      if (isDowngrade && isHighRiskPrompt) {
        // Refuse downgrade on HIGH_RISK — preserve the regex tier and
        // record the refusal for the backtest.
        decision.arbiter = {
          consulted: true,
          proposed_tier: arbiterResult.tier,
          proposed_subagent: arbiterResult.subagent,
          reasoning: arbiterResult.reasoning,
          honored: false,
          refusal_reason: 'high_risk_downgrade_refused',
        };
        decision.escalation_rule =
          decision.escalation_rule === 'none'
            ? 'arbiter_refused_high_risk'
            : `${decision.escalation_rule}+arbiter_refused_high_risk`;
      } else {
        // Honor the arbiter. Replace the tier, backend, model, and
        // subagent with the arbiter's choices.
        const backendByTier = {
          T0: { recommended_backend: 'ollama',          recommended_model: 'qwen2.5:3b' },
          T1: { recommended_backend: 'anthropic_api',   recommended_model: 'claude-haiku-4-5-20251001' },
          T2: { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6' },
          T3: { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6' },
        }[arbiterResult.tier];
        const previousTier = decision.tier;
        decision.tier = arbiterResult.tier;
        decision.suggested_subagent = arbiterResult.subagent;
        if (backendByTier) Object.assign(decision, backendByTier);
        decision.arbiter = {
          consulted: true,
          proposed_tier: arbiterResult.tier,
          proposed_subagent: arbiterResult.subagent,
          reasoning: arbiterResult.reasoning,
          honored: true,
          previous_tier: previousTier,
          cached: arbiterResult.cached === true,
        };
        // v0.9: carry decomposition onto decision so it can be emitted in
        // the router-hint (and used downstream for parallel Task spawning).
        if (
          arbiterResult.decomposition &&
          arbiterResult.decomposition.applicable &&
          Array.isArray(arbiterResult.decomposition.subtasks) &&
          arbiterResult.decomposition.subtasks.length >= 2 &&
          !HIGH_RISK_HINT.test(prompt) // never decompose HIGH_RISK
        ) {
          decision.decomposition = arbiterResult.decomposition;
        }
        decision.escalation_rule =
          decision.escalation_rule === 'none'
            ? 'arbiter_honored'
            : `${decision.escalation_rule}+arbiter_honored`;
        decision.confidence = Math.max(decision.confidence, 0.85);
      }
    }
  } catch {
    // Arbiter failed — silently fall back to the regex decision.
  }
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
  // v0.9.1: prompt features from classifier
  has_code_block: decision.has_code_block || false,
  has_file_refs: decision.has_file_refs || false,
  file_ref_count: decision.file_ref_count || 0,
  lang_detected: decision.lang_detected || 'en',
  has_error_trace: decision.has_error_trace || false,
  is_question: decision.is_question || false,
  has_url: decision.has_url || false,
  // v0.9.1: subscription profile
  sub_profile: (() => { const sp = readSubscriptionProfile(); return sp && sp.profiles ? sp.profiles.anthropic : 'unknown'; })(),
  // v0.9.1: hardware context
  hw_tier: _hwCapability ? _hwCapability.hw_tier : 'unknown',
  vram_mb: _hwCapability ? _hwCapability.vram_mb : null,
  // v0.8: arbiter outcome (absent when arbiter did not run)
  arbiter_honored: decision.arbiter ? decision.arbiter.honored : null,
  arbiter_previous_tier: decision.arbiter && decision.arbiter.honored ? decision.arbiter.previous_tier : null,
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

// ── Active Mode override (v0.9.3) ────────────────────────────────────────
// Reads ~/.claude/tools/router/.frugal-mode.json set by frugal-mode.js.
// beast → floor T3 on all prompts (bypass budget cap).
// zen   → ceil T1 on all prompts (except T3-gate safety tasks).
// auto  → file absent, no override.
// Silent on any read error.
(function applyActiveMode() {
  const MODE_FILE = path.join(ROUTER_DIR, '.frugal-mode.json');
  let activeMode = null;
  try {
    if (fs.existsSync(MODE_FILE)) {
      const raw = fs.readFileSync(MODE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.mode && data.mode !== 'auto') activeMode = data.mode;
    }
  } catch { /* silent */ }

  if (!activeMode) return;

  const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

  if (activeMode === 'beast') {
    // Force T3 regardless of classifier, budget, or arbiter.
    decision.tier = 'T3';
    decision.max_tier = 'T3';
    decision.escalation_rule = 'beast_mode';
    decision.active_mode = 'beast';
  } else if (activeMode === 'zen') {
    // Cap at T1 unless this is a T3-gate safety task.
    const isGate = decision.escalation_rule === 'T3_gate' ||
                   /\b(push|merge|deploy|release|migration)\b/i.test(prompt);
    if (!isGate) {
      const currentIdx = TIER_ORDER.indexOf(decision.tier);
      if (currentIdx > 1) { // > T1
        decision.tier = 'T1';
        decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
          ? decision.escalation_rule + '+zen_cap'
          : 'zen_cap';
      }
      decision.max_tier = 'T1';
      decision.active_mode = 'zen';
    }
    // If it IS a gate task, zen mode is bypassed for safety. Log it.
    if (isGate) {
      decision.active_mode = 'zen_bypassed_gate';
    }
  }
})();
// ─────────────────────────────────────────────────────────────────────────

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

// v0.9: decomposition block — only emitted when the arbiter flagged the
// task as cleanly decomposable AND the prompt is not HIGH_RISK.
const decompositionLines = [];
if (decision.decomposition && decision.decomposition.applicable) {
  decompositionLines.push('');
  decompositionLines.push('decomposition:');
  decompositionLines.push('  applicable: true');
  decompositionLines.push('  subtasks:');
  for (const sub of decision.decomposition.subtasks) {
    const desc = String(sub.description || sub.task || '').replace(/\n/g, ' ').slice(0, 200);
    const subTier = sub.tier || 'T2';
    const subModelByTier = {
      T0: 'qwen2.5:3b',
      T1: 'claude-haiku-4-5-20251001',
      T2: 'claude-sonnet-4-6',
      T3: 'claude-opus-4-6',
    };
    decompositionLines.push(`    - description: "${desc}"`);
    decompositionLines.push(`      tier: ${subTier}`);
    decompositionLines.push(`      model: ${subModelByTier[subTier] || 'claude-sonnet-4-6'}`);
  }
}

const arbiterLines = [];
if (decision.arbiter && decision.arbiter.consulted) {
  arbiterLines.push('');
  if (decision.arbiter.honored) {
    arbiterLines.push(`ARBITER: honored (${decision.arbiter.previous_tier} → ${decision.tier})`);
    arbiterLines.push(`arbiter_reasoning: ${decision.arbiter.reasoning}`);
  } else {
    arbiterLines.push(`ARBITER: refused (${decision.arbiter.refusal_reason})`);
    arbiterLines.push(`arbiter_proposed: ${decision.arbiter.proposed_tier} — reasoning: ${decision.arbiter.reasoning}`);
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
  decision.active_mode ? `MODE: ${decision.active_mode}` : null,
  decision.active_mode ? `FORCED: true` : null,
  ...overrideLines,
  ...arbiterLines,
  ...decompositionLines,
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

// v0.12: delegation directive — runtime enforcement for doctrine compliance.
//
// Problem the directive solves: main Opus was inlining every T0/T1 task
// because the doctrine's "< 5 tool calls → inline" rule was too generous.
// Result: statusline showed advisory savings the user never realized.
//
// Fix: when this session has already logged ≥ 5 Bash calls AND 100% of
// them are Opus AND the current recommendation is T0/T1, inject an
// explicit directive telling the orchestrator to delegate via the Agent
// tool. User-pinned Opus (override honored) suppresses the directive.
try {
  const compliance = readSessionCompliance(sessionId);
  const userPinsOpus = decision.user_override
    && decision.user_override.honored === true
    && /opus/i.test(
      String(decision.user_override.label || decision.user_override.requested || '')
    );
  if (
    compliance &&
    compliance.bashCount >= 5 &&
    compliance.opusCount === compliance.bashCount &&
    (decision.tier === 'T0' || decision.tier === 'T1') &&
    !userPinsOpus
  ) {
    lines.push('');
    lines.push('<delegation_directive>');
    lines.push(`SESSION COMPLIANCE ALERT: this session has ${compliance.bashCount} Bash calls, 100% Opus.`);
    lines.push('Realized savings so far: $0. The statusline will show "∅ 0% saved (all-Opus)".');
    lines.push('');
    lines.push(`Router classified this prompt as ${decision.tier} → recommended subagent: ${decision.suggested_subagent}.`);
    lines.push('');
    lines.push('DIRECTIVE (doctrine compliance v2):');
    lines.push(`  For this turn, spawn \`${decision.suggested_subagent}\` via the Agent tool`);
    lines.push('  instead of inlining the work in Opus. This is how savings actually');
    lines.push('  materialize — advisory savings without delegation are a lie.');
    lines.push('');
    lines.push('Single exception: this task requires accumulated session state');
    lines.push('(files read earlier in this conversation, decisions made in prior');
    lines.push('turns) that a fresh subagent cannot access. If so, state the exact');
    lines.push('state dependency in ONE sentence before any other tool call, then');
    lines.push('proceed inline. "It is faster to write inline" is NOT a valid reason.');
    lines.push('</delegation_directive>');
  }
} catch { /* directive is best-effort */ }

process.stdout.write(lines.join('\n') + '\n');

// v0.9: POST the decision to the tracker so statusline segment ③ can render
// [tier] model category latency cascade. Fire-and-forget.
try {
  const cascadePath = (decision.arbiter && decision.arbiter.consulted)
    ? `L1→L2→${decision.tier}`
    : `L1→${decision.tier}`;
  const hookLatency = Date.now() - (global.__frugal_hook_start || Date.now());
  postTracker('/decision', {
    tier: decision.tier,
    task_category: decision.task_category,
    recommended_model: decision.recommended_model,
    recommended_backend: decision.recommended_backend,
    confidence: decision.confidence,
    escalation_rule: decision.escalation_rule,
    arbiter_honored: decision.arbiter ? decision.arbiter.honored : null,
    user_override: decision.user_override || null,
    cascade_path: cascadePath,
    hook_latency_ms: hookLatency,
    latency_ms: hookLatency,
    session_id: sessionId,
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
  });

  // v0.9: arbiter-event metric for /metrics.arbiter
  if (decision.arbiter && decision.arbiter.consulted) {
    let outcome;
    if (!decision.arbiter.honored) outcome = 'refused';
    else if (decision.arbiter.cached) outcome = 'hit';
    else outcome = 'miss';
    postTracker('/arbiter-event', {
      outcome,
      latency_ms: decision.arbiter.latency_ms || 0,
      cost_usd: outcome === 'miss' ? 0.001 : 0,
    });
  }
} catch { /* non-fatal */ }

process.exit(0);
