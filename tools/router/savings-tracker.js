#!/usr/bin/env node
/**
 * savings-tracker.js — frugal savings HTTP server
 *
 * Reads ~/.claude/tools/router/decisions.log (JSONL, one entry per prompt)
 * and exposes metrics on http://127.0.0.1:7821.
 *
 * Endpoints:
 *   GET /health   → 200 {ok:true}
 *   GET /metrics  → JSON {prompts, real_cost, naive_cost, saved, saved_pct, by_tier}
 *   GET /summary  → text/plain human-readable
 *   GET /last     → last log entry as JSON
 *
 * Cost model (per prompt, USD, tier-flat):
 *   T0 = 0.000   (Ollama / local)
 *   T1 = 0.0008  (Haiku)
 *   T2 = 0.008   (Sonnet)
 *   T3 = 0.045   (Opus)
 *
 * Naive baseline = "what it would cost if every prompt went to T3 (Opus)".
 * Savings = naive_cost - real_cost.
 *
 * Single-instance: if port 7821 is already bound, exit silently.
 *
 * Started detached by inject_context.js, statusline.sh, or the VS Code
 * extension via a /health probe. Never crashes the host.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 7821;
const HOST = '127.0.0.1';
const LOG_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');

const COSTS = {
  T0: 0.0,
  T1: 0.0008,
  T2: 0.008,
  T3: 0.045,
};
const NAIVE_TIER = 'T3';

// Tier → human-readable model label, used to build pct_by_model.
// Statusline reads this directly so it no longer needs a heuristic mapping.
const TIER_TO_MODEL = {
  T0: 'Ollama',
  T1: 'Haiku',
  T2: 'Sonnet',
  T3: 'Opus',
};

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
  const lastEntry = lines.length ? safeParse(lines[lines.length - 1]) : null;

  cache = { ts: Date.now(), mtime, metrics, lastEntry, lineCount: lines.length };
  return cache;
}

function safeParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function emptyMetrics() {
  return {
    prompts: 0,
    real_cost: 0,
    naive_cost: 0,
    saved: 0,
    saved_pct: 0,
    avg_saved_per_prompt: 0,
    by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    cost_by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    pct_by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
    by_model: { Ollama: 0, Haiku: 0, Sonnet: 0, Opus: 0 },
    pct_by_model: { Ollama: 0, Haiku: 0, Sonnet: 0, Opus: 0 },
  };
}

function computeMetrics(lines) {
  const m = emptyMetrics();

  for (const line of lines) {
    const e = safeParse(line);
    if (!e || e.event !== 'classified' || !e.tier) continue;
    if (!(e.tier in COSTS)) continue;

    m.prompts += 1;
    m.by_tier[e.tier] += 1;

    const real = typeof e.cost_estimate === 'number' ? e.cost_estimate : COSTS[e.tier];
    m.real_cost += real;
    m.cost_by_tier[e.tier] += real;
    m.naive_cost += COSTS[NAIVE_TIER];
  }

  m.saved = m.naive_cost - m.real_cost;
  m.saved_pct = m.naive_cost > 0 ? (m.saved / m.naive_cost) * 100 : 0;
  m.avg_saved_per_prompt = m.prompts > 0 ? m.saved / m.prompts : 0;

  if (m.prompts > 0) {
    for (const t of ['T0', 'T1', 'T2', 'T3']) {
      m.pct_by_tier[t] = (m.by_tier[t] / m.prompts) * 100;
      const label = TIER_TO_MODEL[t];
      m.by_model[label] = m.by_tier[t];
      m.pct_by_model[label] = m.pct_by_tier[t];
    }
  }

  // Round for stable display
  m.real_cost = round(m.real_cost, 4);
  m.naive_cost = round(m.naive_cost, 4);
  m.saved = round(m.saved, 4);
  m.saved_pct = round(m.saved_pct, 1);
  m.avg_saved_per_prompt = round(m.avg_saved_per_prompt, 5);
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    m.cost_by_tier[t] = round(m.cost_by_tier[t], 4);
    m.pct_by_tier[t] = round(m.pct_by_tier[t], 1);
  }
  for (const label of ['Ollama', 'Haiku', 'Sonnet', 'Opus']) {
    m.pct_by_model[label] = round(m.pct_by_model[label], 1);
  }
  return m;
}

function round(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
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
  send(res, 200, JSON.stringify({ ok: true, port: PORT, pid: process.pid }));
}

function handleMetrics(_req, res) {
  const { metrics } = readDecisions();
  send(res, 200, JSON.stringify(metrics));
}

function handleLast(_req, res) {
  const { lastEntry } = readDecisions();
  send(res, 200, JSON.stringify(lastEntry || {}));
}

function handleSummary(_req, res) {
  const { metrics } = readDecisions();
  const m = metrics;
  const txt = [
    `frugal — savings summary`,
    ``,
    `Prompts:     ${m.prompts}`,
    `Real cost:   $${m.real_cost.toFixed(4)}`,
    `Naive (T3):  $${m.naive_cost.toFixed(4)}`,
    `Saved:       $${m.saved.toFixed(4)}  (${m.saved_pct.toFixed(1)}%)`,
    `Avg/prompt:  $${m.avg_saved_per_prompt.toFixed(5)} saved`,
    ``,
    `Tier breakdown:`,
    `  T0  ${String(m.by_tier.T0).padStart(5)}  (${m.pct_by_tier.T0.toFixed(1)}%)   $${m.cost_by_tier.T0.toFixed(4)}`,
    `  T1  ${String(m.by_tier.T1).padStart(5)}  (${m.pct_by_tier.T1.toFixed(1)}%)   $${m.cost_by_tier.T1.toFixed(4)}`,
    `  T2  ${String(m.by_tier.T2).padStart(5)}  (${m.pct_by_tier.T2.toFixed(1)}%)   $${m.cost_by_tier.T2.toFixed(4)}`,
    `  T3  ${String(m.by_tier.T3).padStart(5)}  (${m.pct_by_tier.T3.toFixed(1)}%)   $${m.cost_by_tier.T3.toFixed(4)}`,
  ].join('\n');
  send(res, 200, txt, 'text/plain; charset=utf-8');
}

const ROUTES = {
  '/health': handleHealth,
  '/metrics': handleMetrics,
  '/summary': handleSummary,
  '/last': handleLast,
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const handler = ROUTES[url];
  if (!handler) {
    send(res, 404, JSON.stringify({ error: 'not found', routes: Object.keys(ROUTES) }));
    return;
  }
  try {
    handler(req, res);
  } catch (err) {
    send(res, 500, JSON.stringify({ error: String(err && err.message || err) }));
  }
});

server.on('error', (err) => {
  // EADDRINUSE → another instance is already running. Exit silently.
  if (err && err.code === 'EADDRINUSE') process.exit(0);
  // Any other error → also exit silently. Tracker is best-effort.
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  // No console output by default — keeps detached spawn quiet.
  if (process.env.FRUGAL_TRACKER_VERBOSE) {
    process.stdout.write(`frugal tracker listening on http://${HOST}:${PORT}\n`);
  }
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { server.close(); } catch {}
    process.exit(0);
  });
}
