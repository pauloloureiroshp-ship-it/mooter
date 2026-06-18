#!/usr/bin/env node
/**
 * reasoning-effort-status.js — Wave 60.5 Block C (reasoning-effort axis chip).
 *
 * OPT-IN line-3 chip showing the reasoning-effort level the router emitted for the
 * latest prompt, e.g. `🧠 eff:high`. OFF unless `statusline_chips.reasoning_effort:
 * true` is set in ~/.mooter/preferences.json (or MOOTER_STATUSLINE_REASONING_EFFORT=1).
 * Default off ⇒ the statusline stays byte-identical (invariant 6).
 *
 * Source of truth: ~/.mooter/reasoning-effort.json, written by the inject_context
 * hook (Block B) with exactly the level it put in <reasoning-effort> — the
 * statusline runs as a separate process and cannot see that decision object, so it
 * reads the recorded value rather than re-deriving (which could diverge). When the
 * file is ABSENT, STALE (>6h), or malformed, the chip is silent ('') — never a
 * guessed level.
 *
 * reasoning-effort.json shape: { effort: 'none'|'low'|'medium'|'high', tier, ts }.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_MS = 6 * 60 * 60 * 1000; // 6h — older than this, the last level is stale
const LEVELS = new Set(['none', 'low', 'medium', 'high']);

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: default off unless statusline_chips.reasoning_effort === true (or env). */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_REASONING_EFFORT === '1') return true;
  return !!(p && p.statusline_chips && p.statusline_chips.reasoning_effort === true);
}

function statePath() {
  const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  return path.join(home, 'reasoning-effort.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Pure renderer (state injected) → chip string, or '' when there is nothing
 * honest to show. Stale or malformed state is silent, never a guess.
 */
function buildEffortChip(state, now = Date.now()) {
  if (!state || !LEVELS.has(state.effort)) return '';
  const ts = Number(state.ts);
  if (!Number.isFinite(ts) || now - ts > STALE_MS) return '';
  return `🧠 eff:${state.effort}`;
}

function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    return buildEffortChip(readState(), Date.now());
  } catch {
    return '';
  }
}

module.exports = { buildEffortChip, optedIn, readState, statusLine, STALE_MS };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
