#!/usr/bin/env node
/**
 * arbiter.js — Haiku-powered semantic arbiter for ambiguous prompts (v0.8).
 *
 * When the regex classifier in classify.js returns a low-confidence decision
 * (confidence < 0.75) OR lands in `ambiguous_medium` / `ambiguous_long`, we
 * fall through to this arbiter. It calls Claude Haiku 4.5 with a short
 * system prompt describing the tier ladder and asks for a JSON routing
 * decision. Haiku is cheap (~$0.001/call) and fast (~400ms).
 *
 * Design principles:
 *   1. OPTIONAL — if ANTHROPIC_API_KEY is absent, the arbiter is a no-op
 *      and inject_context.js falls back to the regex decision. No crashes.
 *   2. CACHED — decisions are keyed by SHA-256(prompt + system_version).
 *      Cache persists on disk (~/.claude/tools/router/.arbiter-cache.json).
 *      Semantic decisions don't rot quickly, so TTL = 7 days, LRU = 500.
 *   3. DUAL-ENFORCED — the arbiter can never downgrade a HIGH_RISK prompt.
 *      inject_context.js cross-checks the arbiter result against the regex
 *      high-risk signal count and refuses demotion if they conflict.
 *   4. FAST-FAIL — 1.5s hard timeout. On timeout/error/parse-fail, return
 *      null and the hook falls back to the regex decision silently.
 *   5. LOGGED — every arbiter call appends an `arbiter_call` event to
 *      decisions.log with duration, cost estimate, and decision. The
 *      backtest reads these to surface cost/hit ratio in the daily report.
 *
 * Exports:
 *   arbitrate(prompt) → { tier, subagent, reasoning } | null
 *   ARBITER_SYSTEM_PROMPT_VERSION: number (bump to invalidate cache)
 *
 * Used by: inject_context.js (hook path)
 * Tested in: backtest.test.js (mock-based unit tests)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Bump this when ARBITER_SYSTEM_PROMPT changes so cached decisions based on
// the old rules are invalidated automatically.
const ARBITER_SYSTEM_PROMPT_VERSION = 1;

const ARBITER_SYSTEM_PROMPT = `You are the routing arbiter for frugal, a cost-aware Claude Code router.
Given a user prompt, pick the minimum-viable tier and the correct subagent.
Respond with ONE line of JSON, no preamble, no markdown.

TIERS:
- T0: trivial local work (summarize, format, rename, explain short snippet, translate)
  subagent: "local-summarizer" or "local-transformer"
- T1: light reasoning (commit message, docstring, regex, explain error, trivial test)
  subagent: "cheap-triage"
- T2: multi-step reasoning (bug investigation, refactor plan, decomposition, compare approaches)
  subagent: "model-reasoner"
- T3: architecture, critical decisions, production changes, multi-file refactors, pre-merge review
  subagent: "model-architect"

SAFETY OVERRIDES (ALWAYS escalate to T3):
- anything touching .env, package.json, CI/CD, migrations, secrets, credentials
- anything before git push, merge, release, deploy
- refactor affecting more than 3 files
- architecture decisions

HEURISTICS:
- When in doubt between two tiers, pick the cheaper.
- Short prompts (<100 chars) without risk signals → usually T0.
- Natural quality signals ("pensa bem", "think hard", "best effort") → promote one tier.
- If the prompt decomposes naturally into substeps of different complexity, include a "decomposition" array.

OUTPUT SCHEMA (exact):
{"tier":"T0|T1|T2|T3","subagent":"<name>","reasoning":"<≤15 words>","decomposition":[{"task":"...","tier":"...","subagent":"..."}]?}

Respond with ONLY the JSON.`;

const MODEL = process.env.ARBITER_MODEL || 'claude-haiku-4-5-20251001';
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const CACHE_PATH = path.join(ROUTER_DIR, '.arbiter-cache.json');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX = 500;
const TIMEOUT_MS = 1500;
const VALID_SUBAGENTS = new Set([
  'local-summarizer',
  'local-transformer',
  'cheap-triage',
  'model-reasoner',
  'model-architect',
]);

function hashKey(prompt) {
  return crypto
    .createHash('sha256')
    .update(`v${ARBITER_SYSTEM_PROMPT_VERSION}:${prompt}`)
    .digest('hex');
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
    if (raw.version !== ARBITER_SYSTEM_PROMPT_VERSION) {
      return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
    }
    return raw;
  } catch {
    return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
  }
}

function saveCache(cache) {
  try {
    // LRU eviction
    const keys = Object.keys(cache.entries);
    if (keys.length > CACHE_MAX) {
      const sorted = keys
        .map((k) => ({ k, ts: cache.entries[k].ts || 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, CACHE_MAX);
      const kept = {};
      for (const { k } of sorted) kept[k] = cache.entries[k];
      cache.entries = kept;
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch { /* non-fatal */ }
}

function logArbiterEvent(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* telemetry best-effort */ }
}

/**
 * Synchronously call Haiku with the arbiter system prompt.
 * Returns the raw API response text (JSON string from Claude), or null on error.
 *
 * Uses the same spawnSync+inline-node pattern that inject_context.js uses for
 * the budget fetch — lets us stay in a sync hook context without block-ing
 * on node's async-only HTTPS module.
 */
function callHaikuSync(apiKey, prompt) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 300,
    system: ARBITER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const scriptText = `
    const https = require('https');
    const body = process.argv[2];
    const apiKey = process.argv[3];
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => process.stdout.write(data));
    });
    req.on('error', () => process.exit(1));
    req.setTimeout(${TIMEOUT_MS - 200}, () => { req.destroy(); process.exit(2); });
    req.write(body);
    req.end();
  `;

  const r = spawnSync(process.execPath, ['-e', scriptText, body, apiKey], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout;
}

/**
 * Extract the JSON decision from a full Anthropic /v1/messages response.
 * Tolerates markdown fences, leading text, and trailing whitespace.
 */
function extractDecision(apiResponseText) {
  try {
    const parsed = JSON.parse(apiResponseText);
    if (parsed.type === 'error') return null;
    const text = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!text) return null;
    // Find the first {...} block in the text.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const decision = JSON.parse(match[0]);
    // Sanity-check the shape.
    if (!['T0', 'T1', 'T2', 'T3'].includes(decision.tier)) return null;
    if (!VALID_SUBAGENTS.has(decision.subagent)) return null;
    if (typeof decision.reasoning !== 'string') decision.reasoning = '';
    return decision;
  } catch {
    return null;
  }
}

/**
 * Main entry point. Returns { tier, subagent, reasoning, cached, decomposition? }
 * or null when the arbiter is unavailable / failed / timed out.
 *
 * Options:
 *   - _mockResponse: inject a fake API response (for tests, no real HTTP call)
 *   - _skipCache:   bypass cache read (for tests)
 */
function arbitrate(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') return null;

  // No key → no arbiter. This is a soft exit, not an error.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !options._mockResponse) {
    return null;
  }

  const key = hashKey(prompt);

  // Cache lookup
  if (!options._skipCache) {
    const cache = loadCache();
    const entry = cache.entries[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS && entry.decision) {
      return { ...entry.decision, cached: true };
    }
  }

  // Fresh call
  const startMs = Date.now();
  const raw = options._mockResponse !== undefined
    ? options._mockResponse
    : callHaikuSync(apiKey, prompt);
  const durationMs = Date.now() - startMs;

  if (!raw) {
    logArbiterEvent({
      ts: new Date().toISOString(),
      event: 'arbiter_call',
      outcome: 'failed',
      duration_ms: durationMs,
      prompt_len: prompt.length,
    });
    return null;
  }

  const decision = extractDecision(raw);
  if (!decision) {
    logArbiterEvent({
      ts: new Date().toISOString(),
      event: 'arbiter_call',
      outcome: 'parse_failed',
      duration_ms: durationMs,
      prompt_len: prompt.length,
    });
    return null;
  }

  // Write cache
  if (!options._skipCache) {
    const cache = loadCache();
    cache.entries[key] = { ts: Date.now(), decision };
    saveCache(cache);
  }

  // Log the successful call
  logArbiterEvent({
    ts: new Date().toISOString(),
    event: 'arbiter_call',
    outcome: 'ok',
    duration_ms: durationMs,
    prompt_len: prompt.length,
    tier: decision.tier,
    subagent: decision.subagent,
    reasoning: decision.reasoning,
    // Rough cost estimate: system ~320 tok + prompt tok_est + response ~50 tok
    // at Haiku rates $0.80/$4.00 per MTok
    est_cost_usd:
      ((320 + Math.ceil(prompt.length / 3.5)) * 0.8 + 50 * 4) / 1e6,
  });

  return { ...decision, cached: false };
}

module.exports = {
  arbitrate,
  extractDecision,
  hashKey,
  ARBITER_SYSTEM_PROMPT,
  ARBITER_SYSTEM_PROMPT_VERSION,
  VALID_SUBAGENTS,
};

// CLI mode — useful for debugging: `node arbiter.js "some prompt"`
if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) {
    console.error('usage: node arbiter.js "<prompt>"');
    process.exit(1);
  }
  const result = arbitrate(prompt);
  console.log(JSON.stringify(result, null, 2));
}
