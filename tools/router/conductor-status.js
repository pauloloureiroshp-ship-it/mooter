#!/usr/bin/env node
/**
 * conductor-status.js — Wave 33.6 Block P3.
 *
 * Opt-in line-3 chip showing how many worktree-conductor locks are currently held
 * across terminals, e.g. `🔒 conductor: 2 locks` (or `🔒 conductor: 1 lock (wave33_6)`
 * when a single holder is named). Silent when no live locks are held.
 *
 * The conductor (packages/worktree-conductor, Wave 33.5 Block H) writes one JSON
 * lock file per resource under ~/.mooter/orchestration/locks/*.lock. We re-read
 * that schema here in zero-dep CommonJS (the statusline runtime cannot import the
 * TS package). Stale locks — whose TTL has elapsed and whose holder never
 * released — are excluded so a dead terminal never inflates the count.
 *
 * Budget: one readdir + at most LOCK_CAP small readFileSyncs (well within the
 * ≤10ms render budget). `hidden_chips: ["conductor"]` drops it. Any failure → ''.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_CAP = 32; // bound the work even if the locks dir is somehow huge

function locksDir() {
  const home = process.env.MOOTER_HOME;
  return home
    ? path.join(home, 'orchestration', 'locks')
    : path.join(os.homedir(), '.mooter', 'orchestration', 'locks');
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** A lock is live when its TTL has not elapsed (matches conductor's isStale). */
function isLive(lock, now) {
  if (!lock || typeof lock.acquired_at_ms !== 'number' || typeof lock.ttl_seconds !== 'number') return false;
  return now <= lock.acquired_at_ms + lock.ttl_seconds * 1000;
}

/** Pure renderer (locks injected) → chip string ('' when no live locks). */
function buildConductorChip(locks, now) {
  const live = (Array.isArray(locks) ? locks : []).filter((l) => isLive(l, now));
  if (live.length === 0) return '';
  if (live.length === 1) {
    const name = typeof live[0].terminal_name === 'string' ? live[0].terminal_name.trim() : '';
    return name && name !== 'unknown' ? `🔒 conductor: 1 lock (${name})` : '🔒 conductor: 1 lock';
  }
  return `🔒 conductor: ${live.length} locks`;
}

/** Read + parse the lock files (best-effort, bounded). */
function readLocks(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.lock')).slice(0, LOCK_CAP);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
    } catch {
      /* skip an unreadable/partial lock — never break the chip */
    }
  }
  return out;
}

function statusLine() {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('conductor')) return '';
    return buildConductorChip(readLocks(locksDir()), Date.now());
  } catch {
    return '';
  }
}

module.exports = { buildConductorChip, isLive, locksDir, statusLine };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
