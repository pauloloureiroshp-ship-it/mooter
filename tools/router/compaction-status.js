#!/usr/bin/env node
'use strict';

// compaction-status.js — Wave 64 Fase 1. Opt-IN `🪶` chip surfacing the advisor's
// last decision for THIS session. Self-gating: returns '' unless opted in
// (statusline_chips.compaction === true OR MOOTER_STATUSLINE_COMPACTION=1) AND the
// advisor's last decision was ADVISE_NOW / PREP_SNAPSHOT. Default OFF ⇒ statusline
// byte-identical. Reuses compaction-advisor's readState (single state source).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readState } = require('./compaction-advisor.js');

function prefs() {
  try {
    const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
    return JSON.parse(fs.readFileSync(path.join(home, 'preferences.json'), 'utf8'));
  } catch { return {}; }
}

/** Opt-IN: env wins, then prefs.statusline_chips.compaction. Default off. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_COMPACTION === '1') return true;
  if (process.env.MOOTER_STATUSLINE_COMPACTION === '0') return false;
  return !!(p && p.statusline_chips && p.statusline_chips.compaction === true);
}

/** Pure renderer (state injected) → chip string. Silent unless there's advice. */
function buildChip(state) {
  if (!state) return '';
  if (state.last_decision === 'ADVISE_NOW') return '🪶 compact?';
  if (state.last_decision === 'PREP_SNAPSHOT') return '🪶 prep';
  return '';
}

function statusLine(sessionId) {
  try {
    if (!optedIn(prefs())) return '';
    return buildChip(readState(sessionId));
  } catch {
    return '';
  }
}

module.exports = { optedIn, buildChip, statusLine };

if (require.main === module) {
  const out = statusLine(process.argv[2]);
  if (out) process.stdout.write(out + '\n');
}
