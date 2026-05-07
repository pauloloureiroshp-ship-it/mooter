#!/usr/bin/env node
/**
 * hub-events-scheduler.js — incremental event push to the mooter hub.
 *
 * Triggers when the number of newly classified events in decisions.log
 * since the last successful push reaches a threshold (default 50). Runs
 * `backtest.js --export-events` then `hub-submit-events.js`. State and
 * locking persisted in ~/.claude/tools/router/.last-events-push.json.
 *
 * Bearer token is sourced from ~/.frugal/auth.token (frugal-login.js).
 *
 * Flags:
 *   --threshold <n>   Override new-events threshold (default 50).
 *   --force           Trigger even if threshold not reached.
 *   --dry-run         Print what would happen, don't push.
 *
 * Designed for OS-scheduler invocation (Windows Task Scheduler / cron).
 * Idempotent and quiet when nothing to do.
 *
 * Wave-1.5 task #4.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const ROUTER_DIR = path.join(HOME, '.claude', 'tools', 'router');
const STATE_PATH = path.join(ROUTER_DIR, '.last-events-push.json');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const TOKEN_PATH = path.join(HOME, '.frugal', 'auth.token');
const EXPORT_PATH = path.join(ROUTER_DIR, 'events-export.json');
// Sibling scripts live next to this file regardless of where the runtime
// state directory is. This keeps the scheduler functional even when the
// runtime mirror is incomplete (a recurring drift mode flagged by Wave-1.5).
const SCHEDULER_DIR = __dirname;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
let threshold = 50;
const tIdx = args.indexOf('--threshold');
if (tIdx >= 0) {
  const v = parseInt(args[tIdx + 1], 10);
  if (Number.isFinite(v) && v > 0) threshold = v;
}

function readJsonOrNull(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readToken() {
  try {
    const t = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    return t.length > 20 ? t : null;
  } catch { return null; }
}

function countClassified() {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    let n = 0;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      // Cheap branch: only fully-parse lines that mention classified.
      if (line.indexOf('"classified"') < 0) continue;
      try {
        const e = JSON.parse(line);
        if (e && e.event === 'classified') n++;
      } catch { /* skip malformed */ }
    }
    return n;
  } catch { return 0; }
}

function writeStateAtomic(state) {
  if (DRY_RUN) return;
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, STATE_PATH);
}

function isLockStale(state) {
  if (!state || !state.lock) return false;
  const { pid, started_at } = state.lock;
  // Stale if started > 10 min ago, regardless of PID liveness check.
  if (!started_at) return true;
  const age = Date.now() - Date.parse(started_at);
  if (Number.isFinite(age) && age > 10 * 60 * 1000) return true;
  // PID check: if our own process or non-existent, lock is stale.
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return false; // alive — honor the lock
  } catch { return true; } // ESRCH → dead
}

function acquireLock(state) {
  state.lock = { pid: process.pid, started_at: new Date().toISOString() };
  writeStateAtomic(state);
}

function releaseLock(state) {
  delete state.lock;
  writeStateAtomic(state);
}

function runNode(script, ...scriptArgs) {
  const r = spawnSync(process.execPath, [path.join(SCHEDULER_DIR, script), ...scriptArgs], {
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function main() {
  const state = readJsonOrNull(STATE_PATH) || { runs: 0, last_pushed_classified: 0, last_pushed_at: null };
  if (state.lock && !isLockStale(state)) {
    process.stdout.write(`hub-events-scheduler: lock held by pid=${state.lock.pid}, skipping\n`);
    return;
  }

  const total = countClassified();
  const lastBaseline = state.last_pushed_classified || 0;
  const delta = Math.max(0, total - lastBaseline);
  if (!FORCE && delta < threshold) {
    state.last_check_at = new Date().toISOString();
    state.last_skip_delta = delta;
    state.last_skip_threshold = threshold;
    writeStateAtomic(state);
    process.stdout.write(`hub-events-scheduler: skip (delta=${delta} < threshold=${threshold})\n`);
    return;
  }

  const token = readToken();
  if (!token) {
    process.stderr.write('hub-events-scheduler: no auth token at ~/.frugal/auth.token — run `node frugal-login.js`\n');
    process.exit(2);
  }

  if (DRY_RUN) {
    process.stdout.write(`hub-events-scheduler: would push delta=${delta} events (threshold=${threshold})\n`);
    return;
  }

  acquireLock(state);
  try {
    const exportRes = runNode('backtest.js', '--export-events', EXPORT_PATH);
    if (exportRes.status !== 0) {
      state.last_error = { stage: 'export', stderr: exportRes.stderr.slice(0, 500), at: new Date().toISOString() };
      releaseLock(state);
      process.stderr.write(`hub-events-scheduler: export failed (status=${exportRes.status})\n`);
      process.stderr.write(exportRes.stderr);
      process.exit(1);
    }

    const submitEnv = { ...process.env, FRUGAL_SUBMIT_TOKEN: token };
    const r = spawnSync(process.execPath, [path.join(SCHEDULER_DIR, 'hub-submit-events.js'), EXPORT_PATH], {
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
      env: submitEnv,
    });
    if (r.status !== 0) {
      state.last_error = { stage: 'submit', stderr: (r.stderr || '').slice(0, 500), at: new Date().toISOString() };
      releaseLock(state);
      process.stderr.write(`hub-events-scheduler: submit failed (status=${r.status})\n`);
      process.stderr.write(r.stderr || '');
      process.exit(1);
    }

    state.runs = (state.runs || 0) + 1;
    state.last_pushed_classified = total;
    state.last_pushed_at = new Date().toISOString();
    state.last_pushed_delta = delta;
    delete state.last_error;
    releaseLock(state);
    process.stdout.write(`hub-events-scheduler: pushed delta=${delta} (total=${total}, runs=${state.runs})\n`);
  } catch (e) {
    state.last_error = { stage: 'unexpected', message: String(e && e.message || e), at: new Date().toISOString() };
    releaseLock(state);
    throw e;
  }
}

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`hub-events-scheduler error: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

module.exports = { countClassified, isLockStale };
