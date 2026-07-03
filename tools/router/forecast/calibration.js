#!/usr/bin/env node
// calibration.js — DC-16: the forecast keeps score of itself.
//
// "Learns forever" is faith until you MEASURE it. So every emitted forecast is
// recorded; when a wave closes, we log whether the real duration fell inside the
// P50/P90 we PUBLISHED. From those closed records we compute:
//   • empirical coverage   — "78% of your P90s actually held" (vs the nominal 90%).
//   • auto-widen factor     — if reals overshoot the P90 more than nominal, the
//                             P90 is too tight → widen it (DC-16). Coverage < nominal
//                             ⇒ factor > 1. Never narrows below 1.
//   • reliability score     — a 0..1 trust number the UI can show, damped by n.
//
// The ledger is append-only JSONL. Pure reducers over an entries array; thin fs
// wrappers that never throw.

'use strict';

const fs = require('fs');
const path = require('path');

const NOMINAL_P90 = 0.90;
const NOMINAL_P50 = 0.50;
const MIN_CLOSED_FOR_WIDEN = 5; // don't widen on thin evidence

function _file() {
  if (process.env.MOOTER_FORECAST_DIR && process.env.MOOTER_FORECAST_DIR.length > 0) {
    return path.join(process.env.MOOTER_FORECAST_DIR, 'calibration.jsonl');
  }
  if (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0) {
    return path.join(process.env.MOOTER_HOME, 'forecast', 'calibration.jsonl');
  }
  return path.resolve(__dirname, '.calibration.jsonl');
}

function _percentile(values, p) {
  const a = values.map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return null;
  if (n === 1) return a[0];
  const idx = Math.min(1, Math.max(0, p)) * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

// --- fs I/O (never throws) --------------------------------------------------
function readEntries() {
  try {
    return fs.readFileSync(_file(), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function _append(rec) {
  try {
    const file = _file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(rec) + '\n');
    return true;
  } catch { return false; }
}

// Record a forecast at emit time. Requires a stable forecast_id (scope_hash +
// wave). ts must be passed in (callers stamp it; keeps this clock-free/testable).
function recordForecast(rec) {
  const r = rec || {};
  if (!r.wave_id || !r.forecast_id) return false;
  return _append({
    kind: 'forecast',
    ts: r.ts || null,
    forecast_id: String(r.forecast_id),
    wave_id: String(r.wave_id),
    class: r.class || null,
    mode: r.mode || null,
    scope_hash: r.scope_hash || null,
    p50_work: r.p50_work != null ? r.p50_work : null,
    p90_work: r.p90_work != null ? r.p90_work : null,
    p50_wall: r.p50_wall != null ? r.p50_wall : null,
    p90_wall: r.p90_wall != null ? r.p90_wall : null,
  });
}

// PURE: locate the forecast a close refers to (latest matching forecast_id, or
// latest for the wave_id if no id given), among entries.
function _findForecast(entries, { forecast_id, wave_id }) {
  let found = null;
  for (const e of entries) {
    if (e.kind !== 'forecast') continue;
    if (forecast_id && e.forecast_id === forecast_id) found = e;
    else if (!forecast_id && wave_id && e.wave_id === wave_id) found = e;
  }
  return found;
}

// PURE: build the "closed" record from a forecast + observed actuals.
function buildClosed(forecast, actual) {
  const a = actual || {};
  const inBand = (val, p50, p90) => {
    const out = { in_p50: null, in_p90: null };
    if (val == null) return out;
    if (p50 != null) out.in_p50 = val <= p50;
    if (p90 != null) out.in_p90 = val <= p90;
    return out;
  };
  const wall = inBand(a.actual_wall_ms, forecast && forecast.p50_wall, forecast && forecast.p90_wall);
  const work = inBand(a.actual_work_ms, forecast && forecast.p50_work, forecast && forecast.p90_work);
  return {
    kind: 'closed',
    ts: a.ts || null,
    forecast_id: (forecast && forecast.forecast_id) || a.forecast_id || null,
    wave_id: (forecast && forecast.wave_id) || a.wave_id || null,
    class: (forecast && forecast.class) || null,
    actual_wall_ms: a.actual_wall_ms != null ? a.actual_wall_ms : null,
    actual_work_ms: a.actual_work_ms != null ? a.actual_work_ms : null,
    pred_p90_wall: (forecast && forecast.p90_wall) != null ? forecast.p90_wall : null,
    pred_p90_work: (forecast && forecast.p90_work) != null ? forecast.p90_work : null,
    in_p50_wall: wall.in_p50, in_p90_wall: wall.in_p90,
    in_p50_work: work.in_p50, in_p90_work: work.in_p90,
  };
}

// Close a wave: read the ledger, match the forecast, append the closed record.
function closeWave(actual) {
  const entries = readEntries();
  const fc = _findForecast(entries, { forecast_id: actual && actual.forecast_id, wave_id: actual && actual.wave_id });
  const rec = buildClosed(fc, actual);
  _append(rec);
  return rec;
}

// PURE: empirical coverage over closed entries (optionally filtered by class).
// Uses the wall clock (the number the human feels). n = closed count.
function coverage(entries, opts) {
  const cls = opts && opts.class;
  const closed = (entries || []).filter((e) => e.kind === 'closed' && (!cls || e.class === cls));
  const p50s = closed.map((e) => e.in_p50_wall).filter((v) => v === true || v === false);
  const p90s = closed.map((e) => e.in_p90_wall).filter((v) => v === true || v === false);
  const frac = (arr) => (arr.length ? arr.filter(Boolean).length / arr.length : null);
  return { n: closed.length, p50_coverage: frac(p50s), p90_coverage: frac(p90s) };
}

// PURE: auto-widen factor for a class. If reals overshoot the published P90 more
// often than nominal, widen so the P90 would actually cover NOMINAL_P90 of them.
// factor = max(1, 90th-percentile of (actual_wall / pred_p90_wall)). Needs
// ≥ MIN_CLOSED_FOR_WIDEN closed points, else 1 (insufficient evidence).
function autoWidenFactor(entries, cls) {
  const closed = (entries || []).filter((e) => e.kind === 'closed' && (!cls || e.class === cls)
    && Number.isFinite(e.actual_wall_ms) && Number.isFinite(e.pred_p90_wall) && e.pred_p90_wall > 0);
  if (closed.length < MIN_CLOSED_FOR_WIDEN) return 1;
  const ratios = closed.map((e) => e.actual_wall_ms / e.pred_p90_wall);
  const r90 = _percentile(ratios, NOMINAL_P90);
  return Math.max(1, r90 || 1);
}

// PURE: reliability score for a class in [0,1]. Anchored on P90 coverage,
// damped toward 0.5 when the closed sample is small (Wilson-ish shrink).
function reliability(entries, cls) {
  const cov = coverage(entries, { class: cls });
  const n = cov.n;
  if (n === 0 || cov.p90_coverage == null) return { score: null, p90_coverage: null, p50_coverage: null, n_closed: 0 };
  // Shrink toward the nominal target as n→0 so a single lucky hit isn't "100%".
  const shrink = n / (n + 4);
  const score = shrink * cov.p90_coverage + (1 - shrink) * NOMINAL_P90;
  return {
    score: Math.max(0, Math.min(1, score)),
    p90_coverage: cov.p90_coverage,
    p50_coverage: cov.p50_coverage,
    n_closed: n,
  };
}

module.exports = {
  recordForecast, closeWave, buildClosed, coverage, autoWidenFactor, reliability,
  readEntries, _findForecast,
  NOMINAL_P90, NOMINAL_P50, MIN_CLOSED_FOR_WIDEN,
};
