#!/usr/bin/env node
'use strict';
/**
 * cost-perf-tracker.js — Wave 58 (A.9): cost / performance journal.
 *
 * Two pure-ish functions over a JSONL journal at
 * `~/.mooter/cost-perf-log.jsonl` (one line per finished subagent / routed turn):
 *
 *   appendCostPerf(entry)            → best-effort append of one normalized row.
 *   reportCostPerf({last_days})      → per-category breakdown + Pareto insights +
 *                                      expected-vs-actual drift, over the window.
 *
 * Each row records the ROUTING INTENT next to the REALITY so we can measure drift:
 *   { ts, task_category, model_chosen,
 *     expected_cost, actual_cost,                 (USD; via priceTurn — never duped)
 *     expected_score, actual_score,               (0..1 quality; null when unknown)
 *     expected_duration_ms, actual_duration_ms,   (ms; null when unknown)
 *     agent_name }
 *
 * Anti-fabrication (Doctrine V4 #5): unknown numerics are stored as `null`, never a
 * guessed/remembered value. reportCostPerf surfaces them honestly (drift = null when
 * either side is absent) so a consumer renders an honest `?` rather than an invented
 * delta. USD cost is computed by REUSING priceTurn(modelKey, in, out) from pricing.js
 * — this module never embeds its own price table.
 *
 * Storage is append-only JSONL so a crash mid-write loses at most one line and never
 * corrupts prior rows. All writes are best-effort: a failure returns false and never
 * throws (the appender is called from the SubagentStop hook path).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let pricing;
try { pricing = require('./pricing.js'); } catch { pricing = null; }

function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/** Absolute path of the cost/perf JSONL journal. */
function logPath(home = mooterHome()) {
  return path.join(home, 'cost-perf-log.jsonl');
}

/** Finite number or null — never NaN, never a fabricated default. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Non-empty trimmed string or null. */
function str(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

/**
 * USD cost via the SINGLE pricing source. Returns null when we cannot price
 * honestly — i.e. NO token count is known. A model alone is NOT enough: pricing
 * a turn with zero tokens would fabricate a "$0 turn" that never happened. We
 * only compute once at least one of in/out tokens is a real number (then a free
 * local model legitimately prices to 0). Pricing module absent → null.
 * @param {string|null} modelKey
 * @param {number|null} tokensIn
 * @param {number|null} tokensOut
 */
function costFor(modelKey, tokensIn, tokensOut) {
  if (!pricing || typeof pricing.priceTurn !== 'function') return null;
  const ti = num(tokensIn);
  const to = num(tokensOut);
  if (ti == null && to == null) return null; // no usage known → honest unknown
  return pricing.priceTurn(modelKey, ti || 0, to || 0);
}

/**
 * Normalize a raw entry into the canonical row shape. Accepts either the final
 * numeric fields directly, OR token counts (`expected_tokens_in/out`,
 * `actual_tokens_in/out`) from which cost is derived via priceTurn. Unknown
 * values become null (honest).
 */
function normalize(entry, now = Date.now()) {
  const e = entry || {};
  const model = str(e.model_chosen) || str(e.model);

  let expectedCost = num(e.expected_cost);
  if (expectedCost == null) {
    expectedCost = costFor(model, e.expected_tokens_in, e.expected_tokens_out);
  }
  let actualCost = num(e.actual_cost);
  if (actualCost == null) {
    actualCost = costFor(model, e.actual_tokens_in, e.actual_tokens_out);
  }

  return {
    ts: str(e.ts) || new Date(now).toISOString(),
    task_category: str(e.task_category) || str(e.category) || 'unknown',
    model_chosen: model,
    expected_cost: expectedCost,
    actual_cost: actualCost,
    expected_score: num(e.expected_score),
    actual_score: num(e.actual_score),
    expected_duration_ms: num(e.expected_duration_ms),
    actual_duration_ms: num(e.actual_duration_ms),
    agent_name: str(e.agent_name) || str(e.agent),
  };
}

/**
 * Append one normalized row to the JSONL journal. Best-effort: returns true on
 * a successful write, false on any failure (never throws). Creates the home dir
 * if missing.
 * @returns {boolean}
 */
function appendCostPerf(entry, opts = {}) {
  try {
    const home = opts.home || mooterHome();
    const row = normalize(entry, opts.now);
    try { fs.mkdirSync(home, { recursive: true }); } catch { /* may already exist */ }
    fs.appendFileSync(logPath(home), JSON.stringify(row) + '\n');
    return true;
  } catch {
    return false;
  }
}

/** Parse the journal → array of rows within `last_days` of `now` (newest-inclusive). */
function readRows(opts = {}) {
  const home = opts.home || mooterHome();
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const lastDays = Number.isFinite(opts.last_days) ? opts.last_days : 30;
  const cutoff = lastDays > 0 ? now - lastDays * 86400000 : -Infinity;
  let raw;
  try { raw = fs.readFileSync(logPath(home), 'utf8'); }
  catch (erro) {
    if (erro && erro.code === 'ENOENT') return [];
    // readRows é contrato público consumido pelo relatório, snapshot e CLI;
    // manter a colecção evita quebrar esses chamadores, mas o zero deixa de ser
    // silencioso e passa a declarar o erro real em stderr.
    try { process.stderr.write(`cost-perf-tracker: journal n/d — ${(erro && erro.message) || erro}; [] significa falha de leitura, não zero turnos\n`); } catch { /* stderr fechado */ }
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row || typeof row !== 'object') continue;
    const t = row.ts ? Date.parse(row.ts) : NaN;
    if (Number.isFinite(t) && t < cutoff) continue; // outside window
    rows.push(row);
  }
  return rows;
}

/** Coerce a stored field to a number, treating null/undefined as missing (NaN).
 *  Plain `Number(null)` is 0, which would silently fabricate a metric. */
function toNum(v) {
  if (v == null || v === '') return NaN;
  return Number(v);
}

/** mean of the finite values; null when none are finite (honest — no zero-fill). */
function meanOrNull(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** sum of finite values; 0 when none (a sum of nothing is genuinely zero). */
function sumFinite(values) {
  return values.filter((v) => Number.isFinite(v)).reduce((a, b) => a + b, 0);
}

/** Drift = actual − expected, but only when BOTH means are known; else null. */
function drift(expectedMean, actualMean) {
  if (expectedMean == null || actualMean == null) return null;
  return actualMean - expectedMean;
}

/**
 * reportCostPerf({last_days}) → analytics over the window.
 *
 * {
 *   window_days, total, since,
 *   totals: { expected_cost, actual_cost, cost_drift },
 *   categories: [{ category, count, model_chosen,
 *                  expected_cost, actual_cost, cost_drift,
 *                  expected_score, actual_score, score_drift,
 *                  expected_duration_ms, actual_duration_ms, duration_drift }],
 *   pareto: { top_cost_category, top_cost_share, insight }
 * }
 *
 * All means are null when no row in the bucket carries that field (honest `?`).
 */
function reportCostPerf(opts = {}) {
  const lastDays = Number.isFinite(opts.last_days) ? opts.last_days : 30;
  const rows = readRows({ ...opts, last_days: lastDays });

  const byCat = new Map();
  for (const r of rows) {
    const cat = (typeof r.task_category === 'string' && r.task_category.trim()) || 'unknown';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(r);
  }

  const categories = [];
  for (const [category, group] of byCat) {
    const expCost = meanOrNull(group.map((r) => toNum(r.expected_cost)));
    const actCost = meanOrNull(group.map((r) => toNum(r.actual_cost)));
    const expScore = meanOrNull(group.map((r) => toNum(r.expected_score)));
    const actScore = meanOrNull(group.map((r) => toNum(r.actual_score)));
    const expDur = meanOrNull(group.map((r) => toNum(r.expected_duration_ms)));
    const actDur = meanOrNull(group.map((r) => toNum(r.actual_duration_ms)));
    // dominant model in the bucket (by frequency), for at-a-glance context
    const modelCounts = new Map();
    for (const r of group) {
      const m = typeof r.model_chosen === 'string' ? r.model_chosen : null;
      if (m) modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
    }
    let model = null; let best = -1;
    for (const [m, c] of modelCounts) { if (c > best) { best = c; model = m; } }

    categories.push({
      category,
      count: group.length,
      model_chosen: model,
      expected_cost: expCost,
      actual_cost: actCost,
      cost_drift: drift(expCost, actCost),
      expected_score: expScore,
      actual_score: actScore,
      score_drift: drift(expScore, actScore),
      expected_duration_ms: expDur,
      actual_duration_ms: actDur,
      duration_drift: drift(expDur, actDur),
      // total realized spend in the bucket (drives the Pareto ranking)
      _total_actual_cost: sumFinite(group.map((r) => Number(r.actual_cost))),
    });
  }

  // Pareto: which category eats the largest share of realized spend.
  const totalActual = sumFinite(categories.map((c) => c._total_actual_cost));
  let pareto = { top_cost_category: null, top_cost_share: null, insight: null };
  if (totalActual > 0) {
    const ranked = categories.slice().sort((a, b) => b._total_actual_cost - a._total_actual_cost);
    const top = ranked[0];
    const share = top._total_actual_cost / totalActual;
    pareto = {
      top_cost_category: top.category,
      top_cost_share: share,
      insight: `${top.category} drives ${(share * 100).toFixed(0)}% of realized spend (${top.count} of ${rows.length} turns)`,
    };
  }

  // strip the internal accumulator before returning
  const cleanCategories = categories
    .sort((a, b) => b._total_actual_cost - a._total_actual_cost)
    .map(({ _total_actual_cost, ...rest }) => rest);

  const totalExpected = sumFinite(rows.map((r) => Number(r.expected_cost)));
  const since = lastDays > 0
    ? new Date((Number.isFinite(opts.now) ? opts.now : Date.now()) - lastDays * 86400000).toISOString()
    : null;

  return {
    window_days: lastDays,
    since,
    total: rows.length,
    totals: {
      expected_cost: totalExpected,
      actual_cost: totalActual,
      cost_drift: rows.length ? totalActual - totalExpected : null,
    },
    categories: cleanCategories,
    pareto,
  };
}

module.exports = {
  appendCostPerf,
  reportCostPerf,
  normalize,
  costFor,
  readRows,
  logPath,
  mooterHome,
};

if (require.main === module) {
  const arg = process.argv[2];
  const days = Number(process.argv[3]) || 30;
  if (arg === 'report') {
    process.stdout.write(JSON.stringify(reportCostPerf({ last_days: days }), null, 2) + '\n');
  } else {
    process.stdout.write('usage: cost-perf-tracker.js report [last_days]\n');
  }
}
