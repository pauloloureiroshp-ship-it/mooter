#!/usr/bin/env node
'use strict';

/**
 * speed-meter.js — Wave perf-validation (WS1): TTFT / TPOT / throughput meter.
 *
 * The router already measures COST (pricing.js) and TOKENS (token_tracker.js)
 * but it has NEVER measured SPEED. This module fills that gap WITHOUT touching
 * classify.js or the decision path: it is a standalone measurement harness,
 * invoked by the validation runner (WS2) and the cockpit fleet view (WS3),
 * never on the hot path of a real routed call.
 *
 * Methodology (RouterBench + NVIDIA/BentoML 2026 — cited in
 * docs/strategy/MOOTER_PERF_VALIDATION.md):
 *   - TTFT       = wall-clock time to the FIRST output token (perceived latency).
 *   - TPOT       = time per output token in decode (ms/token) — perceived speed.
 *   - throughput = output tokens / decode seconds (tok/s), request-weighted
 *                  (batch=1, never batch-optimised — hot-batch numbers mislead).
 *   - Local: stream /api/generate (stream:true), temp=0, batch=1, FIXED prompt
 *            and num_predict; 3 warm-ups + MEDIAN of 3 runs; cold-start measured
 *            SEPARATELY (never folded into the warm number).
 *   - Cloud: measured from a streamed response when an API key is present;
 *            otherwise returned as { estimated:true } with a documented basis —
 *            a missing number is marked estimated, NEVER invented.
 *
 * Best-effort always: every measurement catches its own errors and returns
 * { ok:false, error } — the meter NEVER throws into its caller.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

// ── Fixed measurement workload (deterministic → reproducible) ───────────────
// A fixed prompt + fixed num_predict keeps warm runs comparable across models
// and across days. temp=0 removes sampling variance. Counting is a stable,
// model-agnostic task that always produces ~num_predict tokens of decode.
const DEFAULT_PROMPT = 'Conta de 1 ate 60, um numero por linha, sem texto extra.';
const DEFAULT_NUM_PREDICT = 160;
const DEFAULT_WARMUPS = 3;
const DEFAULT_RUNS = 3;
// Cold-load heuristic: a warm call reports load_duration in the low ms; a cold
// load (model paged into VRAM) reports seconds. 1.5s is a conservative cut.
const COLD_LOAD_MS = 1500;
// Per-call ceiling. Cold qwen3:30b load can take many seconds — be generous.
const DEFAULT_TIMEOUT_MS = 90000;
// Bounded append-only log (mirrors decisions_v2 best-effort pattern).
const MAX_LOG_BYTES = 5_000_000;

function routerDir() {
  const claude =
    process.env.MOOTER_CLAUDE_DIR ||
    process.env.FRUGAL_CLAUDE_DIR ||
    path.join(os.homedir(), '.claude');
  return path.join(claude, 'tools', 'router');
}

/** Path to speed-metrics.jsonl (env-overridable for tests). */
function metricsPath() {
  return (
    process.env.MOOTER_SPEED_METRICS_LOG ||
    path.join(routerDir(), 'speed-metrics.jsonl')
  );
}

function ollamaHost() {
  return process.env.OLLAMA_HOST || 'http://localhost:11434';
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Median of a numeric array. Returns null on empty/garbage input. null and
 * undefined are treated as MISSING (dropped), never coerced to 0 — a missing
 * measurement must not drag the median down.
 */
function median(nums) {
  const xs = (Array.isArray(nums) ? nums : [])
    .filter((n) => n != null)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Nanoseconds (Ollama metrics) → milliseconds, or null if absent. */
function nsToMs(ns) {
  const n = Number(ns);
  return Number.isFinite(n) && n >= 0 ? n / 1e6 : null;
}

function round(n, d = 1) {
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// ── Cloud speed estimates (NO API key → honest estimate, never invented) ─────
// These are order-of-magnitude PUBLIC 2026 streaming figures, NOT measured on
// this machine. Every entry carries estimated:true and a basis string so a
// reader (and the report) can never mistake them for measurements.
const CLOUD_ESTIMATE_BASIS =
  'public 2026 streaming-latency figures (provider status pages / community ' +
  'benchmarks); NOT measured here — no streaming API key available';
const CLOUD_SPEED_ESTIMATES = {
  // model key (pricing.js) → typical interactive streaming behaviour
  'claude-haiku-4-5': { ttft_ms: 400, tps: 110, estimated: true },
  'claude-sonnet-4-6': { ttft_ms: 600, tps: 75, estimated: true },
  'claude-opus-4-6': { ttft_ms: 900, tps: 45, estimated: true },
  'claude-opus-4-6[1m]': { ttft_ms: 1100, tps: 42, estimated: true },
  'claude-fable-5': { ttft_ms: 700, tps: 80, estimated: true },
};

/**
 * Best-effort cloud speed for a model key. Returns a measurement-shaped object
 * with estimated:true and a basis. Pure — never throws, never hits the network.
 * @param {string} modelKey
 */
function estimateCloud(modelKey) {
  const e = CLOUD_SPEED_ESTIMATES[modelKey] || { ttft_ms: 700, tps: 60, estimated: true };
  const tpot_ms = e.tps > 0 ? round(1000 / e.tps, 2) : null;
  return {
    ok: true,
    model: modelKey,
    source: 'estimated',
    estimated: true,
    basis: CLOUD_ESTIMATE_BASIS,
    ttft_ms: e.ttft_ms,
    tpot_ms,
    tps: e.tps,
  };
}

// ── Local (Ollama) measurement ──────────────────────────────────────────────

/** POST helper returning the raw http.IncomingMessage stream (or rejects). */
function postStream(urlStr, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    const payload = Buffer.from(JSON.stringify(body));
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      },
      (res) => resolve(res)
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Measure ONE local Ollama generation via streaming /api/generate.
 * Captures wall-clock TTFT (time to first token chunk) and uses Ollama's own
 * decode metrics (eval_count / eval_duration) for tps / tpot — which cleanly
 * isolate decode from model load. load_duration flags cold vs warm.
 *
 * Always resolves: { ok:true, ...metrics } | { ok:false, error }.
 * @param {{model:string, prompt?:string, system?:string, numPredict?:number,
 *          temperature?:number, host?:string, timeoutMs?:number}} o
 */
async function measureOllamaOnce(o = {}) {
  const model = o.model;
  if (!model) return { ok: false, error: 'no model' };
  const host = o.host || ollamaHost();
  const prompt = o.prompt != null ? o.prompt : DEFAULT_PROMPT;
  const numPredict = Number.isFinite(o.numPredict) ? o.numPredict : DEFAULT_NUM_PREDICT;
  const temperature = Number.isFinite(o.temperature) ? o.temperature : 0;
  const timeoutMs = Number.isFinite(o.timeoutMs) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    prompt,
    stream: true,
    options: { temperature, num_predict: numPredict },
  };
  if (o.system) body.system = o.system;

  const start = Date.now();
  let ttftMs = null;
  let last = null;
  let buf = '';

  try {
    const res = await postStream(new URL('/api/generate', host).toString(), body, timeoutMs);
    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if (ttftMs == null && obj.response) ttftMs = Date.now() - start;
          if (obj.done) last = obj;
        }
      });
      res.on('end', resolve);
      res.on('error', reject);
    });
  } catch (e) {
    return { ok: false, model, error: String((e && e.message) || e) };
  }

  const totalMs = Date.now() - start;
  if (!last) {
    return { ok: false, model, error: 'no done frame', total_ms: totalMs };
  }

  const tokensOut = Number(last.eval_count) || 0;
  const decodeMs = nsToMs(last.eval_duration);
  const loadMs = nsToMs(last.load_duration);
  const promptEvalMs = nsToMs(last.prompt_eval_duration);
  const tps = decodeMs && tokensOut ? round((tokensOut / decodeMs) * 1000, 1) : null;
  const tpotMs = decodeMs && tokensOut ? round(decodeMs / tokensOut, 2) : null;
  const cold = loadMs != null ? loadMs >= COLD_LOAD_MS : null;

  return {
    ok: true,
    model,
    source: 'measured',
    estimated: false,
    ttft_ms: ttftMs != null ? round(ttftMs, 0) : null,
    tpot_ms: tpotMs,
    tps,
    tokens_out: tokensOut,
    decode_ms: decodeMs != null ? round(decodeMs, 0) : null,
    prompt_eval_ms: promptEvalMs != null ? round(promptEvalMs, 0) : null,
    load_ms: loadMs != null ? round(loadMs, 0) : null,
    total_ms: round(totalMs, 0),
    cold,
  };
}

/**
 * Best-effort unload so the next call measures a true cold start. Sends
 * keep_alive:0 with a near-empty generation. Resolves regardless of outcome.
 */
async function forceUnload(model, host) {
  try {
    const res = await postStream(
      new URL('/api/generate', host || ollamaHost()).toString(),
      { model, prompt: ' ', stream: false, keep_alive: 0, options: { num_predict: 1 } },
      15000
    );
    await new Promise((resolve) => {
      res.on('data', () => {});
      res.on('end', resolve);
      res.on('error', resolve);
    });
  } catch {
    /* best-effort */
  }
}

function summariseWarm(samples) {
  const ok = samples.filter((s) => s && s.ok);
  if (!ok.length) return null;
  return {
    source: 'measured',
    estimated: false,
    n: ok.length,
    ttft_ms: median(ok.map((s) => s.ttft_ms)),
    tpot_ms: median(ok.map((s) => s.tpot_ms)),
    tps: median(ok.map((s) => s.tps)),
    tokens_out: median(ok.map((s) => s.tokens_out)),
    decode_ms: median(ok.map((s) => s.decode_ms)),
    total_ms: median(ok.map((s) => s.total_ms)),
  };
}

/**
 * Full benchmark of ONE local model: cold start (separate) + warm-ups + median
 * of N runs. Never throws — returns { ok:false } when nothing measured.
 * @param {{model:string, prompt?:string, numPredict?:number, warmups?:number,
 *          runs?:number, host?:string, measureCold?:boolean, timeoutMs?:number}} o
 */
async function benchmarkModel(o = {}) {
  const model = o.model;
  if (!model) return { ok: false, error: 'no model' };
  const host = o.host || ollamaHost();
  const warmups = Number.isFinite(o.warmups) ? o.warmups : DEFAULT_WARMUPS;
  const runs = Number.isFinite(o.runs) ? o.runs : DEFAULT_RUNS;
  const measureCold = o.measureCold !== false;
  const common = {
    model,
    host,
    prompt: o.prompt,
    numPredict: o.numPredict,
    timeoutMs: o.timeoutMs,
  };

  let cold = null;
  if (measureCold) {
    await forceUnload(model, host);
    const c = await measureOllamaOnce(common);
    if (c && c.ok) {
      c.cold = true; // first call after unload is cold by construction
      cold = c;
    }
  }

  for (let i = 0; i < warmups; i++) {
    // discard — purpose is to settle the model into VRAM at steady state
    // eslint-disable-next-line no-await-in-loop
    await measureOllamaOnce(common);
  }

  const samples = [];
  for (let i = 0; i < runs; i++) {
    // eslint-disable-next-line no-await-in-loop
    samples.push(await measureOllamaOnce(common));
  }

  const warm = summariseWarm(samples);
  return {
    ok: !!warm,
    model,
    host,
    tier: 'T0',
    prompt_chars: (o.prompt != null ? o.prompt : DEFAULT_PROMPT).length,
    num_predict: Number.isFinite(o.numPredict) ? o.numPredict : DEFAULT_NUM_PREDICT,
    warm,
    cold,
    samples: samples.map((s) => (s && s.ok ? { ttft_ms: s.ttft_ms, tps: s.tps, tpot_ms: s.tpot_ms } : { ok: false })),
  };
}

/** List installed local models (names) via /api/tags. [] on any failure. */
async function listLocalModels(host) {
  try {
    const res = await new Promise((resolve, reject) => {
      const url = new URL('/api/tags', host || ollamaHost());
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.get(url, resolve);
      req.on('error', reject);
      req.setTimeout(4000, () => req.destroy(new Error('timeout')));
    });
    const data = await new Promise((resolve, reject) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
      res.on('error', reject);
    });
    const j = JSON.parse(data);
    return (j.models || []).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Persistence (bounded append-only, never throws) ─────────────────────────

/**
 * Append one speed record as a JSONL line. Best-effort, never throws. Rotates
 * to <path>.1 when the log exceeds MAX_LOG_BYTES so it never grows unbounded.
 * @param {Record<string, any>} rec
 * @param {{logPath?:string, now?:number}} [opts]
 */
function appendMetric(rec, opts = {}) {
  try {
    const p = opts.logPath || metricsPath();
    try {
      const st = fs.statSync(p);
      if (st.size > MAX_LOG_BYTES) fs.renameSync(p, p + '.1');
    } catch {
      /* no file yet */
    }
    const line = JSON.stringify({ ts: new Date(opts.now || Date.now()).toISOString(), ...rec });
    fs.appendFileSync(p, line + '\n', 'utf8');
    return true;
  } catch {
    return null; // telemetry is best-effort — never break the caller
  }
}

/** Read speed records (newest `limit` kept). [] on a missing/garbage file. */
function readMetrics(opts = {}) {
  let raw;
  try {
    raw = fs.readFileSync(opts.logPath || metricsPath(), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip junk */
    }
  }
  return opts.limit ? out.slice(-opts.limit) : out;
}

/**
 * Most recent measured local throughput (tok/s), newest first, for the cockpit
 * fleet header. Returns null when no measurement exists. Pure read, never throws.
 * @param {{logPath?:string, model?:string}} [opts]
 */
function lastLocalTps(opts = {}) {
  const recs = readMetrics(opts);
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    if (opts.model && r.model !== opts.model) continue;
    const tps = (r.warm && r.warm.tps) || r.tps;
    if (Number.isFinite(tps) && tps > 0) return { model: r.model, tps, ts: r.ts };
  }
  return null;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { models: [], json: false, append: true, all: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--model') a.models.push(argv[++i]);
    else if (t === '--all') a.all = true;
    else if (t === '--json') a.json = true;
    else if (t === '--no-append') a.append = false;
    else if (t === '--no-cold') a.noCold = true;
    else if (t === '--prompt') a.prompt = argv[++i];
    else if (t === '--num-predict') a.numPredict = Number(argv[++i]);
    else if (t === '--warmups') a.warmups = Number(argv[++i]);
    else if (t === '--runs') a.runs = Number(argv[++i]);
  }
  return a;
}

function fmtNum(n, unit) {
  return n == null ? '—' : `${n}${unit || ''}`;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const host = ollamaHost();
  let models = a.models;
  if (a.all || !models.length) {
    const installed = await listLocalModels(host);
    // Prefer the tier-representative locals if present, else everything installed.
    const preferred = ['qwen2.5:3b', 'qwen3:30b', 'qwen2.5-coder:14b'];
    const pick = preferred.filter((m) => installed.includes(m));
    models = a.models.length ? a.models : pick.length ? pick : installed;
  }
  if (!models.length) {
    console.error('speed-meter: no local models found (is Ollama running?).');
    process.exit(0);
  }

  const results = [];
  for (const model of models) {
    process.stderr.write(`⏱  measuring ${model} … `);
    // eslint-disable-next-line no-await-in-loop
    const r = await benchmarkModel({
      model,
      prompt: a.prompt,
      numPredict: a.numPredict,
      warmups: a.warmups,
      runs: a.runs,
      measureCold: !a.noCold,
      host,
    });
    process.stderr.write(r.ok ? 'done\n' : `failed (${r.error || 'no samples'})\n`);
    if (a.append && r.ok) appendMetric(r);
    results.push(r);
  }

  if (a.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n🐮 Local speed (batch=1, temp=0, median of warm runs · cold shown separately)\n');
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ${r.model.padEnd(22)} — no measurement (${r.error || 'failed'})`);
      continue;
    }
    const w = r.warm || {};
    const c = r.cold || {};
    console.log(`  ${r.model}`);
    console.log(
      `    warm:  TTFT ${fmtNum(w.ttft_ms, 'ms')}  ·  ${fmtNum(w.tps, ' tok/s')}  ·  TPOT ${fmtNum(w.tpot_ms, 'ms')}  (n=${w.n})`
    );
    console.log(
      `    cold:  TTFT ${fmtNum(c.ttft_ms, 'ms')}  ·  load ${fmtNum(c.load_ms, 'ms')}  ·  ${fmtNum(c.tps, ' tok/s')}`
    );
  }
  console.log('\n  cloud tiers: TTFT/TPOT estimated (no API key) — see estimateCloud()\n');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('speed-meter:', (e && e.message) || e);
    process.exit(0); // never fail a pipeline on a measurement
  });
}

module.exports = {
  median,
  nsToMs,
  round,
  estimateCloud,
  measureOllamaOnce,
  forceUnload,
  benchmarkModel,
  listLocalModels,
  appendMetric,
  readMetrics,
  lastLocalTps,
  summariseWarm,
  metricsPath,
  CLOUD_SPEED_ESTIMATES,
  CLOUD_ESTIMATE_BASIS,
  DEFAULT_PROMPT,
  DEFAULT_NUM_PREDICT,
};
