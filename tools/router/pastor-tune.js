#!/usr/bin/env node
// pastor-tune.js — Wave 16-18 Day 2 (Tier C): wakes the Pastor learning loop.
//
// Chains backtest.js → update-router.js so the classifier tunes from the user's
// real decisions:  decisions.log → backtest → router-tuning.json → update-router
// → tuning-state.json.  classify.js reads tuning-state.json at load (it is NEVER
// modified by this loop — it stays byte-identical; the learning lives entirely in
// the runtime tuning-state.json).
//
// Activation (the "scheduler" is local — the committed tuning-state.defaults.json
// is the QA baseline and is intentionally never written by the pipeline):
//   • on demand:        node tools/router/pastor-tune.js
//   • daily (cron):     0 4 * * *  node ~/.claude/tools/router/pastor-tune.js
//   • Windows Task Scheduler: daily action `node %USERPROFILE%\.claude\tools\router\pastor-tune.js`
//
// Env:
//   MOOTER_ROUTER_DIR          override the router dir (default ~/.claude/tools/router)
//   MOOTER_DECISIONS_LOG       override the decisions log path
//   MOOTER_TUNE_MIN_DECISIONS  min decisions before tuning runs (default 100)
//   --dry-run                  show what would change without writing tuning-state.json

'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = __dirname;
const ROUTER_DIR = process.env.MOOTER_ROUTER_DIR || path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = process.env.MOOTER_DECISIONS_LOG || path.join(ROUTER_DIR, 'decisions.log');
const MIN_DECISIONS = Number(process.env.MOOTER_TUNE_MIN_DECISIONS || 100);
const dryRun = process.argv.includes('--dry-run');

function decisionCount() {
  try {
    if (!fs.existsSync(LOG_PATH)) return 0;
    return fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter((l) => l.trim()).length;
  } catch { return 0; }
}

function run() {
  const n = decisionCount();
  if (n < MIN_DECISIONS) {
    console.log(`pastor-tune: ${n} decisions (< ${MIN_DECISIONS}) — not enough signal, skipping.`);
    return 0;
  }
  console.log(`pastor-tune: ${n} decisions — backtest → update-router${dryRun ? ' (dry-run)' : ''}...`);
  const env = { ...process.env };
  // backtest.js → router-tuning.json (suggestions); never writes classify.js.
  execFileSync('node', [path.join(DIR, 'backtest.js')], { stdio: 'inherit', env });
  // update-router.js → tuning-state.json (the runtime state classify.js loads).
  const args = [path.join(DIR, 'update-router.js')];
  if (dryRun) args.push('--dry-run');
  execFileSync('node', args, { stdio: 'inherit', env });
  console.log('pastor-tune: done — classify.js picks up tuning-state.json on its next load.');
  return 0;
}

if (require.main === module) {
  try { process.exit(run()); }
  catch (e) { console.error('pastor-tune: failed —', e.message); process.exit(1); }
}

module.exports = { run, decisionCount, MIN_DECISIONS };
