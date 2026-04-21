#!/usr/bin/env node
/**
 * update-router.js — writes tuning state to tuning-state.json.
 *
 *   1. Reads router-tuning.json (produced by backtest.js).
 *   2. Builds a JSON object with complexity_threshold + promote/demote regex
 *      strings (without /.../ i-flag wrappers — classify.js adds the flag
 *      when compiling via new RegExp(s, 'i')).
 *   3. Writes tuning-state.json in the runtime router dir. classify.js
 *      loads this file at require() time; absence falls back to
 *      tuning-state.defaults.json (canonical seed).
 *
 * Run via: node ~/.claude/tools/router/update-router.js
 * Or piped after backtest: node backtest.js && node update-router.js
 *
 * Refactor note (2026-04-21): previously this script rewrote classify.js
 * in place, which caused bidirectional drift between canonical (repo) and
 * runtime (~/.claude/tools/router/) because canonical never received the
 * tuning state. Externalizing to tuning-state.json makes classify.js
 * deterministic and safe-to-sync. See docs/DRIFT-RESOLUTION-PLAN.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const TUNING = path.join(ROUTER_DIR, 'router-tuning.json');
const TUNING_STATE = path.join(ROUTER_DIR, 'tuning-state.json');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a word-boundary-anchored regex SOURCE string (without surrounding
 * slashes and without the 'i' flag — classify.js adds the flag at compile).
 * Returns null for empty patterns.
 */
function patternToRegexSource(pattern) {
  const parts = pattern.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (parts.length === 0) return null;
  return `\\b${parts.join('\\s+')}\\b`;
}

function buildTuningObject(tuning) {
  const promote = (tuning.promote_to_t0_patterns || [])
    .map(patternToRegexSource)
    .filter(Boolean);
  const demote = (tuning.demote_from_t3_patterns || [])
    .map(patternToRegexSource)
    .filter(Boolean);
  return {
    generated_at: tuning.generated_at,
    sample_size: tuning.sample_size,
    complexity_threshold: tuning.complexity_threshold,
    promote_t0: promote,
    demote_t3: demote,
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(TUNING)) {
    console.error(`update-router: ${TUNING} not found. Run backtest.js first.`);
    process.exit(1);
  }

  const tuning = JSON.parse(fs.readFileSync(TUNING, 'utf8'));
  const state = buildTuningObject(tuning);
  const serialized = JSON.stringify(state, null, 2) + '\n';

  if (dryRun) {
    console.log('── DRY RUN — no files will be modified ──');
    console.log('');
    console.log(`Would write ${TUNING_STATE}:`);
    console.log('');
    console.log(serialized);
    console.log('Notes:');
    for (const note of tuning.notes || []) console.log(`  - ${note}`);
    return;
  }

  // Compare with existing to detect no-op.
  let previous = null;
  if (fs.existsSync(TUNING_STATE)) {
    try {
      previous = fs.readFileSync(TUNING_STATE, 'utf8');
    } catch { /* ignore */ }
  }
  if (previous === serialized) {
    console.log('update-router: no changes (tuning-state.json already current).');
    return;
  }

  fs.writeFileSync(TUNING_STATE, serialized);

  console.log('update-router: tuning-state.json updated.');
  console.log(`  path:                   ${TUNING_STATE}`);
  console.log(`  generated_at:           ${state.generated_at}`);
  console.log(`  sample_size:            ${state.sample_size}`);
  console.log(`  complexity_threshold:   ${state.complexity_threshold}`);
  console.log(`  promote_t0 count:       ${state.promote_t0.length}`);
  console.log(`  demote_t3 count:        ${state.demote_t3.length}`);
  console.log('');
  console.log('Notes:');
  for (const note of tuning.notes || []) console.log(`  - ${note}`);
}

if (require.main === module) main();
