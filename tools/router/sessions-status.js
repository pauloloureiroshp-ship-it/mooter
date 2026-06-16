#!/usr/bin/env node
/**
 * sessions-status.js — Wave 53 Phase A′ (Cross-Session Visibility).
 *
 * Opt-in line-3 chip showing the OTHER live Mooter sessions (sisters) running in
 * any worktree, e.g. `⇄ 2 sisters (wave52 4s · wave-mega 12s)`. Silent when no
 * sister is live. This is the read side of the existing worktree-conductor
 * heartbeat protocol — it does NOT introduce a new record type.
 *
 * Source of truth: packages/worktree-conductor writes one heartbeat JSON per
 * session under ~/.mooter/orchestration/heartbeats/<session-id>.json (sibling of
 * the locks/ dir read by conductor-status.js). We re-read that schema here in
 * zero-dep CommonJS (the statusline runtime cannot import the TS package), so the
 * field names below MUST track packages/worktree-conductor/src/types.ts:Heartbeat
 * and STALE_MS tracks heartbeat.ts:STALE_MS.
 *
 * Honesty (Doctrine V4 #5): the Heartbeat schema carries only
 * { session_id, terminal_name, worktree_path, branch, intent, last_heartbeat_ms,
 *   active_locks, pending_intents, pid } — there is NO model / tier / tokens /
 * savings field, so this chip never shows any of those for a sister. Only real
 * fields (branch / terminal name / age) are rendered.
 *
 * Self-exclusion: the current session id is passed in by statusline-multi.js
 * (buildLine3 → statusLine(selfSessionId)); falls back to $CLAUDE_SESSION_ID /
 * $MOOTER_SESSION_ID. Without it we cannot exclude self, so we render nothing
 * rather than mislabel our own session as a sister.
 *
 * Budget: one readdir + at most SISTER_CAP small readFileSyncs (well within the
 * ≤10ms render budget). `hidden_chips: ["sessions"]` drops it. Any failure → ''.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SISTER_CAP = 32;       // bound the work even if the heartbeats dir is huge
const STALE_MS = 30000;      // tracks worktree-conductor/src/heartbeat.ts:STALE_MS
const MAX_NAMED = 3;         // show up to N sisters by name, then `+K`
const NAME_MAX = 16;         // clamp a branch/terminal label length

function heartbeatsDir() {
  const home = process.env.MOOTER_HOME;
  return home
    ? path.join(home, 'orchestration', 'heartbeats')
    : path.join(os.homedir(), '.mooter', 'orchestration', 'heartbeats');
}

function prefs() {
  try {
    // Resolve the same way heartbeatsDir() does: an explicit MOOTER_HOME is the
    // base (its preferences live in <MOOTER_HOME>/.mooter/), else the real home.
    const home = process.env.MOOTER_HOME;
    const prefsPath = home
      ? path.join(home, '.mooter', 'preferences.json')
      : path.join(os.homedir(), '.mooter', 'preferences.json');
    return JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
  } catch {
    return {};
  }
}

/** A heartbeat is live when it is fresh (age within STALE_MS). */
function isLive(hb, now) {
  return !!hb && typeof hb.last_heartbeat_ms === 'number' && now - hb.last_heartbeat_ms <= STALE_MS;
}

/** Best label for a sister: branch, else terminal name, else worktree basename. */
function labelFor(hb) {
  const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  let name = clean(hb.branch) || clean(hb.terminal_name);
  if (!name || name === 'unknown') {
    const wp = clean(hb.worktree_path);
    name = wp ? path.basename(wp) : '';
  }
  if (!name) name = 'session';
  return name.length > NAME_MAX ? name.slice(0, NAME_MAX - 1) + '…' : name;
}

/** Compact age: `4s` under a minute, else `2m`. */
function ageStr(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}

/**
 * Pure renderer (heartbeats injected) → chip string ('' when no live sister).
 * Excludes self by session_id; excludes stale; sorts freshest first.
 */
function buildSessionsChip(heartbeats, { selfSessionId = null, now = Date.now() } = {}) {
  if (!selfSessionId) return ''; // cannot exclude self → stay silent rather than mislabel
  const sisters = (Array.isArray(heartbeats) ? heartbeats : [])
    .filter((hb) => hb && hb.session_id !== selfSessionId && isLive(hb, now))
    .sort((a, b) => b.last_heartbeat_ms - a.last_heartbeat_ms);
  if (sisters.length === 0) return '';
  const named = sisters
    .slice(0, MAX_NAMED)
    .map((hb) => `${labelFor(hb)} ${ageStr(now - hb.last_heartbeat_ms)}`);
  const extra = sisters.length - named.length;
  const noun = sisters.length === 1 ? 'sister' : 'sisters';
  const tail = extra > 0 ? ` · +${extra}` : '';
  return `⇄ ${sisters.length} ${noun} (${named.join(' · ')}${tail})`;
}

/** Read + parse the heartbeat files (best-effort, bounded). */
function readHeartbeats(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).slice(0, SISTER_CAP);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
    } catch {
      /* skip an unreadable/partial heartbeat — never break the chip */
    }
  }
  return out;
}

/** Resolve the current session id (statusline arg → env), or null. */
function resolveSelf(selfSessionId) {
  return selfSessionId || process.env.CLAUDE_SESSION_ID || process.env.MOOTER_SESSION_ID || null;
}

function statusLine(selfSessionId) {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('sessions')) return '';
    return buildSessionsChip(readHeartbeats(heartbeatsDir()), { selfSessionId: resolveSelf(selfSessionId), now: Date.now() });
  } catch {
    return '';
  }
}

module.exports = { buildSessionsChip, isLive, labelFor, ageStr, heartbeatsDir, statusLine };

if (require.main === module) {
  const out = statusLine(process.argv[2]);
  if (out) process.stdout.write(out + '\n');
}
