#!/usr/bin/env node
/**
 * profile-refresh.js — periodic refresh of subscription + user profile.
 *
 * Re-runs detect-subscriptions.js + user-profile.js --rebuild only when
 * the staleness window elapsed (default 7d) and only commits the rebuild
 * to disk when the output JSON's content hash actually changed.
 *
 * Designed to be triggered by an OS scheduler (Windows Task Scheduler or
 * cron) — no hook coupling. Idempotent and quiet when nothing changes.
 *
 * Flags:
 *   --force         Refresh regardless of staleness window.
 *   --no-cron       Refresh only if invoked interactively (skips when
 *                   stdin is piped or attached to a CI runner).
 *   --max-age <d>   Override staleness window in days (default 7).
 *   --dry-run       Detect + rebuild in memory; don't write files.
 *
 * State file: ~/.claude/tools/router/.profile-refresh.json
 *   { last_run_at, last_hash, runs, last_skipped_reason }
 *
 * Wave-1.5 task #2.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const ROUTER_DIR = path.join(HOME, '.claude', 'tools', 'router');
const STATE_PATH = path.join(ROUTER_DIR, '.profile-refresh.json');
const PROFILE_PATH = path.join(ROUTER_DIR, 'user-profile.json');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const NO_CRON = args.has('--no-cron');
const DRY_RUN = args.has('--dry-run');
let maxAgeDays = 7;
const maxAgeIdx = process.argv.indexOf('--max-age');
if (maxAgeIdx > 0) {
  const v = parseFloat(process.argv[maxAgeIdx + 1]);
  if (Number.isFinite(v) && v > 0) maxAgeDays = v;
}
const MAX_AGE_MS = maxAgeDays * 24 * 60 * 60 * 1000;

function readJsonOrNull(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeStateAtomic(state) {
  if (DRY_RUN) return;
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, STATE_PATH);
}

function hashContent(obj) {
  // Hash a normalized projection — exclude volatile timestamps so we only
  // detect material change.
  const projection = { ...obj };
  delete projection.updated_at;
  delete projection.checked_at;
  if (projection.subscriptions) {
    const s = { ...projection.subscriptions };
    delete s.detected_at;
    projection.subscriptions = s;
  }
  if (projection.detected) {
    const d = { ...projection.detected };
    delete d.checked_at;
    projection.detected = d;
  }
  return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

function runNode(scriptRelPath, ...scriptArgs) {
  const r = spawnSync(process.execPath, [path.join(ROUTER_DIR, scriptRelPath), ...scriptArgs], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function shouldSkip(state) {
  if (FORCE) return null;
  if (NO_CRON && !process.stdin.isTTY) return 'no_cron_flag_with_non_tty';
  if (!state || !state.last_run_at) return null;
  const last = Date.parse(state.last_run_at);
  if (!Number.isFinite(last)) return null;
  const age = Date.now() - last;
  if (age < MAX_AGE_MS) {
    const days = (age / 86400_000).toFixed(2);
    return `last_run_${days}d_ago_below_${maxAgeDays}d_window`;
  }
  return null;
}

function main() {
  const state = readJsonOrNull(STATE_PATH) || { runs: 0 };
  const skip = shouldSkip(state);
  if (skip) {
    state.last_skipped_at = new Date().toISOString();
    state.last_skipped_reason = skip;
    writeStateAtomic(state);
    process.stdout.write(`profile-refresh: skipped (${skip})\n`);
    return;
  }

  const detectRes = DRY_RUN
    ? runNode('detect-subscriptions.js', '--dry-run')
    : runNode('detect-subscriptions.js');
  if (detectRes.status !== 0) {
    process.stderr.write(`profile-refresh: detect-subscriptions failed (status=${detectRes.status})\n`);
    process.stderr.write(detectRes.stderr);
    process.exit(1);
  }

  const rebuildRes = DRY_RUN ? { status: 0, stdout: '' } : runNode('user-profile.js', '--rebuild');
  if (rebuildRes.status !== 0) {
    process.stderr.write(`profile-refresh: user-profile rebuild failed (status=${rebuildRes.status})\n`);
    process.stderr.write(rebuildRes.stderr);
    process.exit(1);
  }

  const profile = readJsonOrNull(PROFILE_PATH);
  const newHash = profile ? hashContent(profile) : null;
  const changed = newHash && newHash !== (state.last_hash || null);

  state.runs = (state.runs || 0) + 1;
  state.last_run_at = new Date().toISOString();
  state.last_hash = newHash || state.last_hash || null;
  state.last_changed = !!changed;
  delete state.last_skipped_reason;
  writeStateAtomic(state);

  process.stdout.write(`profile-refresh: ${changed ? 'updated' : 'noop'} (runs=${state.runs}, hash=${(newHash || '').slice(0, 12)})\n`);
}

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`profile-refresh error: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

module.exports = { hashContent, shouldSkip };
