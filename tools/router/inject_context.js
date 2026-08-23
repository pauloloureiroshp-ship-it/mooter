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

// @ts-check
'use strict';

/** @typedef {import('./types').ClassifyDecision} ClassifyDecision */
/** @typedef {import('./types').ArbiterDecision} ArbiterDecision */

// v0.9: hook-start timestamp for cascade latency reporting.
/** @type {any} */ (global).__frugal_hook_start = Date.now();

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFile } = require('child_process');

// v0.7 feature flag — set FRUGAL_V07_DISABLE=1 to revert to v0.6.1 behaviour
// (no hook cache, sync budget fetch, no quality intent bypass). Useful as a
// kill-switch if anything regresses.
const V07_DISABLED = process.env.MOOTER_V07_DISABLE === '1' || process.env.FRUGAL_V07_DISABLE === '1';

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
    // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
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
      // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
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
    // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
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
/**
 * @param {string} promptText
 * @param {boolean} isHighRisk
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
/** @type {Record<string, any> | null | undefined} */
let _subProfileCache = undefined;

/** @returns {Record<string, any> | null | undefined} */
function readSubscriptionProfile() {
  if (_subProfileCache !== undefined) return _subProfileCache;
  try {
    _subProfileCache = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8'));
  } catch {
    _subProfileCache = null;
  }
  return _subProfileCache;
}

/**
 * @param {string} tier
 * @param {Record<string, any> | null | undefined} budget
 * @returns {string}
 */
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
/**
 * @param {string | null | undefined} sid
 */
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
      if (!mm || !mm[1]) continue;
      bashCount++;
      if (/opus/i.test(mm[1])) opusCount++;
    }
    return { bashCount, opusCount, nonOpusCount: bashCount - opusCount };
  } catch { return null; }
}

// v0.10: read the most recent classified tier for this session from
// decisions.log. Bounded tail (32 KB) — silent on failure. Used to seed
// FRUGAL_PREV_TIER for the follow-up inheritance rule in classify.js.
/**
 * @param {string | null | undefined} sid
 * @returns {string | null}
 */
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
      try { obj = JSON.parse(lines[i]); } catch (_e) { continue; }
      if (obj.event !== 'classified') continue;
      if (obj.session_id !== sid) continue;
      if (obj.tier) return obj.tier;
    }
  } catch (_e) {}
  return null;
}

/**
 * @param {Record<string, unknown>} entry
 */
function logDecision(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* never fail the hook over telemetry */ }
}

// v0.9: fire-and-forget POST to the tracker. Non-blocking, swallows errors.
// Used for /decision (statusline segment ③) and /arbiter-event (metrics).
/**
 * @param {string} urlPath
 * @param {Record<string, unknown>} payload
 */
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
    // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
    const child = execFile(process.execPath, ['-e', scriptText, body], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* non-fatal */ }
}

/**
 * @param {string} str
 * @returns {any}
 */
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
/**
 * @param {string} p
 * @param {string | null | undefined} prevTier
 */
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

/**
 * @param {{ tuning_mtime: number, entries: Record<string, { ts: number, decision: any }> }} cache
 */
function saveClassifyCache(cache) {
  try {
    // LRU eviction: sort by ts, keep newest MAX entries.
    const keys = Object.keys(cache.entries);
    if (keys.length > CLASSIFY_CACHE_MAX) {
      const sorted = keys
        .map((k) => ({ k, ts: (cache.entries[k] && cache.entries[k].ts) || 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, CLASSIFY_CACHE_MAX);
      /** @type {Record<string, { ts: number, decision: any }>} */
      const kept = {};
      for (const { k } of sorted) {
        const entry = cache.entries[k];
        if (entry) kept[k] = entry;
      }
      cache.entries = kept;
    }
    fs.writeFileSync(CLASSIFY_CACHE_PATH, JSON.stringify(cache));
  } catch { /* non-fatal */ }
}

/**
 * @param {string} prompt
 * @param {string | null | undefined} prevTier
 */
function getClassifyCached(prompt, prevTier) {
  if (V07_DISABLED) return null;
  const cache = loadClassifyCache();
  const key = hashPrompt(prompt, prevTier);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CLASSIFY_CACHE_TTL_MS) return null;
  return { decision: entry.decision, cache };
}

/**
 * @param {string} prompt
 * @param {any} decision
 * @param {{ tuning_mtime: number, entries: Record<string, { ts: number, decision: any }> } | null | undefined} cache
 * @param {string | null | undefined} prevTier
 */
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
/** @type {Record<string, any> | null | undefined} */
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

// ── Best Ollama T0 model (v1.0) ───────────────────────────────────────────────
// Dynamic T0 model selection based on what's actually installed in Ollama.
function bestOllamaT0() {
  const preferred = ['qwen3:30b', 'gemma3:12b', 'deepseek-r1:7b', 'qwen2.5:3b'];
  try {
    const models = (_hwCapability && _hwCapability.available_ollama_models) || [];
    const names = models.map(/** @param {any} m */ (m) => (m.name || m).toLowerCase());
    return preferred.find(p => names.includes(p.toLowerCase())) || 'qwen3:30b';
  } catch { return 'qwen3:30b'; }
}

// ── Hub push (v0.9.8) — fire-and-forget event submission ────────────────────
// Periodically pushes decisions to the hub. 1h cooldown, minimum 10 new
// decisions since last push. Non-blocking, non-fatal.
(function maybeHubPush() {
  try {
    const pushScript = path.join(ROUTER_DIR, 'hub-submit-events.js');
    if (!fs.existsSync(pushScript)) return;
    if (!process.env.MOOTER_SUBMIT_TOKEN && !process.env.FRUGAL_SUBMIT_TOKEN) return;
    const lastPushPath = path.join(ROUTER_DIR, '.last-submit.json');
    try {
      const stat = fs.statSync(lastPushPath);
      if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) return; // 1h cooldown
    } catch { /* never pushed */ }
    // Check minimum decision count since last push
    try {
      const logPath = path.join(ROUTER_DIR, 'decisions.log');
      const stat = fs.statSync(logPath);
      const lastPushStat = (() => { try { return fs.statSync(lastPushPath); } catch { return null; } })();
      if (lastPushStat && stat.size === lastPushStat.size) return; // no new data
    } catch { /* proceed anyway */ }
    // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
    const child = execFile(process.execPath, [pushScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env },
    });
    child.unref();
  } catch { /* non-fatal */ }
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
    // @ts-ignore — execFile overload accepts (cmd, args, options) at runtime
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
} catch (_e) {}

// Wave 21 (C2) — classifier-stability normalisation. The regex classifier is
// byte-sensitive to keywords that bleed in from embedded paths/counts (the
// "release" in /etc/os-release tipped it to T3 while /etc/hostname stayed T1).
// We classify (and cache) a CANONICAL form so a family of prompts routes to ONE
// stable tier; the ORIGINAL `prompt` still feeds the LLM, Option A, the optimiser
// and the logs. The normaliser re-surfaces genuine risk path tokens (.env, …) so
// the HIGH_RISK floor is never weakened. Best-effort: any failure falls back to
// the raw prompt (zero behaviour change).
let classifyInput = prompt;
try {
  const { normalisePrompt } = require('./normalise_prompt.js');
  const norm = normalisePrompt(prompt);
  if (norm && norm.length >= 4) classifyInput = norm;
} catch { /* normaliser best-effort — classify the raw prompt */ }

// Hook cache lookup before spawning classify.js
let decision = null;
let cacheHit = false;
let classifyMs = null;
let classifyPorque = null;
let classifyPath = null;
let classifyStartedNs = null;
try { classifyStartedNs = process.hrtime.bigint(); }
catch { classifyPorque = 'process.hrtime.bigint() indisponível neste runtime'; }
const finishClassifyMeasurement = () => {
  if (classifyStartedNs == null) return;
  try {
    const elapsedNs = process.hrtime.bigint() - classifyStartedNs;
    if (elapsedNs > 0n) classifyMs = Number(elapsedNs) / 1e6;
    else classifyPorque = 'o relógio monotónico não avançou durante a classificação';
  } catch {
    classifyPorque = 'o relógio monotónico falhou ao terminar a medição';
  }
};
const cachedResult = getClassifyCached(classifyInput, _prevTier);
if (cachedResult) {
  decision = cachedResult.decision;
  cacheHit = true;
  classifyPath = 'cache';
  finishClassifyMeasurement();
}

if (!decision) {
  classifyPath = 'spawn';
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
  // Wave 21 (C2) — classify the normalised form (classifyInput), not the raw
  // prompt, so a path/count never tips the tier. classify.js is byte-identical.
  const res = spawnSync(process.execPath, [classifier, classifyInput], {
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
  finishClassifyMeasurement();

  // Cache the fresh decision under the normalised key (skipped if user_override
  // detected — handled inside setClassifyCached). Wave 21 (C2): caching on the
  // canonical form means an entire prompt family shares one entry → identical tier.
  setClassifyCached(classifyInput, decision, null, _prevTier);
}

// ── USER_OVERRIDE guard (P0, PRIME-0 2026-08-01) ───────────────────────
// classify.js (FROZEN) aceita as preposições NUAS `com`/`with`/`via` antes de
// qualquer chave de modelo, e `local`/`claude` são palavras correntes: "compara
// a nuvem com local" pinava qwen2.5:3b, "sessao fresca com claude code" pinava
// opus. Como o sha do classify.js é CI-enforced, o veto vive aqui. Corre sobre
// o prompt ORIGINAL (não o normalizado) — é o texto que o utilizador escreveu
// que diz se houve intenção. Ver user-override-guard.test.js.
try {
  const { applyOverrideGuard } = require('./user-override-guard.js');
  const guard = applyOverrideGuard(decision, prompt, { t0Model: bestOllamaT0() });
  if (guard.vetoed) {
    logDecision({
      ts: new Date().toISOString(),
      event: 'user_override_vetoed',
      reason: guard.reason,
      restored_tier: guard.restored_tier,
      cache_hit: cacheHit,
    });
    // Uma decisão cacheada com o fantasma dentro voltaria a servi-lo.
    if (cacheHit) setClassifyCached(classifyInput, decision, null, _prevTier);
  }
} catch (e) {
  // O guard nunca derruba o hook — mas um catch MUDO reabria o P0 sem aviso
  // (o ficheiro faltar numa rota de sync bastava). Falha alto no ledger.
  try {
    logDecision({
      ts: new Date().toISOString(),
      event: 'user_override_guard_indisponivel',
      erro: String((e && e.message) || e),
      consequencia: 'o USER_OVERRIDE fantasma volta a passar sem veto',
    });
  } catch { /* o ledger tambem falhou; o hook segue na mesma */ }
}

// ── /mooter-<slug> Anthropic pin (Sessão A, 2026-05-27) ────────────────
// A `/mooter-<model>` skill is primarily instruction-driven, but when the
// launching shell exports MOOTER_PIN_MODEL=<claude-id> we surface the pin in
// the hint too. We synthesize an honored user_override BEFORE the arbiter runs
// (the arbiter skips when an override is honored, line ~675) and mutate the
// decision's tier/backend/model/subagent so the entire hint reflects the pin.
//
// Guardrail: a pin that would DOWNGRADE a HIGH_RISK prompt below its risk floor
// is refused (honored=false) — mirrors the arbiter's high-risk policy and the
// doctrine's "high-risk forces T3" rule. The existing override renderer prints
// the REFUSED branch.
//
// Conflict policy: if classify already produced a user_override, the env-var
// pin overwrites it (the env var is the more explicit, later signal).
const pinModelRaw = (process.env.MOOTER_PIN_MODEL || '').trim();
if (pinModelRaw && pinModelRaw.startsWith('claude-')) {
  /** @type {Record<string, string>} */
  const PIN_TIER = {
    'claude-opus-4-7': 'T3',
    'claude-opus-4-6': 'T3',
    'claude-sonnet-4-6': 'T2',
    'claude-haiku-4-5': 'T1',
  };
  /** @type {Record<string, { recommended_backend: string, subagent: string }>} */
  const PIN_BACKEND = {
    T1: { recommended_backend: 'anthropic_api',   subagent: 'cheap-triage' },
    T2: { recommended_backend: 'claude_subagent', subagent: 'model-reasoner' },
    T3: { recommended_backend: 'claude_subagent', subagent: 'model-architect' },
  };
  const pinTier = PIN_TIER[pinModelRaw];
  if (pinTier) {
    const PIN_TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];
    const originalTier = decision.tier;
    const isDowngrade = PIN_TIER_ORDER.indexOf(pinTier) < PIN_TIER_ORDER.indexOf(originalTier);
    const isHighRisk = decision.risk_level === 'high' || HIGH_RISK_HINT.test(prompt);
    if (isDowngrade && isHighRisk) {
      // Refuse the downgrade: keep classify's (high) tier, surface REFUSED.
      decision.user_override = {
        honored: false,
        requested: pinModelRaw,
        blocked: pinModelRaw,
        kind: 'mooter-pin-skill',
        reason: 'high_risk_downgrade_refused',
      };
      decision.escalation_rule =
        decision.escalation_rule === 'none'
          ? 'mooter_pin_refused_high_risk'
          : `${decision.escalation_rule}+mooter_pin_refused_high_risk`;
    } else {
      const back = PIN_BACKEND[pinTier];
      decision.user_override = {
        honored: true,
        requested: pinModelRaw,
        label: pinModelRaw,
        kind: 'mooter-pin-skill',
        original_tier: originalTier,
        tier: pinTier,
        subagent: back.subagent,
      };
      decision.tier = pinTier;
      decision.suggested_subagent = back.subagent;
      decision.recommended_backend = back.recommended_backend;
      decision.recommended_model = pinModelRaw;
      // An explicit pin is a high-confidence signal — ensure the hint actually
      // emits (the emit gate at the Option-A stage requires confidence >= 0.6).
      decision.confidence = Math.max(Number(decision.confidence) || 0, 0.9);
      decision.escalation_rule =
        decision.escalation_rule === 'none'
          ? 'mooter_pin'
          : `${decision.escalation_rule}+mooter_pin`;
    }
  }
}

// ── W2: cockpit "next prompt" pin-file (consume-once) ──────────────────────
// The VSCode cockpit writes ~/.claude/tools/router/.pin-next.json {model,scope}
// when the user picks a model for the next prompt. We read+delete it here (so it
// only affects the very next prompt) and apply it as an honored user_override:
//   • claude-* id  → its tier (same machinery as the MOOTER_PIN_MODEL env pin)
//   • local ollama id (e.g. "qwen2.5:3b") → T0 + that EXACT model via the ollama
//     backend; the agent then runs it through router-execute (same as the
//     /mooter-<model> skills), so the exact local model actually answers.
// HIGH_RISK downgrades are refused (mirrors the env pin). Best-effort: any error
// is swallowed so the hook never breaks.
try {
  const PIN_NEXT_PATH = path.join(ROUTER_DIR, '.pin-next.json');
  if (fs.existsSync(PIN_NEXT_PATH)) {
    let filePin = null;
    try { filePin = JSON.parse(fs.readFileSync(PIN_NEXT_PATH, 'utf8')); } catch { /* corrupt */ }
    try { fs.unlinkSync(PIN_NEXT_PATH); } catch { /* consume-once is best-effort */ }
    const fpModel = filePin && typeof filePin.model === 'string' ? filePin.model.trim() : '';
    const alreadyPinned = decision.user_override && decision.user_override.honored === true;
    if (fpModel && !alreadyPinned) {
      const isClaude = fpModel.startsWith('claude-');
      const PIN_FILE_TIER = { 'claude-opus-4-7': 'T3', 'claude-opus-4-6': 'T3', 'claude-sonnet-4-6': 'T2', 'claude-haiku-4-5': 'T1' };
      const targetTier = isClaude ? PIN_FILE_TIER[fpModel] : 'T0';
      if (targetTier) {
        const ORDER = ['T0', 'T1', 'T2', 'T3'];
        const originalTier = decision.tier;
        const isDowngrade = ORDER.indexOf(targetTier) < ORDER.indexOf(originalTier);
        const isHighRisk = decision.risk_level === 'high' || HIGH_RISK_HINT.test(prompt);
        if (isDowngrade && isHighRisk) {
          decision.user_override = { honored: false, requested: fpModel, blocked: fpModel, kind: 'mooter-pin-file', reason: 'high_risk_downgrade_refused' };
          decision.escalation_rule =
            decision.escalation_rule === 'none'
              ? 'mooter_pin_refused_high_risk'
              : `${decision.escalation_rule}+mooter_pin_refused_high_risk`;
        } else {
          const back = isClaude
            ? ({ T1: { b: 'anthropic_api', s: 'cheap-triage' }, T2: { b: 'claude_subagent', s: 'model-reasoner' }, T3: { b: 'claude_subagent', s: 'model-architect' } }[targetTier])
            : { b: 'ollama', s: 'local-summarizer' };
          decision.user_override = { honored: true, requested: fpModel, label: fpModel, kind: 'mooter-pin-file', original_tier: originalTier, tier: targetTier, subagent: back.s };
          decision.tier = targetTier;
          decision.suggested_subagent = back.s;
          decision.recommended_backend = back.b;
          decision.recommended_model = fpModel;
          decision.confidence = Math.max(Number(decision.confidence) || 0, 0.9);
          decision.escalation_rule =
            decision.escalation_rule === 'none'
              ? 'mooter_pin'
              : `${decision.escalation_rule}+mooter_pin`;
        }
      }
    }
  }
} catch { /* pin-file is best-effort; never break the hook */ }

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
        /** @type {Record<string, { recommended_backend: string, recommended_model: string }>} */
        const backendByTierMap = {
          T0: { recommended_backend: 'ollama',          recommended_model: bestOllamaT0() },
          T1: { recommended_backend: 'anthropic_api',   recommended_model: 'claude-haiku-4-5-20251001' },
          T2: { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6' },
          T3: { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6' },
        };
        const backendByTier = backendByTierMap[arbiterResult.tier];
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

// Wave 3 Day 1 — safety boost (fixes MAJ-1/MAJ-2 from the Wave 2.7 audit). A
// post-classify uplift layer that protects architecture-grade prompts the regex
// classifier under-tiered (e.g. "design a sharding strategy" → T0). Runs AFTER
// the arbiter, only ever UPGRADES, and is SKIPPED when the user explicitly pinned
// a tier (respect intent). classify.js is untouched (P11). Best-effort: a failure
// here never blocks the hint.
try {
  const userPinned = decision.user_override && decision.user_override.honored === true;
  if (!userPinned) {
    const { applySafetyBoost } = require('./safety_boost.js');
    const boosted = applySafetyBoost(decision, prompt);
    if (boosted.safety_boost_applied) {
      decision.tier = boosted.tier;
      decision.recommended_model = boosted.recommended_model;
      decision.recommended_backend = boosted.recommended_backend;
      decision.escalation_rule =
        decision.escalation_rule === 'none' ? 'safety_boost' : `${decision.escalation_rule}+safety_boost`;
    }
    decision.safety_boost_applied = boosted.safety_boost_applied;
    decision.safety_boost_reason = boosted.safety_boost_reason || null;
    decision.safety_boost_from = boosted.safety_boost_from || null;
  }
} catch { /* safety boost is best-effort — never block the hint */ }

// Always log the decision (low-confidence too — useful for tuning).
// v0.7.2: include ts_ms and session_id so the Stop hook can pair start→end
// events and the savings-tracker can compute turn-level latency.
const sessionId = payload.session_id || (payload.session && payload.session.id) || 'unknown';
// Wave 65 Context Bridge (P0): record the user turn + point at the current session
// so router-execute can find this transcript. Opt-in; best-effort, never throws.
try { const _sc = require('./session-context.js'); _sc.setCurrentSession(sessionId); _sc.appendTurn(sessionId, { role: 'user', text: prompt }); } catch { /* best-effort */ }
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
  classify_ms: classifyMs,
  classify_path: classifyPath,
  classify_porque: classifyMs == null
    ? (classifyPorque || 'o caminho de classificação não produziu uma medição')
    : null,
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
  // Wave 3 D1: safety-boost telemetry (no mooter_event schema change — these are
  // extra fields on the decisions.log line, read by `mooter trail --safety`).
  safety_boost_applied: decision.safety_boost_applied || false,
  safety_boost_reason: decision.safety_boost_reason || null,
  safety_boost_from: decision.safety_boost_from || null,
});

// Wave 19 (19.B) — dual-write a structured per-call record to decisions_v2.jsonl
// (op/tier/llm/tokens/reason/via). The legacy decisions.log line above is
// untouched, so every existing reader keeps working; `mooter trail --calls`
// reads this. Best-effort and metadata-only (zero PII — no prompt/preview).
try { require('./decisions_v2.js').appendFromDecision(decision); } catch { /* never fail the hook over telemetry */ }

// Write last-subagent state so PostToolUse:Bash can show the correct model
// instead of always falling back to the parent Opus session model.
if (decision.suggested_subagent && decision.recommended_model) {
  try {
    fs.writeFileSync(
      path.join(ROUTER_DIR, 'last-subagent.json'),
      JSON.stringify({
        model: decision.recommended_model,
        subagent: decision.suggested_subagent,
        tier: decision.tier,
        ts: Date.now(),
      }),
      'utf8'
    );
  } catch { /* never fail the hook over state tracking */ }
}

// ── Prompt Optimizer (Sprint 5-A) ──────────────────────────────────────
// Heuristic reformatting of the user prompt for the destination tier.
// Zero latency (<5ms) — pure regex/string, no LLM call.
// Result rides in <optimized-task> within the hint; original prompt unchanged.
let optimizedTask = null;
if (!cacheHit) {
  try {
    const optimizer = require('./prompt-optimizer');
    const optResult = optimizer.optimize(prompt, decision);
    if (optResult && optResult.optimized_task !== prompt) {
      optimizedTask = optResult;
      logDecision({
        ts: new Date().toISOString(),
        event: 'prompt_optimized',
        strategy: optResult.strategy,
        tokens_saved_est: optResult.tokens_saved_est,
        tier: decision.tier,
      });
    }
  } catch { /* never fail loudly */ }
}

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
// Reads ~/.claude/tools/router/.mooter-mode.json (with fallback to .frugal-mode.json)
// set by frugal-mode.js / mooter-mode.js.
// beast → floor T3 on all prompts (bypass budget cap).
// zen   → ceil T1 on all prompts (except T3-gate safety tasks).
// auto  → file absent, no override.
// Silent on any read error.
(function applyActiveMode() {
  const MODE_FILE_NEW = path.join(ROUTER_DIR, '.mooter-mode.json');
  const MODE_FILE_OLD = path.join(ROUTER_DIR, '.frugal-mode.json');
  const MODE_FILE = fs.existsSync(MODE_FILE_NEW) ? MODE_FILE_NEW : MODE_FILE_OLD;
  let activeMode = null;
  try {
    if (fs.existsSync(MODE_FILE)) {
      const raw = fs.readFileSync(MODE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data) {
        // Union schema (see AUDIT-MOOTER-2026-04-19 finding F5.1): prefer
        // the `mode` string, fall back to legacy flags set by older
        // mooter-autopilot.js versions.
        if (typeof data.mode === 'string' && data.mode !== 'auto') activeMode = data.mode;
        else if (data.beast_mode === true) activeMode = 'beast';
        else if (data.zen_mode   === true) activeMode = 'zen';
      }
    }
  } catch { /* silent */ }

  if (!activeMode) return;

  // An explicit per-prompt model pin (cockpit .pin-next.json or a /mooter-<model>
  // skill / MOOTER_PIN_MODEL env) is a deliberate, more-specific choice than the
  // session-wide mode — honor it over beast/zen. HIGH_RISK downgrades were already
  // refused upstream, so an honored pin here is safe to respect. Regex-detected
  // overrides (prose mentions) keep obeying the active mode.
  const _pin = decision.user_override;
  if (_pin && _pin.honored === true && (_pin.kind === 'mooter-pin-file' || _pin.kind === 'mooter-pin-skill')) {
    decision.active_mode = activeMode + '_overridden_by_pin';
    return;
  }

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

// Wave 3 Day 1 — safety floor. A CRITICAL architectural phrase ("design a
// sharding strategy", "schema migration", "redesign the architecture", "security
// audit", …) must reach Opus even under the budget cap or zen mode — never
// silently send architecture-grade design to a small Moo (the MAJ-1 risk from the
// W2.7 audit). Mirrors the HIGH_RISK hard-floor doctrine. Keyword-only uplifts
// still yield to cost controls; only critical-phrase boosts are exempt. The
// confidence is lifted to 0.85 so the hint actually emits. Best-effort.
try {
  if (decision.safety_boost_applied && /^critical_phrase_match/.test(decision.safety_boost_reason || '')) {
    const ORDER = ['T0', 'T1', 'T2', 'T3'];
    if (ORDER.indexOf(decision.tier) < ORDER.indexOf('T3')) {
      decision.tier = 'T3';
      decision.recommended_model = 'claude-opus-4-6';
      decision.recommended_backend = 'claude_subagent';
      decision.max_tier = 'T3';
      decision.confidence = Math.max(Number(decision.confidence) || 0, 0.85);
      decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
        ? decision.escalation_rule + '+safety_floor'
        : 'safety_floor';
    }
  }
} catch { /* safety floor is best-effort — never block the hint */ }

// Wave 5 Day 1 — adapter selection (Adapter Forge foundation). A SEPARATE layer
// after safety_boost; D1 always resolves to baseline (null) so this only annotates
// the decision with adapter_applied:false. D2 will return a validated adapter.
// Best-effort: never blocks the hint, never touches classify.js / safety_boost.js.
try {
  const { getActiveAdapter, applyAdapterToDecision } = require('./adapter_selection.js');
  const annotated = applyAdapterToDecision(decision, getActiveAdapter());
  decision.adapter_applied = annotated.adapter_applied;
  decision.adapter_id = annotated.adapter_id;
  decision.adapter_reason = annotated.adapter_reason;
  if (annotated.adapter_name) decision.adapter_name = annotated.adapter_name;
} catch { /* adapter selection best-effort */ }

// Only emit the full router-hint when confident enough that it adds value (the
// hint/suggested_answer could be wrong below 0.6). Wave 5 D4: the BADGE is just a
// display marker, so it stays ALWAYS-ON below 0.6 too (NIT Paulo #4) — emit only
// the badge, honoring badge prefs (off / threshold), then exit without the hint.
if (decision.confidence < 0.6) {
  try {
    const { readPrefs, buildBadge, badgeMode } = require('./badge.js');
    const prefs = readPrefs();
    const mode = badgeMode(prefs);
    if (!prefs.quiet && !mode.off && decision.confidence >= mode.threshold) {
      process.stdout.write(`<tier-badge>${buildBadge(decision)}</tier-badge>\n`);
    }
  } catch { /* badge is best-effort — never block */ }
  process.exit(0);
}

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
// OPTION A — pre-compute answer via Ollama for confident T0 tasks.
// v0.9.7: fixed model check — was hardcoded to qwen2.5:3b, now accepts any
// Ollama T0 model (including hw-recommended qwen3:30b on high-VRAM GPUs).
// Timeout raised 4s → 8s to accommodate larger models. Confidence lowered
// 0.8 → 0.75 and prompt limit raised 500 → 800 to cover more real T0 prompts.
/**
 * O orcamento TOTAL do pre-calculo, e a UNICA fonte dele.
 *
 * O `ollama_call_node.js` deriva o seu prazo HTTP deste valor por variavel de
 * ambiente, em vez de manter um numero proprio. Ate 2026-08-23 eram dois: 8000
 * aqui, 3500 la, e um comentario la a afirmar que este era 4000. Os tres
 * discordavam, e o resultado media-se: `option_a_miss` em 12 de 13 chamadas,
 * sempre aos ~3636 ms.
 *
 * 8s e o que o `qwen2.5-coder:14b` precisa (medido: 6778 ms) com folga. O
 * `qwen3:30b` precisa de 9,2s E devolve resposta vazia — subir isto nao o
 * salva, e escolher o modelo por latencia medida fica por fazer.
 */
const OPTION_A_BUDGET_MS = 8000;

/** Onde vivem as amostras de latencia e o catalogo de modelos locais. */
const LATENCIA_PATH = path.join(ROUTER_DIR, 'latencia-local.jsonl');
const CATALOGO_PATH = path.join(ROUTER_DIR, 'catalogo-local.json');

let suggestedAnswer = null;
const userPinnedOverride = decision.user_override && decision.user_override.honored === true;
const isOllamaT0 = decision.recommended_backend === 'ollama' && decision.tier === 'T0';
if (
  !userPinnedOverride &&
  !decision.quality_intent &&
  isOllamaT0 &&
  decision.confidence >= 0.75 &&
  prompt.length < 800
) {
  try {
    const callScript = path.join(__dirname, 'ollama_call_node.js');
    const ollamaEnv = Object.assign({}, process.env);
    // O modelo sai de LATENCIA MEDIDA, nao de VRAM. O router escolhe o maior
    // que cabe na placa; medido nesta maquina, o maior devolve resposta vazia em
    // 9,2s. Sao criterios diferentes, e ninguem tinha medido o segundo.
    // Falha ABERTA: qualquer erro aqui devolve o recomendado de sempre.
    let modeloEscolhido = decision.recommended_model || null;
    let razaoModelo = 'recomendado pelo router';
    try {
      const lat = require('./latencia-local.js');
      const cat = require('./catalogo-local.js');
      const escolha = lat.escolher({
        recomendado: decision.recommended_model || null,
        resumo: lat.resumir(lat.lerAmostras(LATENCIA_PATH)),
        catalogo: cat.lerCatalogo(CATALOGO_PATH),
        orcamentoMs: OPTION_A_BUDGET_MS,
      });
      if (escolha.modelo) { modeloEscolhido = escolha.modelo; razaoModelo = escolha.razao; }
    } catch { /* sem medicao, fica o recomendado */ }
    if (modeloEscolhido) {
      ollamaEnv.OLLAMA_OPTION_A_MODEL = modeloEscolhido;
    }
    // O orcamento vive AQUI, num sitio so, e o filho tira a sua margem dele.
    // Ate 2026-08-23 havia dois numeros: 8000 aqui e 3500 cravado no filho, com
    // um comentario la a dizer que este era 4000. Toda a chamada morria aos
    // 3636 ms, e o registo dizia so `status=1, stderr vazio`.
    ollamaEnv.MOOTER_OPTION_A_BUDGET_MS = String(OPTION_A_BUDGET_MS);
    const t0 = Date.now();
    const ollamaRes = spawnSync(process.execPath, [callScript, prompt], {
      encoding: 'utf8',
      timeout: OPTION_A_BUDGET_MS,
      env: ollamaEnv,
    });
    const decorrido = Date.now() - t0;
    const acertou = ollamaRes.status === 0 && ollamaRes.stdout && ollamaRes.stdout.trim().length > 5;
    // A amostra e o unico sitio de onde a proxima escolha vem. Sem ela, o
    // `latencia-local.js` nunca sai do palpite do router.
    try {
      require('./latencia-local.js').registar(LATENCIA_PATH, {
        ts: new Date().toISOString(), modelo: modeloEscolhido, ms: decorrido, ok: Boolean(acertou),
        motivo: acertou ? null : ((/motivo=(S+)/.exec(ollamaRes.stderr || '') || [])[1] || 'sem_motivo'),
      });
    } catch { /* telemetria nunca parte o hook */ }
    // A cache do catalogo refresca-se SO quando a escolha falha: e o momento em
    // que precisamos de alternativas, e o orcamento ja foi gasto, portanto o
    // subprocesso nao rouba latencia a ninguem. Enquanto tudo corre bem,
    // ninguem pergunta nada ao Ollama.
    if (!acertou) {
      try {
        const cat = require('./catalogo-local.js');
        if (cat.caducou(CATALOGO_PATH) || !cat.lerCatalogo(CATALOGO_PATH).length) cat.refrescar(CATALOGO_PATH);
      } catch { /* sem catalogo, fica o recomendado */ }
    }
    if (acertou) {
      suggestedAnswer = ollamaRes.stdout.trim();
      logDecision({ ts: new Date().toISOString(), event: 'option_a_hit', prompt_len: prompt.length, modelo: modeloEscolhido, razao_modelo: razaoModelo, ms: decorrido });
    } else {
      // O MOTIVO, e nao so o status. Um `option_a_miss` mudo nao distingue
      // "modelo em falta" de "timeout" de "resposta vazia" — e as tres pedem
      // correccoes diferentes. Foi por isso que 3 dias de falhas passaram por
      // ruido de fundo.
      const m = /motivo=(\S+)/.exec(ollamaRes.stderr || '');
      logDecision({
        ts: new Date().toISOString(),
        event: 'option_a_miss',
        motivo: m ? m[1] : (ollamaRes.error && ollamaRes.error.code === 'ETIMEDOUT' ? 'morto_pelo_pai' : 'sem_motivo'),
        modelo: modeloEscolhido,
        razao_modelo: razaoModelo,
        ms: decorrido,
        status: ollamaRes.status,
        stderr: (ollamaRes.stderr || '').slice(0, 120),
      });
    }
  } catch (e) {
    logDecision({ ts: new Date().toISOString(), event: 'option_a_error', motivo: (e && e.message) ? String(e.message).slice(0, 80) : 'desconhecido' });
  }
}

// OPTION B (Wave-3+) — pre-compute T1 answers via the Wave-2 executor.
// Disabled by default. Opt-in: set FRUGAL_OPTION_B_ENABLE=1 in your env.
// Reason for opt-in: this path triggers real Codex CLI / OpenAI calls
// per T1 prompt that didn't already get an Option-A hit. For users not
// expecting routed pre-compute, that could silently burn subscription
// quota. With the flag explicit, the user opts in knowingly.
//
// Constraints (intentionally tighter than Option-A):
//   - tier === 'T1' (T0 already handled by Option-A above)
//   - confidence >= 0.80 (higher bar — pre-compute waste hurts more on T1)
//   - prompt.length < 800 (same prose-window guard as Option-A)
//   - skip when user pinned a model OR quality_intent fired
//   - executor capped at 2.5s per provider attempt; spawnSync at 7s
const optionBEnabled = process.env.FRUGAL_OPTION_B_ENABLE === '1';
if (
  optionBEnabled &&
  !suggestedAnswer &&
  !userPinnedOverride &&
  !decision.quality_intent &&
  decision.tier === 'T1' &&
  typeof decision.confidence === 'number' && decision.confidence >= 0.80 &&
  prompt.length < 800
) {
  try {
    const cliScript = path.join(__dirname, 'router-execute.js');
    const execEnv = Object.assign({}, process.env);
    execEnv.MOOTER_CLASSIFICATION_JSON = JSON.stringify(decision);
    execEnv.MOOTER_PER_ATTEMPT_TIMEOUT_MS = '2500';
    const execRes = spawnSync(process.execPath, [cliScript, prompt], {
      encoding: 'utf8',
      timeout: 7000,
      env: execEnv,
    });
    if (execRes.status === 0 && execRes.stdout) {
      try {
        const result = JSON.parse(execRes.stdout);
        if (result.ok && typeof result.text === 'string' && result.text.trim().length > 5) {
          suggestedAnswer = result.text.trim();
          logDecision({
            ts: new Date().toISOString(),
            event: 'option_b_hit',
            prompt_len: prompt.length,
            provider: result.provider_used,
            duration_ms: result.duration_ms,
          });
        } else {
          logDecision({
            ts: new Date().toISOString(),
            event: 'option_b_miss',
            reason: result.reason || 'no_text',
          });
        }
      } catch {
        logDecision({ ts: new Date().toISOString(), event: 'option_b_parse_error' });
      }
    } else {
      logDecision({
        ts: new Date().toISOString(),
        event: 'option_b_timeout_or_error',
        status: execRes.status,
      });
    }
  } catch {
    logDecision({ ts: new Date().toISOString(), event: 'option_b_throw' });
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
    /** @type {Record<string, string>} */
    const subModelByTier = {
      T0: bestOllamaT0(),
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

// ── Codex integration v0.11 — multi-provider hint lines (additive) ─────
// Surfaces the ordered suggested_providers list and current Anthropic +
// Codex CLI quota state so the main session can pick a subagent without
// re-reading quota-state.json. Lazy-loads the tracker; any failure leaves
// providerLines empty so existing router-hint shape is preserved.
const providerLines = [];
try {
  const providers = Array.isArray(decision.suggested_providers)
    ? decision.suggested_providers
    : null;
  // Pull a quota snapshot only if we'll actually print it.
  let quotaSnap = null;
  try { quotaSnap = require('./quota-tracker').summary(); } catch { /* tracker absent */ }
  if (providers && providers.length) {
    providerLines.push(`suggested_providers: ${providers.join(', ')}`);
  }
  // P1-E — `quota-tracker` conta o ORÇAMENTO LOCAL desta máquina; não sabe nada
  // sobre a quota real de nenhum fornecedor. Publicar um pelo outro já mandou
  // trabalho para longe de um motor vivo: a 2026-08-06T20:13Z este hint disse
  // `codex_quota: 0% remaining` e onze minutos depois um job codex correu 30+
  // passos sem falhar um pedido. `quota-honesta` só devolve percentagem quando
  // há fonte oficial (Anthropic: o `rate_limits` que o Claude Code injecta na
  // statusline); tudo o resto é `n/d` com o porquê.
  try {
    providerLines.push(...require('./quota-honesta').linhasDoHint(
      require('./quota-honesta').estado({ trackerSummary: () => quotaSnap })
    ));
  } catch {
    // Módulo ausente (runtime por actualizar): dizer que não se sabe é sempre
    // melhor do que voltar ao número que mentia.
    providerLines.push('anthropic_quota: n/d (quota-honesta ausente neste runtime)');
    providerLines.push('codex_quota: n/d (quota-honesta ausente neste runtime)');
  }
} catch { /* never let this break the hint */ }

// Wave 21 (C3) — final coherence pass. After every guardrail (budget cap, zen,
// safety floor) the tier is the source of truth; reconcile model/backend/subagent
// to it so the emitted hint + tier-badge never contradict themselves (no more
// `tier:T0 + opus + model-architect`). Best-effort; tier-authoritative.
try {
  require('./hint_coherence.js').coerceHintCoherent(decision, { t0Model: bestOllamaT0() });
} catch { /* coherence is best-effort — never block the hint */ }

// Wave 66 Block 3 — graph-context annotation (downstream of every guardrail).
// Reads the breadcrumb; when a code knowledge graph is resolved for this repo it
// sets decision.graph_context and appends '+graph_resolved' to escalation_rule.
// It NEVER changes the tier → the HIGH_RISK hard floor is untouched. No breadcrumb
// → decision left untouched → the router-hint stays byte-identical.
try {
  require('./graph-context.js').applyGraphContext(decision);
} catch { /* graph context is best-effort — never block the hint */ }

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
  ...providerLines,
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

// ── Full-turn relay for a pinned LOCAL model (Option A) ──────────────────────
// When the user pins a LOCAL (ollama) model for THIS prompt (cockpit next-prompt
// pin / /mooter-<model> skill), they want that model to ANSWER it — not just to
// bias a tier. We are hook-not-proxy: we cannot swap the host model, so we emit an
// explicit directive telling the agent to run router-execute with the pinned model
// and present its output. The host orchestrates the dispatch (delegation, not a
// proxy); context-bridge (if on) carries the conversation so the local model answers
// in-context. Advisory: on any error the agent falls back to answering normally.
// Only for honored ollama pins — cloud pins keep the tier-hint behaviour above.
if (decision.user_override && decision.user_override.honored === true
    && decision.recommended_backend === 'ollama' && decision.recommended_model) {
  const _pm = decision.recommended_model;
  const _re = path.join(__dirname, 'router-execute.js');
  lines.push('');
  lines.push('<pinned-local-execution model="' + _pm + '">');
  lines.push('The user pinned the LOCAL model "' + _pm + '" (Ollama) to answer THIS prompt. Do NOT answer it yourself.');
  lines.push('Steps (then stop): 1) Run via Bash, passing the user prompt as the final quoted argument:');
  lines.push('   node "' + _re + '" --pin-provider=ollama --pin-model=' + _pm + ' "<USER PROMPT HERE>"');
  lines.push('2) The command prints JSON on stdout; present the value of .response.text verbatim as the answer, attributed "' + _pm + ' - local via Mooter".');
  lines.push('3) If it errors or returns no text, do NOT just say "no_output". Translate the failure for the user, then answer yourself:');
  lines.push('   - error.code "no_quota" -> "o Ollama nao esta a responder (daemon em baixo ou ocupado) - confirma com: ollama ps".');
  lines.push('   - error.code "no_output"/empty -> "o modelo \\"' + _pm + '\\" nao devolveu texto (pode nao estar instalado: ollama pull ' + _pm + ', ou esta a fazer cold-load)".');
  lines.push('   State in ONE line: "tentei o teu modelo local \\"' + _pm + '\\", <motivo>; respondo eu (modelo desta sessao) como fallback." Then answer the prompt.');
  lines.push('</pinned-local-execution>');
}

// Wave 60.5 — reasoning-effort axis (axis 2). Emit a semantic effort level
// (none|low|medium|high) derived purely from the already-computed decision
// (tier/risk/category/safety-floor) — zero LLM, never touches classify.js. Placed
// right after the hint so the session sees it as a routing directive, before the
// display-only tier-badge. Best-effort + self-gating: a missing or broken module
// omits the tag, leaving the hint byte-identical to the pre-60.5 baseline. Shares
// the hint's confidence>=0.6 gate (we never reach here below it). Mirrors the
// <tier-badge> emission pattern below.
try {
  const { reasoningEffort } = require('./reasoning-effort.js');
  const eff = reasoningEffort(decision);
  if (eff) {
    lines.push('');
    lines.push(`<reasoning-effort>${eff}</reasoning-effort>`);
    // Persist the level for the opt-in 🧠 eff statusline chip (Block C). The
    // statusline runs as a separate process and cannot see this decision object,
    // so we record exactly what the hint emitted. Best-effort, mirrors effort.json.
    try {
      const mooterDir = process.env.MOOTER_HOME || path.join(require('os').homedir(), '.mooter');
      fs.mkdirSync(mooterDir, { recursive: true });
      fs.writeFileSync(
        path.join(mooterDir, 'reasoning-effort.json'),
        JSON.stringify({ effort: eff, tier: decision.tier, ts: Date.now() }),
      );
    } catch { /* persistence is best-effort — the hint already carries the tag */ }
  }
} catch { /* reasoning-effort is best-effort, never blocks the hint */ }

// Wave 60 Block B — session affinity (cache continuity). Surface a best-effort
// <session-affinity> note when this prompt would switch the routed model without a
// strong reason, so the agent can choose to stay and keep the warm prompt cache.
// Host-side + deterministic: never reads engine KV, never mutates routing, never
// fires on HIGH_RISK / safety-floor / beast / honored-override (strong reasons take
// the fresh model). Records the session's model afterwards. Best-effort: a missing
// or broken module omits the note → hint byte-identical to the pre-wave baseline.
try {
  const aff = require('./session-affinity.js');
  const established = aff.getEstablished(sessionId);
  const note = aff.affinityNote(established, decision);
  if (note) {
    lines.push('');
    lines.push(note);
  }
  aff.recordModel(sessionId, decision.recommended_model, decision.tier);
} catch { /* session affinity is best-effort, never blocks the hint */ }

// Wave 2.5 Day 3 — tier badge. A compact [tier·model·conf] marker emitted as a
// separate block right after the hint so the session can surface it inline.
// Suppressed when the user has run `mooter quiet`. The hint is already gated to
// confidence >= 0.6 above (early-exit at line ~980), so the badge inherits that
// threshold. Best-effort: a missing module or unreadable prefs never blocks the
// hint — this is the live UserPromptSubmit hook.
try {
  // Phase C.1.1 — aliased to avoid a duplicate-identifier clash with the
  // confidence<0.6 badge block above (TS2300). Runtime is unchanged: both are
  // block-scoped lazy requires inside their own try (badge is best-effort).
  const { readPrefs: readBadgePrefs, buildBadge: buildBadgeOutput, badgeMode: resolveBadgeMode } = require('./badge.js');
  const prefs = readBadgePrefs();
  if (!prefs.quiet && !resolveBadgeMode(prefs).off) {
    lines.push('');
    lines.push(`<tier-badge>${buildBadgeOutput(decision)}</tier-badge>`);
  }
} catch { /* badge is best-effort, never blocks the hint */ }

// Wave 66 Block 3 — emit the <graph-context> block (a sibling of <router-hint>,
// the hint itself stays intact) when a graph is resolved, and log a graph_resolved
// event (Block 5; advisory token saving only). Best-effort.
try {
  const { renderGraphContextBlock } = require('./graph-context.js');
  const graphBlock = renderGraphContextBlock(decision);
  if (graphBlock.length) {
    lines.push(...graphBlock);
    const gc = decision.graph_context || {};
    logDecision({
      ts: new Date().toISOString(),
      event: 'graph_resolved',
      nodes: gc.nodes,
      repo_size: Number.isFinite(Number(gc.repo_size)) ? Number(gc.repo_size) : null,
      tokens_saved_est: gc.tokens_saved_est,
      session_id: sessionId,
    });
  }
} catch { /* graph block is best-effort, never blocks the hint */ }

// Append <optimized-task> when the optimizer produced a reformulation.
if (optimizedTask) {
  lines.push('');
  lines.push(`<optimized-task tier="${decision.tier}" strategy="${optimizedTask.strategy}" tokens-saved="${optimizedTask.tokens_saved_est}">`);
  lines.push(optimizedTask.optimized_task);
  lines.push('</optimized-task>');
}

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

// MP-20: methodology context line when session is heavy (< 5% savings)
// Fix: replaced top-level await (breaks CJS in Node 24) with spawnSync fetch.
try {
  const mRaw = spawnSync('node', ['-e', `
    const http = require('http');
    const req = http.get('http://127.0.0.1:7821/metrics', r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => process.stdout.write(d));
    });
    req.on('error', () => process.exit(1));
    req.setTimeout(400, () => { req.destroy(); process.exit(2); });
  `], { encoding: 'utf8', timeout: 600, stdio: ['pipe', 'pipe', 'pipe'] });
  if (mRaw.status === 0 && mRaw.stdout) {
    const mJson = JSON.parse(mRaw.stdout);
    if ((mJson.prompts || 0) > 10) {
      const sessionPct = mJson.session_saved_pct || mJson.saved_pct || 0;
      if (sessionPct < 5) {
        const totalSaved = (mJson.saved || 0).toFixed(2);
        const guaranteed = mJson.guaranteed_saved || 0;
        const gLabel = guaranteed > 0 ? ` · $${guaranteed.toFixed(2)} guaranteed` : '';
        lines.push('');
        lines.push(`ℹ  Total savings: ~$${totalSaved} advisory${gLabel} · methodology: token-estimated vs Opus baseline`);
      }
    }
  }
} catch { /* best-effort */ }

process.stdout.write(lines.join('\n') + '\n');

// Sprint B.1: shadow-mode spawn (fire-and-forget, after hint emitted).
// If shadow is enabled AND this prompt samples in, spawn the tier-below
// model in background. Response captured in decisions.log as shadow_pair.
try {
  const shadow = require('./shadow-mode');
  if (shadow.isEnabled() && shadow.shouldSample(prompt, decision.tier, decision)) {
    // CCA Sprint 11 fix — `logId` was undeclared here (discovered by the
    // Sprint 1.5 type-safety sweep). ReferenceError was swallowed by the
    // surrounding try/catch, so shadow.spawnShadow never actually fired
    // when sampling hit. Fix: generate a fresh UUID locally for the
    // shadow_pair log entry. Falls back to a deterministic ts+session
    // string on Node versions without crypto.randomUUID.
    const cryptoMod = require('crypto');
    const decisionId = (typeof cryptoMod.randomUUID === 'function')
      ? cryptoMod.randomUUID()
      : `dec-${Date.now()}-${sessionId || 'nosess'}`;
    shadow.spawnShadow(prompt, decision.tier, decisionId, sessionId);
  }
} catch { /* shadow is best-effort, never blocks the hook */ }

// v0.9: POST the decision to the tracker so statusline segment ③ can render
// [tier] model category latency cascade. Fire-and-forget.
try {
  const cascadePath = (decision.arbiter && decision.arbiter.consulted)
    ? `L1→L2→${decision.tier}`
    : `L1→${decision.tier}`;
  const hookLatency = Date.now() - (/** @type {any} */ (global).__frugal_hook_start || Date.now());
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

// ── Sprint 1 feedback loop — .last-classified.json + cascade detection ──
// Additive state file consumed by gsd-turn-end.js (augments with
// turn_end_ts + response_len_bucket) and by event-builder.js (joined
// against decisions.log to build frugal_events). Never holds prompt text.
//
// Cascade detection: natural-language phrases that indicate the user is
// asking for a stronger model in the CURRENT turn, which retroactively
// signals the PREVIOUS turn was under-routed. Stored as a separate
// cascade_detected event in decisions.log so Sprint 2 event-builder can
// pair it with the preceding classified event in the same session.
try {
  const LAST_CLASSIFIED_PATH = path.join(ROUTER_DIR, '.last-classified.json');
  const CASCADE_RE = /usa\s+opus|usa\s+o\s+melhor|melhor\s+modelo|thinks?\s+harder|ultrathink|preciso\s+do\s+teu\s+melhor/i;
  const cascadeDetected = CASCADE_RE.test(prompt);

  // Cockpit v2 Wave 1: retry detection — generalises the cascade pattern above.
  // A retry phrase ("try again", "não funcionou", …) signals the PREVIOUS turn
  // failed, so we stamp retry_detected (0/1) into .last-classified.json, which
  // event-builder.js joins per-decision. detectRetry is the canonical, tested
  // detector; fall back to a local regex if the module can't load (best-effort).
  let retryDetected = false;
  try {
    retryDetected = require('./event-builder.js').detectRetry(prompt);
  } catch {
    retryDetected = /try again|tenta\s+(?:de\s+novo|outra\s+vez|novamente)|de\s+novo|outra\s+vez|n[ãa]o\s+funciona\b|n[ãa]o\s+funcionou|n[ãa]o\s+resultou|still\s+broken|still\s+failing|doesn'?t\s+work|didn'?t\s+work|not\s+working|same\s+error|that'?s\s+wrong|est[áa]\s+errado|refaz\b/i.test(prompt);
  }

  /**
   * @param {number} n
   */
  function lenBucketLocal(n) {
    const v = n || 0;
    if (v < 50) return '0-50';
    if (v < 100) return '50-100';
    if (v < 200) return '100-200';
    if (v < 500) return '200-500';
    return '500+';
  }

  // If cascade detected, append a retroactive marker to decisions.log so
  // Sprint 2 event-builder can tag the preceding classified event.
  if (cascadeDetected) {
    logDecision({
      ts: new Date().toISOString(),
      ts_ms: Date.now(),
      event: 'cascade_detected',
      session_id: sessionId,
      refers_to_previous: true,
    });
  }

  const lastClassified = {
    session_id: sessionId,
    ts_ms: Date.now(),
    tier: decision.tier,
    task_category: decision.task_category,
    prompt_len_bucket: lenBucketLocal(prompt.length),
    cascade_upgrade: cascadeDetected ? 1 : 0,
    retry_detected: retryDetected ? 1 : 0,
    response_len_bucket: null,
    turn_end_ts: null,
  };
  fs.writeFileSync(LAST_CLASSIFIED_PATH, JSON.stringify(lastClassified));
} catch { /* telemetry best-effort */ }

process.exit(0);
