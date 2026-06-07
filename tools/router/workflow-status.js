#!/usr/bin/env node
/**
 * workflow-status.js — optional statusline line 3 for an active workflow run.
 *
 * Wave 28 (Phase H). Standalone and dependency-free: the live statusline
 * (statusline-multi.js) is NOT touched. This reads a lightweight JSON pointer
 * (~/.mooter/workflows/active-run.json) written by the workflow engine
 * (packages/workflow/src/active.ts) and prints ONE line when a run is active:
 *
 *   🔄 workflow: audit-unused-exports · phase 2/4 · 12/50 agents
 *
 * It deliberately does NOT touch SQLite (better-sqlite3 is native; the
 * statusline is on the hot path and every router tool is pure-JS). When there is
 * no active run, an unreadable/stale pointer, or a finished run, it prints
 * nothing — so it's purely additive and lines 1-2 are unaffected.
 *
 * Live wiring is opt-in: the run pointer only exists while a workflow runs, so
 * the line appears only then. To show it in the live statusline, a wrapper can
 * append `node tools/router/workflow-status.js`'s output after statusline-multi.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// A run whose pointer hasn't been refreshed in this long is treated as dead
// (the process likely crashed without clearing it) and the line is suppressed.
const STALE_MS = 6 * 60 * 60 * 1000;

function mooterHome() {
  return process.env.MOOTER_HOME || os.homedir();
}

function activePointerPath() {
  return (
    process.env.MOOTER_WORKFLOW_ACTIVE ||
    path.join(mooterHome(), '.mooter', 'workflows', 'active-run.json')
  );
}

function readActiveRun(p) {
  try {
    return JSON.parse(fs.readFileSync(p || activePointerPath(), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Pure: build the line 3 string from a pointer object, or null if it shouldn't
 * be shown. `now` is injectable for tests.
 */
function buildWorkflowStatusLine(run, now) {
  if (!run || typeof run !== 'object') return null;
  if (run.status && run.status !== 'running') return null;
  const ts = Number(run.ts);
  if (Number.isFinite(ts) && (now || Date.now()) - ts > STALE_MS) return null;

  const name = run.workflow_name || run.run_id || 'workflow';
  const parts = ['🔄 workflow: ' + name];
  if (Number(run.num_phases) > 0) {
    parts.push('phase ' + (Number(run.phase) || 1) + '/' + Number(run.num_phases));
  }
  if (Number(run.agents_total) > 0) {
    parts.push((Number(run.agents_done) || 0) + '/' + Number(run.agents_total) + ' agents');
  }
  return parts.join(' · ');
}

/** Read the active pointer and build the line (or null). */
function statusLine() {
  return buildWorkflowStatusLine(readActiveRun());
}

module.exports = { buildWorkflowStatusLine, readActiveRun, activePointerPath, statusLine, STALE_MS };

if (require.main === module) {
  const line = statusLine();
  if (line) process.stdout.write(line + '\n');
}
