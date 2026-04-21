#!/usr/bin/env node
/**
 * rotate-logs.js — size-based rotation for decisions.log and execution.log.
 *
 * Rationale (AUDIT-MOOTER-2026-04-19 F6.4): decisions.log grows unbounded,
 * 96% dominated by synthetic tester events. Left unchecked the file reaches
 * 100MB+, slowing every tracker cache rebuild and every statusline tail.
 * This script implements a pragmatic rotation: when a log exceeds the size
 * threshold, rename with timestamp and start fresh. The tracker picks up
 * the new (empty) file automatically via its mtime-based cache check.
 *
 * Usage:
 *   node rotate-logs.js               → rotate if > threshold (default 100MB)
 *   node rotate-logs.js --force       → rotate regardless of size
 *   node rotate-logs.js --dry-run     → show what would happen, no changes
 *   node rotate-logs.js --threshold=50MB
 *
 * Invocation: manually after /mooter-update, or wire into a weekly cron.
 * Idempotent: running twice produces two rotations (second is usually a noop
 * because fresh logs are tiny).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HOOKS_DIR  = path.join(os.homedir(), '.claude', 'hooks');

const TARGETS = [
  { path: path.join(ROUTER_DIR, 'decisions.log'), label: 'decisions' },
  { path: path.join(HOOKS_DIR,  'execution.log'), label: 'execution' },
];

function parseThreshold(s) {
  const m = String(s || '100MB').trim().match(/^(\d+)\s*([KMG]?)B?$/i);
  if (!m) return 100 * 1024 * 1024;
  const mult = { '': 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  return parseInt(m[1], 10) * (mult[m[2].toUpperCase()] || 1);
}

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' KB';
  return n + ' B';
}

function stampedName(origPath) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const dir  = path.dirname(origPath);
  const base = path.basename(origPath, '.log');
  return path.join(dir, `${base}-${ts}.log`);
}

function rotate(target, opts) {
  const { force, dryRun, threshold } = opts;
  let size = 0;
  try {
    size = fs.statSync(target.path).size;
  } catch {
    console.log(`[${target.label}] absent (${target.path}) — skipping`);
    return { rotated: false, reason: 'absent' };
  }

  if (!force && size < threshold) {
    console.log(`[${target.label}] ${fmtBytes(size)} — below threshold ${fmtBytes(threshold)}, skipping`);
    return { rotated: false, reason: 'below_threshold', size };
  }

  const dest = stampedName(target.path);
  if (dryRun) {
    console.log(`[${target.label}] DRY RUN — would rotate ${target.path} (${fmtBytes(size)}) → ${dest}`);
    return { rotated: false, reason: 'dry_run', size, dest };
  }

  try {
    fs.renameSync(target.path, dest);
    // Recreate empty so tailers / mtime watchers pick up immediately.
    fs.writeFileSync(target.path, '');
    console.log(`[${target.label}] rotated ${fmtBytes(size)} → ${path.basename(dest)}`);
    return { rotated: true, size, dest };
  } catch (err) {
    console.error(`[${target.label}] rotation failed: ${err.message}`);
    return { rotated: false, reason: 'error', error: err.message };
  }
}

function main() {
  const args = process.argv.slice(2);
  const force   = args.includes('--force');
  const dryRun  = args.includes('--dry-run');
  const thrArg  = args.find((a) => a.startsWith('--threshold='));
  const threshold = parseThreshold(thrArg ? thrArg.slice('--threshold='.length) : '100MB');

  console.log(`rotate-logs: threshold=${fmtBytes(threshold)} force=${force} dry-run=${dryRun}`);

  const results = TARGETS.map((t) => ({ target: t, result: rotate(t, { force, dryRun, threshold }) }));
  const rotated = results.filter((r) => r.result.rotated).length;
  console.log(`\nDone — ${rotated}/${results.length} rotated.`);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { rotate, parseThreshold, stampedName, TARGETS };
