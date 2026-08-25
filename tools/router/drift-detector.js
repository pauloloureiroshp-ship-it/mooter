#!/usr/bin/env node
// @ts-check
/**
 * drift-detector.js — surfaces routing drift in the operator's experience.
 *
 * Why this exists: the router auto-tunes via backtest.js + decisions.log
 * but a stale tuning-state.json or shifting user behaviour can degrade
 * routing silently for hours before anyone notices. This module compares
 * the recent tier distribution against a lifetime baseline and flags
 * deviations large enough to matter (≥10 pp on any tier).
 *
 * Surface: statusline-multi.js loads the baseline once per render and
 * calls detectDrift() against the events already digested. A drift
 * triggers a YELLOW state — one extra branch in pickState, no extra I/O.
 *
 * Baseline cadence:
 *   - refresh once when statusline notices the cache is missing,
 *   - or manually via `node drift-detector.js --refresh`,
 *   - or scheduled (weekly cron, paired with backtest).
 *
 * Pure helpers (tierDistribution / detectDrift) take arrays in and return
 * plain objects so they're trivial to unit-test without I/O. The I/O path
 * (loadBaseline / writeBaseline / readDecisionsTail) is intentionally
 * isolated at the bottom of the file.
 *
 * CLI:
 *   node drift-detector.js                → human-readable status report
 *   node drift-detector.js --refresh      → recompute baseline from log
 *   node drift-detector.js --check        → JSON {drift, severity, ...}
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROUTER_DIR     = path.join(os.homedir(), '.claude', 'tools', 'router');
const DECISIONS_LOG  = path.join(ROUTER_DIR, 'decisions.log');
const BASELINE_PATH  = path.join(ROUTER_DIR, '.tier-baseline.json');

const TIERS = ['T0', 'T1', 'T2', 'T3'];

// ── Tunable thresholds ────────────────────────────────────────────────
const RECENT_WINDOW         = 200;   // events used to compute "recent" mix
const BASELINE_MIN_EVENTS   = 50;    // below this the baseline is unreliable
const DRIFT_THRESHOLD_PCT   = 10;    // pp gap to call it drift
const DRIFT_SEVERE_PCT      = 20;    // pp gap to call it severe
const BASELINE_TAIL_BYTES   = 4 * 1024 * 1024; // 4MB tail = ~5-10k events
const RECENT_TAIL_BYTES     = 256 * 1024;

// ── Pure helpers (no I/O — unit-testable) ─────────────────────────────

/**
 * Tier distribution over a list of decision events. Returns a record with
 * one fraction per tier plus `_total`, or null when no usable events were
 * found. Non-classified rows and rows without a canonical tier are skipped.
 *
 * @param {Array<Record<string, any>>} events
 * @returns {{ T0: number, T1: number, T2: number, T3: number, _total: number } | null}
 */
function tierDistribution(events) {
  if (!Array.isArray(events) || !events.length) return null;
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  let total = 0;
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const t = e.tier;
    if (!TIERS.includes(t)) continue;
    counts[t]++;
    total++;
  }
  if (!total) return null;
  return {
    T0: counts.T0 / total,
    T1: counts.T1 / total,
    T2: counts.T2 / total,
    T3: counts.T3 / total,
    _total: total,
  };
}

/**
 * Compare a recent distribution against a baseline. Returns a verdict
 * object that statusline / cron / dashboard can render directly.
 *
 * Severity tiers:
 *   - drift=false       deltaPct < threshold (boring path, healthy)
 *   - severity='mild'   threshold ≤ deltaPct < severe
 *   - severity='severe' deltaPct ≥ severe (page the operator)
 *
 * @param {Record<string, number> | null} recent
 * @param {Record<string, number> | null} baseline
 * @returns {{
 *   drift: boolean,
 *   tier?: string,
 *   actual?: number,
 *   expected?: number,
 *   deltaPct?: number,
 *   severity?: 'mild' | 'severe',
 *   reason?: string,
 * }}
 */
function detectDrift(recent, baseline) {
  if (!recent || !baseline) {
    return { drift: false, reason: 'insufficient_data' };
  }
  if (typeof baseline._total === 'number' && baseline._total < BASELINE_MIN_EVENTS) {
    return { drift: false, reason: 'baseline_too_small' };
  }
  let maxDelta = 0;
  let driftTier = null;
  for (const t of TIERS) {
    const delta = Math.abs((recent[t] || 0) - (baseline[t] || 0));
    if (delta > maxDelta) {
      maxDelta = delta;
      driftTier = t;
    }
  }
  const deltaPct = Math.round(maxDelta * 100);
  if (deltaPct < DRIFT_THRESHOLD_PCT) {
    return { drift: false, deltaPct };
  }
  return {
    drift: true,
    tier: driftTier || 'T?',
    actual: Math.round((recent[driftTier || 'T0'] || 0) * 100),
    expected: Math.round((baseline[driftTier || 'T0'] || 0) * 100),
    deltaPct,
    severity: deltaPct >= DRIFT_SEVERE_PCT ? 'severe' : 'mild',
  };
}

// ── I/O layer ─────────────────────────────────────────────────────────

/**
 * Tail-read the last `bytes` of decisions.log. Returns an array of parsed
 * objects (skipping malformed lines and non-classified events).
 *
 * @param {number} bytes
 * @returns {Array<Record<string, any>>}
 */
function readClassifiedTail(bytes) {
  if (!fs.existsSync(DECISIONS_LOG)) return [];
  let buf;
  try {
    const stat = fs.statSync(DECISIONS_LOG);
    const start = Math.max(0, stat.size - bytes);
    const fd = fs.openSync(DECISIONS_LOG, 'r');
    try {
      const slice = Buffer.alloc(stat.size - start);
      fs.readSync(fd, slice, 0, slice.length, start);
      buf = slice.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return [];
    // Log ilegível e log sem eventos davam ambos uma distribuição vazia, que o
    // veredicto podia transformar em "sem drift". O chamador recebe n/d.
    try { process.stderr.write(`drift-detector: decisions.log n/d — ${(erro && erro.message) || erro}\n`); } catch { /* stderr fechado */ }
    return null;
  }
  // Drop the first (likely partial) line so we never half-parse JSON.
  const lines = buf.split('\n').slice(1).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e && e.event === 'classified' && e.source !== 'mooter-tester') {
        out.push(e);
      }
    } catch { /* skip */ }
  }
  return out;
}

/**
 * Load the persisted baseline. Returns null if missing or malformed —
 * caller decides whether to refresh or skip drift detection.
 */
function loadBaseline() {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && TIERS.every((t) => typeof j[t] === 'number')) {
      return j;
    }
    return null;
  } catch { return null; }
}

function writeBaseline(distribution, sourceCount) {
  const data = {
    ...distribution,
    refreshed_at: new Date().toISOString(),
    source_event_count: sourceCount,
  };
  if (!fs.existsSync(ROUTER_DIR)) fs.mkdirSync(ROUTER_DIR, { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n');
  return data;
}

function refreshBaseline() {
  const events = readClassifiedTail(BASELINE_TAIL_BYTES);
  if (events === null) return { ok: false, reason: 'decisions_log_unreadable' };
  const dist = tierDistribution(events);
  if (!dist) {
    return { ok: false, reason: 'no_classified_events_found' };
  }
  const written = writeBaseline(dist, dist._total);
  return { ok: true, baseline: written, source_event_count: dist._total };
}

/**
 * Top-level: returns a verdict object for the current state. Reads
 * baseline + recent events from disk. Statusline-multi's render path
 * can use this directly.
 */
function checkDrift() {
  const baseline = loadBaseline();
  if (!baseline) {
    return { drift: false, reason: 'no_baseline' };
  }
  const lidos = readClassifiedTail(RECENT_TAIL_BYTES);
  if (lidos === null) return { drift: null, reason: 'decisions_log_unreadable' };
  const recentEvents = lidos.slice(-RECENT_WINDOW);
  const recent = tierDistribution(recentEvents);
  return detectDrift(recent, baseline);
}

// ── CLI ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--refresh')) {
    const r = refreshBaseline();
    if (!r.ok) {
      process.stderr.write(`drift-detector: refresh failed — ${r.reason}\n`);
      process.exit(1);
    }
    const b = r.baseline;
    process.stdout.write(
      `Baseline refreshed (${r.source_event_count} events):\n` +
      `  T0: ${(b.T0 * 100).toFixed(1)}%   T1: ${(b.T1 * 100).toFixed(1)}%\n` +
      `  T2: ${(b.T2 * 100).toFixed(1)}%   T3: ${(b.T3 * 100).toFixed(1)}%\n`
    );
    return;
  }
  const verdict = checkDrift();
  if (verdict.reason === 'decisions_log_unreadable') {
    process.stderr.write('drift-detector: n/d — decisions.log ilegível\n');
    process.exitCode = 1;
    return;
  }
  if (args.includes('--check')) {
    process.stdout.write(JSON.stringify(verdict) + '\n');
    return;
  }
  if (verdict.drift) {
    process.stdout.write(
      `⚠ DRIFT (${verdict.severity}): ${verdict.tier} ` +
      `${verdict.actual}% recent vs ${verdict.expected}% baseline ` +
      `(Δ ${verdict.deltaPct} pp)\n`
    );
    process.exit(2);
  }
  if (verdict.reason === 'no_baseline') {
    process.stdout.write('no baseline — run `node drift-detector.js --refresh`\n');
    return;
  }
  process.stdout.write(`✓ no drift (Δ ${verdict.deltaPct ?? 0} pp)\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  // Pure helpers
  tierDistribution,
  detectDrift,
  // I/O — exported for tests that want to stub
  readClassifiedTail,
  loadBaseline,
  writeBaseline,
  refreshBaseline,
  checkDrift,
  // Constants
  TIERS,
  RECENT_WINDOW,
  BASELINE_MIN_EVENTS,
  DRIFT_THRESHOLD_PCT,
  DRIFT_SEVERE_PCT,
  BASELINE_PATH,
};
