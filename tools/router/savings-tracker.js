#!/usr/bin/env node
/**
 * savings-tracker.js — frugal savings HTTP server (v0.6, token-aware)
 *
 * Reads ~/.claude/tools/router/decisions.log (JSONL) and exposes metrics
 * on http://127.0.0.1:7821.
 *
 * What changed in v0.6 (honest-numbers rewrite):
 *
 *   1. Cost is token-based, not flat-per-tier. Uses pricing.js as the
 *      single source of truth. An Opus turn with a 10k-char prompt now
 *      costs ~$1.20 instead of $0.045 (the flat v0.5 number was ~25×
 *      under the real API price). See docs/COST_MODEL.md.
 *
 *   2. System prompts (<task-notification>, hook echoes) are filtered
 *      out before counting, so Ollama/Sonnet/Opus percentages reflect
 *      real user intent.
 *
 *   3. option_a_hit events produce a separate "guaranteed_saved" number.
 *      These are the only prompts where Opus was *actually* skipped
 *      (Ollama's answer was emitted verbatim). The legacy tier-based
 *      estimate is still reported as "advisory_saved" with a clear tag.
 *
 *   4. Currency is pluggable. Set FRUGAL_CURRENCY=BRL (or EUR, GBP) and
 *      every money field is returned in both USD and the target. The
 *      statusline reads `in_<ccy>` fields directly.
 *
 *   5. The /real endpoint surfaces the OAuth 5h usage from .budget-cache
 *      when it's healthy, with a clear error flag when the bearer token
 *      is dead (we saw this in production — see inject_context.js fix).
 *
 * Endpoints:
 *   GET /health   → 200 {ok,port,pid}
 *   GET /metrics  → JSON full report (backwards-compatible superset)
 *   GET /summary  → text/plain human-readable
 *   GET /last     → last classified entry
 *   GET /real     → NEW: OAuth 5h truth + health of the bearer token
 *
 * Single-instance: if 7821 is bound, exit silently.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pricing = require('./pricing');
const fx = require('./fx');
const { sanitizeJson } = require('./sanitize');
const { requireEnv } = require('./env');
// Sprint 8.4 — Sentry. No-op unless MOOTER_SENTRY_DSN is set; never breaks
// the standalone router.
const sentry = require('./sentry-helper');
sentry.init();

const PORT = 7821;
const HOST = '127.0.0.1';
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const SNAPSHOT_PATH = path.join(ROUTER_DIR, 'metrics-snapshot.json');
const BUDGET_CACHE_PATH = path.join(ROUTER_DIR, '.budget-cache.json');
const PROVIDERS_CACHE_PATH = path.join(ROUTER_DIR, '.providers-cache.json');
const PROVIDERS_CACHE_MS = 60 * 1000; // 60s — providers rarely flip

// ── v0.9: in-memory last-decision state + arbiter metrics ──────────────────
// inject_context.js POSTs /decision on every classified event. The tracker
// holds the latest shape in memory so /last can return a rich projection
// without re-parsing decisions.log on every request (stale-fallback ok).
let LAST_DECISION = null;
const ARBITER_METRICS = {
  calls_total: 0,
  cache_hits: 0,
  cache_misses: 0,
  high_risk_refused: 0,
  cost_usd: 0,
  total_latency_ms: 0,
};

const CURRENCY = (process.env.FRUGAL_CURRENCY || 'USD').toUpperCase();

// Tier → human-readable model label (for pct_by_model in the statusline).
const TIER_TO_MODEL = {
  T0: 'Ollama',
  T1: 'Haiku',
  T2: 'Sonnet',
  T3: 'Opus',
};

// Patterns that identify non-user prompts injected by Claude Code itself.
// These are hook echoes and should NOT count toward the routing stats —
// otherwise a busy session with many tool notifications inflates Ollama %.
const SYSTEM_PROMPT_PATTERNS = [
  /^<task-notification>/i,
  /^<system-reminder>/i,
  /^<command-name>/i,
];

function isSystemPrompt(entry) {
  const p = entry.prompt_preview || '';
  return SYSTEM_PROMPT_PATTERNS.some((rx) => rx.test(p));
}

// ── Turn latency measurement (v0.7.2) ──────────────────────────────────────
//
// We pair `classified` events (logged by inject_context.js on UserPromptSubmit)
// with `turn_end` events (logged by gsd-turn-end.js on Stop) by session_id to
// get true wall-clock turn duration. The delta vs an estimated Opus baseline
// is the number the user wants in the statusline — answers the honest
// question "how much slower is the router vs going straight to Opus?".
//
// The Opus baseline is *estimated* from Anthropic's published Q2 2026 latency
// specs + assumed output sizes per tier. It is NOT measured — measuring it
// would require running every prompt twice. Everything derived from the
// baseline is marked `~ est` in the statusline to preserve honesty.
//
// Baseline numbers (wall clock, typical):
//   Opus 4.6: ~500ms first token, ~35 tok/s output stream
//   Avg T3 prompt (1800 output tokens) → ~500 + 1800*1000/35 = ~51s
//   Avg T2 prompt (900 tokens)         → ~500 + 900*1000/35  = ~26s
//   Avg T1 prompt (350 tokens)         → ~500 + 350*1000/35  = ~10s
//   Avg T0 prompt (200 tokens)         → ~500 + 200*1000/35  = ~6s
//
// These are CONSERVATIVE. Real Opus is often faster on short prompts, slower
// on very long ones. Good enough for a relative display.
const OPUS_BASELINE_MS_PER_TIER = {
  T0: 6000,
  T1: 10000,
  T2: 26000,
  T3: 51000,
};

// Turn durations longer than 10min are almost certainly user-went-away cases,
// not real turns. Skip them from the percentile calculation.
const MAX_REALISTIC_TURN_MS = 10 * 60 * 1000;

function computeLatency(lines) {
  const startsBySession = new Map(); // session_id → { ts_ms, tier, prompt_len }
  const turnDurations = [];            // measured turn wall clock
  const tierOfTurn = [];               // parallel array: tier at turn start

  for (const line of lines) {
    const e = safeParse(line);
    if (!e || !e.event) continue;

    if (e.event === 'classified' && e.ts_ms && e.session_id && !isSystemPrompt(e)) {
      // Record the most recent classified event for this session as the
      // "pending turn start". If multiple prompts queue before a turn_end
      // (rare — Claude Code is sequential), the latest wins.
      startsBySession.set(e.session_id, {
        ts_ms: e.ts_ms,
        tier: e.tier,
        prompt_len: e.prompt_len,
      });
    } else if (e.event === 'turn_end' && e.ts_ms && e.session_id) {
      const start = startsBySession.get(e.session_id);
      if (!start) continue;
      const duration = e.ts_ms - start.ts_ms;
      if (duration > 0 && duration < MAX_REALISTIC_TURN_MS) {
        turnDurations.push(duration);
        tierOfTurn.push(start.tier || 'T2');
      }
      startsBySession.delete(e.session_id);
    }
  }

  if (turnDurations.length === 0) return null;

  // Percentiles
  const sorted = turnDurations.slice().sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const p50 = pick(0.5);
  const p95 = pick(0.95);
  const avgActual = turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length;

  // Weighted Opus baseline based on the tier mix of the MEASURED turns.
  // This is fairer than a flat baseline because it reflects the actual
  // workload the user is running through the router.
  const opusEstimates = tierOfTurn.map(
    (t) => OPUS_BASELINE_MS_PER_TIER[t] || OPUS_BASELINE_MS_PER_TIER.T2
  );
  const avgOpusBaseline = opusEstimates.reduce((a, b) => a + b, 0) / opusEstimates.length;
  const delta = avgActual - avgOpusBaseline;

  return {
    sample_size: turnDurations.length,
    p50_ms: Math.round(p50),
    p95_ms: Math.round(p95),
    avg_ms: Math.round(avgActual),
    opus_baseline_ms_est: Math.round(avgOpusBaseline),
    delta_vs_opus_ms: Math.round(delta),
    methodology: 'measured_turn_wall_clock_vs_estimated_opus_baseline_2026q2',
  };
}

// ── Provider availability (v0.7.1) ─────────────────────────────────────────
// The statusline now shows which providers the router could invoke RIGHT NOW:
//   - Claude (OAuth or ANTHROPIC_API_KEY present, not errored)
//   - Ollama (localhost:11434 responding)
//   - Gemini (GEMINI_API_KEY or GOOGLE_API_KEY present)
//   - GPT/Codex (OPENAI_API_KEY present or `codex` CLI on PATH)
//
// States: 'ok' (live, green dot), 'degraded' (configured but broken,
// yellow dot), 'off' (not configured, dim dot).
//
// Reads are sync + cheap (env + file stat) except Ollama which needs HTTP.
// The interval below (inside the HTTP-server block) refreshes the disk
// cache every 30s so reads from computeMetrics stay purely sync.
function checkClaudeAuth() {
  // Check OAuth first
  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    if (token) {
      // If .budget-cache has an auth-error sentinel the token is dead
      try {
        const bc = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
        if (bc && bc.data && bc.data.type === 'error') return 'degraded';
      } catch { /* no cache yet — assume healthy */ }
      return 'ok';
    }
  } catch { /* no creds file */ }
  // Fallback: raw API key env
  if (process.env.ANTHROPIC_API_KEY) return 'ok';
  return 'off';
}

function checkGemini() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? 'ok' : 'off';
}

function checkGpt() {
  if (process.env.OPENAI_API_KEY) return 'ok';
  // Secondary: Codex CLI installed
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const { spawnSync } = require('child_process');
    const r = spawnSync(which, ['codex'], { encoding: 'utf8', timeout: 500, windowsHide: true });
    if (r.status === 0 && r.stdout && r.stdout.trim().length > 0) return 'ok';
  } catch { /* no Codex CLI */ }
  return 'off';
}

function pingOllama() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200 ? 'ok' : 'degraded'));
    });
    req.on('error', () => resolve('off'));
    req.setTimeout(800, () => { req.destroy(); resolve('off'); });
  });
}

/**
 * Read the disk provider cache. Pure sync, cheap.
 * Returns null when the cache is missing (computeMetrics will then render
 * env-only sync checks — Ollama shows 'off' until the interval populates it).
 */
function readProvidersCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(PROVIDERS_CACHE_PATH, 'utf8'));
    if (!raw || !raw.ts) return null;
    if (Date.now() - raw.ts > PROVIDERS_CACHE_MS * 2) return null; // very stale
    return raw.data;
  } catch { return null; }
}

/**
 * Sync-fast provider check used from inside computeMetrics.
 * Ollama comes from the disk cache (written by the async interval below).
 * Everything else is env/file-based and always current.
 */
function getProvidersSync() {
  const cached = readProvidersCache();
  return {
    claude: checkClaudeAuth(),
    ollama: cached && cached.ollama ? cached.ollama : 'unknown',
    gemini: checkGemini(),
    gpt: checkGpt(),
    refreshed_at: cached ? cached.ts : null,
  };
}

/**
 * Async refresh — runs in the tracker interval, writes the disk cache.
 * Only Ollama needs the HTTP check; everything else is included so
 * readers that prefer the cache over the sync reads get consistent data.
 */
async function refreshProvidersAsync() {
  const ollama = await pingOllama();
  const data = {
    claude: checkClaudeAuth(),
    ollama,
    gemini: checkGemini(),
    gpt: checkGpt(),
  };
  try {
    fs.writeFileSync(PROVIDERS_CACHE_PATH, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* non-fatal */ }
  return data;
}

// ── Cache (read decisions.log at most once per 4s) ──────────────────────────
let cache = { ts: 0, mtime: 0, metrics: null, lastEntry: null, lineCount: 0 };
const CACHE_MS = 4000;

function readDecisions() {
  if (Date.now() - cache.ts < CACHE_MS && cache.metrics) return cache;

  let raw = '';
  let mtime = 0;
  try {
    const stat = fs.statSync(LOG_PATH);
    mtime = stat.mtimeMs;
    if (mtime === cache.mtime && cache.metrics) {
      cache.ts = Date.now();
      return cache;
    }
    raw = fs.readFileSync(LOG_PATH, 'utf8');
  } catch {
    cache = {
      ts: Date.now(),
      mtime: 0,
      metrics: emptyMetrics(),
      lastEntry: null,
      lineCount: 0,
    };
    return cache;
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const metrics = computeMetrics(lines);
  // Last entry = last classified (not option_a_hit / failures / system)
  let lastEntry = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = safeParse(lines[i]);
    if (e && e.event === 'classified' && !isSystemPrompt(e)) {
      lastEntry = e;
      break;
    }
  }

  cache = { ts: Date.now(), mtime, metrics, lastEntry, lineCount: lines.length };
  return cache;
}

function safeParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

// ── Subscription profile reader ────────────────────────────────────────────
// Reads the user's plan to compute savings honestly. A Claude Max subscriber
// pays a flat fee — the dollar "saved" doesn't reflect out-of-pocket dollars
// kept. For these users we surface "prompts deflected to free tiers" instead.
const SUB_PROFILE_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');
function readPlan() {
  // v0.10: try OAuth credentials first (most reliable source)
  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const st = creds.claudeAiOauth && creds.claudeAiOauth.subscriptionType;
    if (st) return st; // 'max', 'pro', 'free'
  } catch { /* missing or malformed */ }
  // Fallback: subscription-profile.json
  try {
    const sp = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8'));
    if (sp && sp.profiles && sp.profiles.anthropic) return sp.profiles.anthropic;
  } catch { /* missing or malformed */ }
  return 'unknown';
}

function emptyMetrics() {
  return {
    // Meta
    version: '0.6.0',
    currency: CURRENCY,
    methodology: 'token-estimated',

    // Counts
    prompts: 0,              // user prompts, system prompts filtered out
    system_prompts_filtered: 0,
    option_a_hits: 0,

    // USD costs (always present, source of truth)
    real_cost: 0,            // kept for backwards compat — now = real_cost_estimated
    real_cost_estimated: 0,  // Σ estimateTurnCost(tier, prompt_len)
    naive_cost: 0,           // Σ naiveOpusCost(prompt_len)
    saved: 0,                // naive - real
    saved_pct: 0,
    avg_saved_per_prompt: 0,
    guaranteed_saved: 0,     // Option A hits × avg Opus turn cost (REAL)
    advisory_saved: 0,       // same as `saved`, kept explicitly for honesty

    // Alternate currency (if CURRENCY != USD)
    in_brl: null,
    in_eur: null,
    in_gbp: null,

    // Breakdowns
    by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    cost_by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    pct_by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    by_model: { Ollama: 0, Haiku: 0, Sonnet: 0, Opus: 0 },
    pct_by_model: { Ollama: 0, Haiku: 0, Sonnet: 0, Opus: 0 },
  };
}

function computeMetrics(lines) {
  const m = emptyMetrics();

  // First pass: count Option A hits (regardless of filter) — they are
  // the only guaranteed Opus skips.
  for (const line of lines) {
    const e = safeParse(line);
    if (e && e.event === 'option_a_hit') m.option_a_hits += 1;
  }

  // Second pass: real cost accounting over classified user prompts.
  m.total_input_tokens = 0;
  m.total_output_tokens = 0;
  for (const line of lines) {
    const e = safeParse(line);
    if (!e || e.event !== 'classified' || !e.tier) continue;
    if (!(e.tier in TIER_TO_MODEL)) continue;

    if (isSystemPrompt(e)) {
      m.system_prompts_filtered += 1;
      continue;
    }

    m.prompts += 1;
    m.by_tier[e.tier] += 1;

    const promptLen = e.prompt_len || 0;
    const realUsd = pricing.estimateTurnCost(e.tier, promptLen);
    const naiveUsd = pricing.naiveOpusCost(promptLen);

    m.real_cost_estimated += realUsd;
    m.cost_by_tier[e.tier] += realUsd;
    m.naive_cost += naiveUsd;

    // Token accounting (estimated): input from prompt_len + base context,
    // output from per-tier average. Same numbers pricing.js uses for cost.
    m.total_input_tokens += pricing.estimateInputTokens(promptLen);
    m.total_output_tokens += pricing.AVG_OUTPUT_TOK[e.tier] || 0;
  }
  m.total_tokens = m.total_input_tokens + m.total_output_tokens;
  // Dual-emit: canonical names for cross-surface vocabulary alignment.
  // savings_usd_cumulative mirrors m.saved; tokens_used mirrors m.total_tokens.
  // Old field names are preserved — statusline still reads them.
  // These aliases are written here (before m.saved is rounded) so they stay
  // in sync automatically as computeMetrics evolves.

  // Backwards-compat alias
  m.real_cost = m.real_cost_estimated;

  // Floor saved at 0 — short prompts can produce negative numbers when a
  // T2 estimate exceeds the T3 baseline (rare). Log + clamp.
  const rawSaved = m.naive_cost - m.real_cost_estimated;
  if (rawSaved < 0) m.routing_inefficiency_count = (m.routing_inefficiency_count || 0) + 1;
  m.saved = Math.max(0, rawSaved);
  m.saved_pct = m.naive_cost > 0 ? (m.saved / m.naive_cost) * 100 : 0;
  m.avg_saved_per_prompt = m.prompts > 0 ? m.saved / m.prompts : 0;
  m.advisory_saved = m.saved;

  // Guaranteed savings: each Option A hit replaced a full Opus turn.
  const avgOpusTurn = m.prompts > 0 ? m.naive_cost / m.prompts : 0;
  m.guaranteed_saved = Math.min(m.option_a_hits * avgOpusTurn, m.advisory_saved);

  // Honesty invariant: guaranteed_saved must never exceed advisory_saved.
  if (m.guaranteed_saved > m.advisory_saved) {
    console.error('[savings-tracker] INVARIANT BROKEN: guaranteed_saved > advisory_saved');
    m.guaranteed_saved = m.advisory_saved;
  }

  // Plan-aware fields (P2): surface the user's subscription so consumers
  // can show the right framing. Claude Max users pay flat — show
  // "prompts deflected" instead of "$ saved".
  m.plan = readPlan();
  if (m.plan === 'max' || m.plan === 'claude_max' || m.plan === 'pro' || m.plan === 'claude_pro') {
    const deflected = m.by_tier.T0 + m.by_tier.T1;
    m.savings_display = deflected * avgOpusTurn;
    m.savings_label = 'Opus equiv. deflected';
    m.subscription_note = `Plan: ${m.plan} — ${deflected} prompts deflected to free tiers`;
  } else {
    m.savings_display = m.saved;
    m.savings_label = 'API savings';
    m.subscription_note = null;
  }

  if (m.prompts > 0) {
    for (const t of ['T0', 'T1', 'T2', 'T3']) {
      m.pct_by_tier[t] = (m.by_tier[t] / m.prompts) * 100;
      const label = TIER_TO_MODEL[t];
      m.by_model[label] = m.by_tier[t];
      m.pct_by_model[label] = m.pct_by_tier[t];
    }
  }

  // Currency conversion: compute dual-currency for the big 3 numbers.
  if (CURRENCY !== 'USD') {
    m[`in_${CURRENCY.toLowerCase()}`] = {
      real_cost: round(fx.convert(m.real_cost_estimated, CURRENCY), 2),
      naive_cost: round(fx.convert(m.naive_cost, CURRENCY), 2),
      saved: round(fx.convert(m.saved, CURRENCY), 2),
      guaranteed_saved: round(fx.convert(m.guaranteed_saved, CURRENCY), 2),
      symbol: { BRL: 'R$', EUR: '€', GBP: '£' }[CURRENCY] || '$',
    };
  }

  // Round USD numbers for stable display
  m.real_cost = round(m.real_cost, 4);
  m.real_cost_estimated = round(m.real_cost_estimated, 4);
  m.naive_cost = round(m.naive_cost, 4);
  m.saved = round(m.saved, 4);
  m.saved_pct = round(m.saved_pct, 1);
  m.avg_saved_per_prompt = round(m.avg_saved_per_prompt, 5);
  m.guaranteed_saved = round(m.guaranteed_saved, 4);
  m.advisory_saved = round(m.advisory_saved, 4);
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    m.cost_by_tier[t] = round(m.cost_by_tier[t], 4);
    m.pct_by_tier[t] = round(m.pct_by_tier[t], 1);
  }
  for (const label of ['Ollama', 'Haiku', 'Sonnet', 'Opus']) {
    m.pct_by_model[label] = round(m.pct_by_model[label], 1);
  }

  // Dual-emit canonical aliases for cross-surface vocabulary alignment.
  // savings_usd_cumulative = m.saved (statusline reads m.saved; --counters reads savings_usd_cumulative)
  // tokens_used = m.total_tokens (--counters emits tokens_used; /metrics consumers read total_tokens)
  // Old field names are preserved — do NOT remove until all consumers migrated.
  m.savings_usd_cumulative = m.saved;
  m.tokens_used = m.total_tokens;

  // v0.7.1: provider availability snapshot (sync cheap checks + Ollama from cache)
  m.providers = getProvidersSync();

  // v0.7.2: turn-level latency (requires Stop hook gsd-turn-end.js installed)
  // Returns null when no paired start/end events exist — statusline hides segment.
  m.latency = computeLatency(lines);

  // P3: Routing audit — estimate how often the Claude Code engine actually
  // honored the suggested tier. We can't observe the model directly from a
  // hook, but we CAN compare measured turn duration against the expected
  // duration for the suggested tier. If duration is within tolerance of the
  // suggested baseline → likely honored. If it's much closer to T3 baseline
  // when we suggested T0/T1 → likely NOT honored (Claude went to Opus anyway).
  m.routing_audit = computeRoutingAudit(lines);

  // v0.9: arbiter metrics (in-memory, from POST /arbiter-event)
  m.arbiter = buildArbiterMetrics();

  return m;
}

// P3: Routing audit via latency proxy. Pairs classified+turn_end events,
// then for each pair checks whether the measured duration is closer to the
// suggested-tier baseline than to the next tier up. Honest methodology:
// "honored" = within ±50% of expected tier baseline.
function computeRoutingAudit(lines) {
  const startsBySession = new Map();
  let audited = 0;
  let honored = 0;
  for (const line of lines) {
    const e = safeParse(line);
    if (!e || !e.event) continue;
    if (e.event === 'classified' && e.ts_ms && e.session_id && !isSystemPrompt(e)) {
      startsBySession.set(e.session_id, { ts_ms: e.ts_ms, tier: e.tier });
    } else if (e.event === 'turn_end' && e.ts_ms && e.session_id) {
      const start = startsBySession.get(e.session_id);
      if (!start || !start.tier) continue;
      const dur = e.ts_ms - start.ts_ms;
      if (dur <= 0 || dur > MAX_REALISTIC_TURN_MS) {
        startsBySession.delete(e.session_id);
        continue;
      }
      const expectedMs = OPUS_BASELINE_MS_PER_TIER[start.tier];
      if (!expectedMs) { startsBySession.delete(e.session_id); continue; }
      audited++;
      // honored if duration is within 2× the expected baseline
      // (gives slack for variance, queueing, network)
      if (dur <= expectedMs * 2.0) honored++;
      startsBySession.delete(e.session_id);
    }
  }
  if (audited === 0) return null;
  return {
    audited_turns: audited,
    estimated_honored: honored,
    estimated_honored_pct: round((honored / audited) * 100, 1),
    methodology: 'latency_proxy',
  };
}

function buildArbiterMetrics() {
  const total = ARBITER_METRICS.calls_total;
  const served = ARBITER_METRICS.cache_hits + ARBITER_METRICS.cache_misses;
  return {
    calls_total: total,
    cache_hits: ARBITER_METRICS.cache_hits,
    cache_misses: ARBITER_METRICS.cache_misses,
    cache_hit_rate: served > 0 ? round(ARBITER_METRICS.cache_hits / served, 3) : 0,
    high_risk_refused: ARBITER_METRICS.high_risk_refused,
    cost_usd: round(ARBITER_METRICS.cost_usd, 4),
    avg_latency_ms: total > 0 ? Math.round(ARBITER_METRICS.total_latency_ms / total) : 0,
  };
}

function round(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// ── /real endpoint: OAuth 5h truth ──────────────────────────────────────────
function readRealBudget() {
  try {
    const raw = fs.readFileSync(BUDGET_CACHE_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (!j || !j.data) return { ok: false, reason: 'no_cache' };

    // inject_context.js may have written an auth-error response —
    // surface it clearly so the statusline can warn instead of silently
    // showing zeros.
    if (j.data.type === 'error') {
      return {
        ok: false,
        reason: 'oauth_error',
        error_type: j.data.error && j.data.error.type,
        error_message: j.data.error && j.data.error.message,
        cached_at: j.ts || 0,
        hint: 'Run `claude auth login` to refresh the bearer token.',
      };
    }

    const d = j.data;
    return {
      ok: true,
      source: 'oauth_api',
      five_hour_pct: d.five_hour || d.fiveHour || null,
      session_pct: d.session || null,
      raw: d,
      cached_at: j.ts || 0,
      age_seconds: j.ts ? Math.round((Date.now() - j.ts) / 1000) : null,
    };
  } catch (err) {
    return { ok: false, reason: 'read_failed', error: String(err && err.message || err) };
  }
}

// ── HTTP handlers ───────────────────────────────────────────────────────────
function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function handleHealth(_req, res) {
  send(res, 200, JSON.stringify({ ok: true, port: PORT, pid: process.pid, version: '0.6.0' }));
}

function handleMetrics(req, res) {
  // Optional ?session_id=X — returns metrics scoped to a single Claude Code
  // session. Used by gsd-statusline.js so each terminal shows ITS savings,
  // while the VS Code extension keeps polling all-time via /metrics.
  const url = req.url || '/metrics';
  const qIdx = url.indexOf('?');
  let sessionId = null;
  if (qIdx >= 0) {
    const qs = url.slice(qIdx + 1);
    const params = new URLSearchParams(qs);
    sessionId = params.get('session_id');
  }
  if (sessionId) {
    const metrics = computeMetricsForSession(sessionId);
    send(res, 200, JSON.stringify(metrics));
    return;
  }
  const { metrics } = readDecisions();
  send(res, 200, JSON.stringify(metrics));
}

// Session-scoped metrics: filters decisions.log by session_id, then runs the
// same computeMetrics() pipeline. NOT cached (session size is small, runs on
// every statusline poll).
function computeMetricsForSession(sessionId) {
  if (!sessionId) return emptyMetrics();
  let raw = '';
  try { raw = fs.readFileSync(LOG_PATH, 'utf8'); } catch { return emptyMetrics(); }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const filtered = lines.filter((l) => {
    const e = safeParse(l);
    return e && e.session_id === sessionId;
  });
  const m = computeMetrics(filtered);
  m.scope = 'session';
  m.session_id = sessionId;
  return m;
}

function handleReal(_req, res) {
  send(res, 200, JSON.stringify(readRealBudget()));
}

// v0.9: rich /last shape used by statusline segment ③.
// Prefers the in-memory LAST_DECISION posted by inject_context.js; falls back
// to reconstruction from the last classified line in decisions.log.
const CATEGORY_SHORT = {
  architecture_or_critical: 'arch',
  bug_hunt_or_debug: 'bug',
  refactor: 'rfct',
  plan_or_design: 'plan',
  summarize_or_trivial: 'sum',
  commit_or_docstring: 'doc',
  code_generation: 'code',
  math_or_reasoning: 'math',
  ambiguous_short: 'amb',
  ambiguous_medium: 'amb',
  ambiguous_long: 'amb',
};

const MODEL_SHORT_BY_TIER = { T0: 'qwen', T1: 'hku', T2: 'son', T3: 'ops' };

function modelShort(tier, modelFull) {
  if (tier === 'T0' && typeof modelFull === 'string') {
    if (/coder/i.test(modelFull)) return 'coder';
    if (/deepseek|math|r1/i.test(modelFull)) return 'deep';
    return 'qwen';
  }
  return MODEL_SHORT_BY_TIER[tier] || 'unk';
}

// Estimated Opus baseline (ms) for the given tier — mirrors
// OPUS_BASELINE_MS_PER_TIER used in computeLatency. Used to annotate
// /last with latency_vs_opus_ms when actual latency is measured.
function estOpusBaseline(tier) {
  return OPUS_BASELINE_MS_PER_TIER[tier] || OPUS_BASELINE_MS_PER_TIER.T2;
}

function shapeLast(raw) {
  if (!raw) return {};
  const tier = raw.tier || 'T2';
  const category = raw.task_category || raw.category || 'ambiguous_medium';
  const arbiterUsed = raw.arbiter_honored !== null && raw.arbiter_honored !== undefined;
  const cascade =
    raw.cascade_path ||
    (arbiterUsed ? `L1→L2→${tier}` : `L1→${tier}`);
  const latency = raw.latency_ms || raw.hook_latency_ms || 0;
  return {
    tier,
    model_short: modelShort(tier, raw.recommended_model),
    model_full: raw.recommended_model || null,
    category,
    category_short: CATEGORY_SHORT[category] || 'amb',
    confidence: raw.confidence || 0,
    arbiter_used: arbiterUsed,
    arbiter_confirmed: arbiterUsed ? raw.arbiter_honored === true : null,
    user_override: raw.user_override || null,
    cascade_path: cascade,
    latency_ms: latency,
    latency_vs_opus_ms: latency ? latency - estOpusBaseline(tier) : null,
    ts: raw.ts || new Date().toISOString(),
  };
}

function handleLast(_req, res) {
  if (LAST_DECISION) {
    send(res, 200, JSON.stringify(shapeLast(LAST_DECISION)));
    return;
  }
  const { lastEntry } = readDecisions();
  send(res, 200, JSON.stringify(shapeLast(lastEntry)));
}

// ── v0.9: POST /decision — called by inject_context.js after every hook
// invocation. Fire-and-forget, 200ms timeout on the client side.
function handleDecision(req, res) {
  readBody(req, (body) => {
    try {
      const json = safeParse(body);
      if (json && typeof json === 'object') {
        // Sanitize every string leaf before persisting — handleDecision
        // receives arbitrary payloads from the hook and this value is
        // later reflected back over HTTP on /last and /metrics.
        LAST_DECISION = sanitizeJson(json);
      }
    } catch { /* non-fatal */ }
    send(res, 200, '{"ok":true}');
  });
}

// ── v0.9: POST /arbiter-event — arbiter.js posts one of these after each call.
// Body: { outcome: 'hit'|'miss'|'refused'|'failed', latency_ms, cost_usd }
function handleArbiterEvent(req, res) {
  readBody(req, (body) => {
    try {
      const e = safeParse(body);
      if (e && typeof e === 'object') {
        ARBITER_METRICS.calls_total += 1;
        if (typeof e.latency_ms === 'number') {
          ARBITER_METRICS.total_latency_ms += e.latency_ms;
        }
        if (typeof e.cost_usd === 'number') {
          ARBITER_METRICS.cost_usd += e.cost_usd;
        }
        if (e.outcome === 'hit') ARBITER_METRICS.cache_hits += 1;
        else if (e.outcome === 'miss') ARBITER_METRICS.cache_misses += 1;
        else if (e.outcome === 'refused') ARBITER_METRICS.high_risk_refused += 1;
      }
    } catch { /* non-fatal */ }
    send(res, 200, '{"ok":true}');
  });
}

function readBody(req, cb) {
  let data = '';
  req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) { data = ''; req.destroy(); } });
  req.on('end', () => cb(data));
  req.on('error', () => cb(''));
}

// ── v0.9: GPU probe wiring — import lazily so the tracker doesn't crash on
// platforms where the probe fails at load time. State is cached in-memory and
// refreshed by an interval (see HTTP-server block).
let GPU_STATE = { vendor: 'cpu', name_short: 'CPU-only', vramMB: null, utilPct: null, platform: process.platform };
let OLLAMA_MODELS = null; // populated by refreshOllamaModels

function refreshGpu() {
  try {
    const probe = require('./gpu-probe');
    const s = probe.probeSync ? probe.probeSync() : null;
    if (s) GPU_STATE = s;
  } catch { /* probe not installed yet → keep CPU fallback */ }
}

function refreshGpuUtil() {
  try {
    const probe = require('./gpu-probe');
    if (probe.fetchUtilSync && GPU_STATE.vendor === 'nvidia') {
      const u = probe.fetchUtilSync();
      if (typeof u === 'number') GPU_STATE.utilPct = u;
    }
  } catch { /* keep stale */ }
}

async function refreshOllamaModels() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const now = Date.now();
          // Use decisions.log to find last-use times per model.
          let lines = [];
          try { lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).slice(-500); } catch {}
          const lastUseByModel = new Map();
          for (const l of lines) {
            const e = safeParse(l);
            if (!e || e.event !== 'classified' || !e.recommended_model) continue;
            if (!e.recommended_model.startsWith('qwen') && !e.recommended_model.startsWith('deepseek')) continue;
            const ms = e.ts_ms || (e.ts ? Date.parse(e.ts) : 0);
            if (!ms) continue;
            const prev = lastUseByModel.get(e.recommended_model) || 0;
            if (ms > prev) lastUseByModel.set(e.recommended_model, ms);
          }
          const models = (parsed.models || []).map((m) => {
            const lu = lastUseByModel.get(m.name) || 0;
            const ageMin = lu ? Math.round((now - lu) / 60000) : null;
            const warm = ageMin !== null && ageMin < 10;
            const params = (m.details && m.details.parameter_size) || null;
            return {
              name: m.name,
              state: warm ? 'warm' : 'cold',
              params,
              last_used_min: ageMin,
            };
          });
          OLLAMA_MODELS = models;
        } catch { OLLAMA_MODELS = null; }
        resolve();
      });
    });
    req.on('error', () => { OLLAMA_MODELS = null; resolve(); });
    req.setTimeout(800, () => { req.destroy(); resolve(); });
  });
}

function handleGpu(_req, res) {
  send(res, 200, JSON.stringify({
    vendor: GPU_STATE.vendor,
    name_short: GPU_STATE.name_short,
    vramMB: GPU_STATE.vramMB,
    utilPct: GPU_STATE.utilPct,
    platform: GPU_STATE.platform,
    ollama_models: OLLAMA_MODELS,
  }));
}

function handleProviders(_req, res) {
  // Cheap sync view. The interval inside the HTTP-server block keeps the
  // Ollama field fresh every 30s. For callers that want a live ping right
  // now, use GET /providers?fresh=1 (async, up to 900ms).
  send(res, 200, JSON.stringify(getProvidersSync()));
}

function handleSummary(_req, res) {
  const { metrics: m } = readDecisions();
  const curSym = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' }[CURRENCY] || '$';
  const alt = m[`in_${CURRENCY.toLowerCase()}`];
  const line = (label, usd) => {
    const usdStr = `$${usd.toFixed(4)}`;
    if (alt && CURRENCY !== 'USD') {
      const a = fx.convert(usd, CURRENCY).toFixed(2);
      return `${label.padEnd(14)} ${curSym}${a}  (${usdStr})`;
    }
    return `${label.padEnd(14)} ${usdStr}`;
  };
  const txt = [
    `frugal — savings summary (v0.6 token-estimated)`,
    ``,
    `Currency:     ${CURRENCY}`,
    `Prompts:      ${m.prompts}  (${m.system_prompts_filtered} system filtered)`,
    ``,
    line('Real (est):', m.real_cost_estimated),
    line('Naive Opus:', m.naive_cost),
    line('Advisory:', m.advisory_saved),
    line('Guaranteed:', m.guaranteed_saved) + `  (${m.option_a_hits} Option-A hits)`,
    `Saved pct:    ${m.saved_pct.toFixed(1)}%  (advisory)`,
    ``,
    `Tier breakdown:`,
    `  T0  ${String(m.by_tier.T0).padStart(5)}  (${m.pct_by_tier.T0.toFixed(1)}%)   $${m.cost_by_tier.T0.toFixed(4)}`,
    `  T1  ${String(m.by_tier.T1).padStart(5)}  (${m.pct_by_tier.T1.toFixed(1)}%)   $${m.cost_by_tier.T1.toFixed(4)}`,
    `  T2  ${String(m.by_tier.T2).padStart(5)}  (${m.pct_by_tier.T2.toFixed(1)}%)   $${m.cost_by_tier.T2.toFixed(4)}`,
    `  T3  ${String(m.by_tier.T3).padStart(5)}  (${m.pct_by_tier.T3.toFixed(1)}%)   $${m.cost_by_tier.T3.toFixed(4)}`,
    ``,
    `Methodology: ${m.methodology}`,
    `  Guaranteed = Option-A hits × avg Opus turn (real skips)`,
    `  Advisory   = tier-routing baseline (approximation)`,
  ].join('\n');
  send(res, 200, txt, 'text/plain; charset=utf-8');
}

// ── /corpus — live corpus count from metrics-snapshot.json ──────────────────
// Written by update-metrics.js after each backtest run. Returns the real
// corpus_size from decisions.log (not the stale 1,437 manual snapshot).
// Falls back to counting decisions.log directly if snapshot is absent/stale.
function handleCorpus(_req, res) {
  // Try metrics-snapshot.json first (fast, cached by backtest)
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    const ageMs = snap.generated_at ? Date.now() - Date.parse(snap.generated_at) : Infinity;
    if (ageMs < 24 * 60 * 60 * 1000) { // fresh if < 24h old
      return send(res, 200, JSON.stringify({
        corpus_size: snap.corpus_size,
        by_tier: snap.by_tier,
        by_tier_pct: snap.by_tier_pct,
        cost: snap.cost,
        avg_confidence: snap.avg_confidence,
        date_range: snap.date_range,
        generated_at: snap.generated_at,
        source: 'snapshot',
      }));
    }
  } catch { /* fall through to live count */ }

  // Fallback: count directly from decisions.log (slower but always accurate)
  let count = 0;
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      const e = safeParse(l);
      if (e && (e.event === 'classified' || (!e.event && e.tier))) count++;
    }
  } catch { /* log absent */ }
  send(res, 200, JSON.stringify({ corpus_size: count, source: 'live_count' }));
}

// ── /optimizer-stats (Sprint 5-A) ──────────────────────────────────────
// Reads prompt_optimized events from decisions.log and returns aggregate
// stats: total optimized, optimization rate, tokens saved, top strategies,
// breakdown by tier. Bounded tail read (256 KB), silent on error.
function handleOptimizerStats(_req, res) {
  try {
    const stat = fs.statSync(LOG_PATH);
    const start = Math.max(0, stat.size - 256 * 1024);
    const fd = fs.openSync(LOG_PATH, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);

    let totalClassified = 0;
    let totalOptimized = 0;
    let tokensSavedTotal = 0;
    const strategyCounts = {};
    const byTier = {};

    for (const line of lines) {
      const e = safeParse(line);
      if (!e) continue;
      if (e.event === 'classified') totalClassified++;
      if (e.event === 'prompt_optimized') {
        totalOptimized++;
        tokensSavedTotal += (e.tokens_saved_est || 0);
        const s = e.strategy || 'unknown';
        strategyCounts[s] = (strategyCounts[s] || 0) + 1;
        const t = e.tier || 'unknown';
        byTier[t] = (byTier[t] || 0) + 1;
      }
    }

    const topStrategies = Object.entries(strategyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);

    send(res, 200, JSON.stringify({
      total_optimized: totalOptimized,
      total_classified: totalClassified,
      optimization_rate: totalClassified > 0 ? +(totalOptimized / totalClassified).toFixed(3) : 0,
      tokens_saved_est_total: tokensSavedTotal,
      top_strategies: topStrategies,
      by_tier: byTier,
    }));
  } catch {
    send(res, 200, JSON.stringify({ total_optimized: 0, error: 'log_read_failed' }));
  }
}

const ROUTES = {
  '/health': handleHealth,
  '/metrics': handleMetrics,
  '/summary': handleSummary,
  '/last': handleLast,
  '/real': handleReal,
  '/corpus': handleCorpus,
  '/providers': handleProviders,
  '/gpu': handleGpu,
  '/optimizer-stats': handleOptimizerStats,
};

// POST-only routes (body-consuming)
const POST_ROUTES = {
  '/decision': handleDecision,
  '/arbiter-event': handleArbiterEvent,
};

// Only start the HTTP server when run as a script — never when this
// file is require()'d from tests or another consumer. Without this
// guard, the unit test suite EADDRINUSE-exits mid-run because the
// already-running daemon on 7821 conflicts with the spawned listener.
if (require.main === module) {
  // CCA Criterion #10 (Environment Safety) — fail-fast on malformed env.
  // requireEnv() throws a ZodError naming the offending variable if any
  // MOOTER_* / FRUGAL_* value is present but invalid (e.g. non-URL hub
  // url, non-integer port). Defaults kick in when vars are absent, so
  // a fresh install with no env still starts cleanly.
  let _env;
  try {
    _env = requireEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mooter] env validation failed:\n${msg}\n`);
    process.stderr.write(`[mooter] Fix the offending MOOTER_* / FRUGAL_* env var and restart.\n`);
    process.exit(2);
  }

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();
    try {
      if (method === 'POST' && POST_ROUTES[url]) {
        POST_ROUTES[url](req, res);
        return;
      }
      const handler = ROUTES[url];
      if (!handler) {
        send(res, 404, JSON.stringify({ error: 'not found', routes: Object.keys(ROUTES) }));
        return;
      }
      handler(req, res);
    } catch (err) {
      // Sprint 8.4: forward unexpected route errors to Sentry. No-op when
      // MOOTER_SENTRY_DSN is unset — see sentry-helper.js.
      sentry.captureException(err, { tags: { route: url, method } });
      send(res, 500, JSON.stringify({ error: String(err && err.message || err) }));
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') process.exit(0);
    // Sprint 8.4: capture server-level errors (non-EADDRINUSE) before exit.
    sentry.captureException(err, { tags: { scope: 'http_server' } });
    process.exit(0);
  });

  server.listen(PORT, HOST, () => {
    // v0.7: write a pid file so inject_context.js can detect a live tracker
    // without opening a TCP socket on every hook invocation. File mtime
    // serves as liveness signal; stale >1h triggers respawn.
    try {
      const pidPath = path.join(ROUTER_DIR, '.tracker.pid');
      fs.writeFileSync(pidPath, String(process.pid));
    } catch { /* non-fatal */ }
    if (process.env.FRUGAL_TRACKER_VERBOSE) {
      process.stdout.write(`frugal tracker v0.6 listening on http://${HOST}:${PORT} (${CURRENCY})\n`);
    }
  });

  // Touch the pid file every 30min to keep it fresh (prevents false "stale"
  // respawns when the tracker is alive but hasn't been re-started recently).
  setInterval(() => {
    try {
      const pidPath = path.join(ROUTER_DIR, '.tracker.pid');
      fs.writeFileSync(pidPath, String(process.pid));
    } catch { /* non-fatal */ }
  }, 30 * 60 * 1000).unref();

  // v0.7.1: provider availability refresher. First run on startup so the
  // statusline shows accurate dots from the first fetch, then every 30s.
  // Async Ollama ping is the only non-trivial part; everything else is env.
  const runRefresh = () => {
    refreshProvidersAsync().catch(() => { /* never throw out of interval */ });
  };
  runRefresh();
  setInterval(runRefresh, 30 * 1000).unref();

  // v0.9: GPU probe — one-shot name/vram detection at startup, then poll
  // utilization every 5s (NVIDIA only). Never throws out of the interval.
  refreshGpu();
  setInterval(refreshGpuUtil, 5 * 1000).unref();

  // v0.9: Ollama model state (warm/cold) — refresh every 30s.
  refreshOllamaModels().catch(() => {});
  setInterval(() => refreshOllamaModels().catch(() => {}), 30 * 1000).unref();

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      try { server.close(); } catch {}
      try { fs.unlinkSync(path.join(ROUTER_DIR, '.tracker.pid')); } catch {}
      process.exit(0);
    });
  }
}

// Exported for unit tests (required from backtest.test.js)
module.exports = {
  computeMetrics,
  readRealBudget,
  isSystemPrompt,
  emptyMetrics,
  SYSTEM_PROMPT_PATTERNS,
  TIER_TO_MODEL,
  // v0.7.1 provider availability
  checkClaudeAuth,
  checkGemini,
  checkGpt,
  pingOllama,
  getProvidersSync,
  refreshProvidersAsync,
  // v0.7.2 turn latency
  computeLatency,
  OPUS_BASELINE_MS_PER_TIER,
};
