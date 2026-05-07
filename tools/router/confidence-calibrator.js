#!/usr/bin/env node
// @ts-check
/**
 * confidence-calibrator.js — measure whether the classifier's confidence
 * scores are calibrated against ground-truth oracle outcomes.
 *
 * Why this exists: classify.js emits a `confidence` number in [0,1] for
 * every decision, but that number was never validated. confidence=0.9
 * was supposed to mean "90% chance the tier is right" — actual hit-rate
 * could be 50% or 99%, we had no way to tell. The arbiter fires when
 * confidence < 0.75; if the threshold is too loose, we waste Haiku
 * calls; too tight, we ship miscategorised prompts. Calibration data
 * is what turns that knob from a guess into a measurement.
 *
 * Approach: bucket classified events by confidence (10 buckets), run
 * the oracle on each oracle-eligible event (json_parse, regex_compile,
 * arithmetic), compute pass-rate per bucket. A perfectly calibrated
 * classifier produces a curve where bucket 0.8-0.9 has ~85% pass rate.
 *
 * Output: ~/.claude/tools/router/confidence-calibration.json containing
 * the curve plus a Brier-style score (mean squared deviation from
 * perfect calibration). Lower Brier = better calibrated.
 *
 * The runtime is NOT touched — calibration is diagnostic, not in the
 * critical path. A future commit can read the output to adjust the
 * arbiter threshold or to re-weight confidence in classify.js. For
 * Wave 2 P1 the goal is: make the calibration knob measurable.
 *
 * CLI:
 *   node confidence-calibrator.js                → human report + write JSON
 *   node confidence-calibrator.js --json         → JSON to stdout, no write
 *   node confidence-calibrator.js --no-write     → human report only
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { runOracle, ORACLE_CATEGORIES } = require('./ground-truth.js');

const ROUTER_DIR        = path.join(os.homedir(), '.claude', 'tools', 'router');
const DECISIONS_LOG     = path.join(ROUTER_DIR, 'decisions.log');
const CALIBRATION_PATH  = path.join(ROUTER_DIR, 'confidence-calibration.json');

const BUCKET_COUNT      = 10;
const BUCKET_SIZE       = 1 / BUCKET_COUNT;

// ── Pure helpers ──────────────────────────────────────────────────────

/**
 * Bucket index for a confidence value. Clamps to [0, BUCKET_COUNT-1] so
 * a stray 1.0 lands in the top bucket rather than overflowing.
 *
 * @param {number} c
 * @returns {number}
 */
function bucketIndex(c) {
  if (!Number.isFinite(c)) return 0;
  if (c >= 1) return BUCKET_COUNT - 1;
  if (c < 0) return 0;
  return Math.floor(c / BUCKET_SIZE);
}

function bucketLabel(i) {
  const lo = (i * BUCKET_SIZE).toFixed(1);
  const hi = ((i + 1) * BUCKET_SIZE).toFixed(1);
  return `${lo}–${hi}`;
}

/**
 * Compute the calibration curve from a set of classified events.
 *
 * Each oracle-eligible event with a finite confidence contributes one
 * sample to its bucket. Events without an oracle-eligible category, or
 * whose oracle returns `applicable: false`, are skipped (no signal).
 *
 * @param {Array<Record<string, any>>} events  classified events
 * @returns {{
 *   buckets: Array<{ index: number, label: string, count: number, passed: number, pass_rate: number | null }>,
 *   sampled: number,
 *   skipped_no_oracle: number,
 *   skipped_oracle_inapplicable: number,
 *   brier_score: number | null,
 * }}
 */
function calibrationCurve(events) {
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    index: i,
    label: bucketLabel(i),
    count: 0,
    passed: 0,
    pass_rate: /** @type {number | null} */ (null),
  }));
  let sampled = 0;
  let skippedNoOracle = 0;
  let skippedInapplicable = 0;
  let brierAccum = 0;
  let brierCount = 0;

  for (const e of events || []) {
    if (!e || e.event !== 'classified') continue;
    if (e.source === 'mooter-tester') continue;
    if (!e.task_category || !ORACLE_CATEGORIES[e.task_category]) {
      skippedNoOracle++;
      continue;
    }
    const conf = Number(e.confidence);
    if (!Number.isFinite(conf)) continue;
    const result = runOracle(e.task_category, e.prompt_preview || '');
    if (!result || !result.applicable) {
      skippedInapplicable++;
      continue;
    }
    const idx = bucketIndex(conf);
    buckets[idx].count++;
    if (result.passed) buckets[idx].passed++;
    sampled++;
    // Brier (binary): (predicted - observed)². 0 = perfect, 1 = worst.
    const observed = result.passed ? 1 : 0;
    brierAccum += (conf - observed) ** 2;
    brierCount++;
  }

  for (const b of buckets) {
    b.pass_rate = b.count > 0 ? b.passed / b.count : null;
  }
  const brier = brierCount > 0 ? brierAccum / brierCount : null;
  return {
    buckets,
    sampled,
    skipped_no_oracle: skippedNoOracle,
    skipped_oracle_inapplicable: skippedInapplicable,
    brier_score: brier,
  };
}

/**
 * Calibration error per bucket: |bucket midpoint − pass_rate|. A perfectly
 * calibrated bucket has error 0; a 0.8 bucket where 50% of prompts pass
 * has error 0.3. Buckets with no samples return null.
 *
 * @param {ReturnType<typeof calibrationCurve>['buckets'][number]} b
 * @returns {number | null}
 */
function bucketCalibrationError(b) {
  if (b.pass_rate === null) return null;
  const mid = (b.index + 0.5) * BUCKET_SIZE;
  return Math.abs(mid - b.pass_rate);
}

/**
 * Render the calibration curve as a small ASCII table — chooses the
 * single largest delta between bucket midpoint and pass rate so the
 * operator can see "where we lie hardest about confidence" at a glance.
 *
 * @param {ReturnType<typeof calibrationCurve>} curve
 */
function formatCalibration(curve) {
  const lines = [];
  lines.push('── Confidence calibration ─────────────────────────────────────');
  lines.push(`  Sampled: ${curve.sampled}   Skipped: ${curve.skipped_no_oracle} (no oracle), ${curve.skipped_oracle_inapplicable} (inapplicable)`);
  if (curve.brier_score !== null) {
    const verdict = curve.brier_score < 0.10 ? '✓ tight'
                  : curve.brier_score < 0.25 ? '⚠ loose'
                  : '✗ uncalibrated';
    lines.push(`  Brier score: ${curve.brier_score.toFixed(3)}  ${verdict}  (lower is better; 0 = perfect)`);
  } else {
    lines.push(`  Brier score: n/a (no oracle samples)`);
  }
  lines.push('');
  lines.push('  bucket     count   passed   pass_rate   |Δ from midpoint|');
  let worst = { idx: -1, err: -1 };
  for (const b of curve.buckets) {
    const err = bucketCalibrationError(b);
    if (err !== null && err > worst.err) { worst = { idx: b.index, err }; }
    const rate = b.pass_rate === null ? '   —  ' : `${(b.pass_rate * 100).toFixed(0).padStart(4)}% `;
    const dErr = err === null ? '  —  ' : (err * 100).toFixed(0).padStart(4) + ' pp';
    lines.push(`  ${b.label.padEnd(8)}   ${String(b.count).padStart(4)}     ${String(b.passed).padStart(4)}     ${rate}        ${dErr}`);
  }
  if (worst.idx >= 0) {
    lines.push('');
    lines.push(`  Worst bucket: ${bucketLabel(worst.idx)}  (Δ ${(worst.err * 100).toFixed(0)} pp from midpoint)`);
  }
  return lines.join('\n');
}

// ── I/O ───────────────────────────────────────────────────────────────

function readClassifiedEvents() {
  if (!fs.existsSync(DECISIONS_LOG)) return [];
  const raw = fs.readFileSync(DECISIONS_LOG, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e && e.event === 'classified') out.push(e);
    } catch { /* skip */ }
  }
  return out;
}

function writeCalibration(curve) {
  const data = {
    ...curve,
    refreshed_at: new Date().toISOString(),
    note: 'Diagnostic only — not consumed by the runtime in Wave 2 P1.',
  };
  if (!fs.existsSync(ROUTER_DIR)) fs.mkdirSync(ROUTER_DIR, { recursive: true });
  fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(data, null, 2) + '\n');
  return data;
}

// ── CLI ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const events = readClassifiedEvents();
  const curve  = calibrationCurve(events);

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(curve, null, 2) + '\n');
    return;
  }
  process.stdout.write(formatCalibration(curve) + '\n');
  if (!args.includes('--no-write') && curve.sampled > 0) {
    writeCalibration(curve);
    process.stdout.write(`\n  Written: ${CALIBRATION_PATH}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  // Pure helpers
  bucketIndex,
  bucketLabel,
  calibrationCurve,
  bucketCalibrationError,
  formatCalibration,
  // I/O — exported for tests that want to stub
  readClassifiedEvents,
  writeCalibration,
  // Constants
  BUCKET_COUNT,
  BUCKET_SIZE,
  CALIBRATION_PATH,
};
