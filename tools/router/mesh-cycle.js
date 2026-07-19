#!/usr/bin/env node
'use strict';

// Harmony Mesh Phase A coordinator. Order is load-bearing:
// orphan-watch -> pointer-sentinel -> projection-drift -> brief-keeper.
// All checkers are read-only except brief-keeper; the coordinator writes only
// through the existing Fleet ledger callback.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkOrphans } = require('./orphan-watch');
const { checkPointers } = require('./pointer-sentinel');
const { checkProjectionDrift } = require('./projection-drift');
const { keepBriefs } = require('./brief-keeper');

const DAY_MS = 24 * 60 * 60 * 1000;
const lastRunAt = new Map();

function preferencesPath(opts = {}) {
  const home = opts.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  return path.join(home, 'preferences.json');
}

function parsePauseUntil(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEffort(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[-_\s]/g, '');
  if (raw === 'lazy' || raw === 'lazymoo') return 'lazy';
  if (raw === 'moo') return 'moo';
  if (raw === 'crazy' || raw === 'crazymoo') return 'crazy';
  return null;
}

function readFleetCycleGate(opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const file = opts.preferencesFile || preferencesPath(opts);
  let prefs = opts.preferences;
  let readError = null;
  if (prefs === undefined) {
    try { prefs = JSON.parse((opts.readFile || fs.readFileSync)(file, 'utf8')); }
    catch (error) { prefs = {}; readError = error.message; }
  }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  const configured = normalizeEffort(prefs.gpu_effort);
  const effort = configured || 'lazy';
  const pauseUntilMs = parsePauseUntil(prefs.pause_until);
  const paused = pauseUntilMs !== null && pauseUntilMs > nowMs;
  const invalidPause = prefs.pause_until != null && prefs.pause_until !== '' && pauseUntilMs === null;
  const effectiveEffort = paused ? 'paused' : effort;
  return {
    configured_effort: configured,
    effective_effort: effectiveEffort,
    defaulted: configured === null,
    paused,
    pause_until: pauseUntilMs === null ? null : new Date(pauseUntilMs).toISOString(),
    allow_l0: true,
    allow_l1: !paused && (effort === 'moo' || effort === 'crazy'),
    allow_l2: !paused && effort === 'crazy',
    allow_fleet_generation: !paused && effort !== 'lazy',
    reason: paused
      ? `pause_until active until ${new Date(pauseUntilMs).toISOString()}`
      : (effort === 'lazy' ? 'LazyMoo permits L0 only' : `${effort} permits fleet generation`),
    preferences_file: file,
    read_error: readError,
    invalid_pause_until: invalidPause,
  };
}

function compactResult(result) {
  return {
    event: 'mesh_check',
    checker: result.checker,
    layer: result.layer,
    ok: !!result.ok,
    findings: Array.isArray(result.findings) ? result.findings.length : 0,
    errors: Array.isArray(result.errors) ? result.errors.length : 0,
    detail: result.doctor && result.doctor.detail ? result.doctor.detail : null,
  };
}

function runMeshCycle(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const interval = Number.isFinite(opts.intervalMs) ? opts.intervalMs : Number(process.env.MOOTER_MESH_INTERVAL_MS) || DAY_MS;
  const previous = lastRunAt.get(root);
  if (!opts.force && previous !== undefined && nowMs - previous < interval) {
    return { ok: true, skipped: true, reason: 'cadence', next_at: new Date(previous + interval).toISOString(), results: [] };
  }
  lastRunAt.set(root, nowMs);
  const emit = typeof opts.emit === 'function' ? opts.emit : () => {};
  const ordered = [
    ['orphan-watch', opts.orphanWatch || checkOrphans, { root, nowMs, thresholdHours: opts.thresholdHours }],
    ['pointer-sentinel', opts.pointerSentinel || checkPointers, { root }],
    ['projection-drift', opts.projectionDrift || checkProjectionDrift, { root }],
    ['brief-keeper', opts.briefKeeper || keepBriefs, { root, dryRun: !!opts.dryRunBriefs }],
  ];
  const results = [];
  for (const [checker, run, input] of ordered) {
    let result;
    try { result = run({ ...input, ...(opts.checkerOptions && opts.checkerOptions[checker]) }); }
    catch (error) {
      result = { checker, layer: 'L0', ok: false, findings: [], errors: [{ error: error.message }] };
    }
    results.push(result);
    try { emit(compactResult(result)); } catch { /* existing ledger is fail-soft */ }
  }
  const ok = results.every((result) => result.ok);
  try { emit({ event: 'mesh_cycle', layer: 'L0', ok, order: ordered.map(([name]) => name), checks: results.length }); } catch {}
  return { ok, skipped: false, order: ordered.map(([name]) => name), results };
}

module.exports = {
  DAY_MS,
  preferencesPath,
  parsePauseUntil,
  normalizeEffort,
  readFleetCycleGate,
  compactResult,
  runMeshCycle,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith('--')) || process.cwd();
  const result = runMeshCycle({ root, force: true, dryRunBriefs: args.includes('--dry-run') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
