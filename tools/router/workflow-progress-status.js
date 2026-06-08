#!/usr/bin/env node
/**
 * workflow-progress-status.js — Wave 33.5 Block A.6.
 *
 * Compact opt-in line-3 chip showing the LIVE workflow run's agent progress as
 * dots, e.g. `🔄 wf-ab12 3/7 ●●●◓○○○`. Reads the Wave 28 active-run pointer
 * (~/.mooter/workflows/active-run.json) READ-ONLY — the @mooter/workflow package
 * is frozen (Wave 28-33). Distinct from Wave 28's full-line `workflow-status.js`
 * (which is appended externally, not in the default statusline command): this is
 * the integrated buildLine3 chip with progress dots.
 *
 * Hot path: a single best-effort JSON read, no subprocess. Any failure → ''.
 * Token count is rendered only if the pointer carries one (it does not today) —
 * never fabricated.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_MS = 60000;
const SPIN = ['◐', '◓', '◑', '◒'];

function pointerPath() {
  if (process.env.MOOTER_WORKFLOW_ACTIVE) return process.env.MOOTER_WORKFLOW_ACTIVE;
  const home = process.env.MOOTER_HOME || os.homedir();
  return path.join(home, '.mooter', 'workflows', 'active-run.json');
}

function hidden() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return Array.isArray(prefs.hidden_chips) && prefs.hidden_chips.includes('workflow');
  } catch {
    return false;
  }
}

function progressDots(done, total, width, tick) {
  if (!(total > 0)) return '';
  const cap = Math.min(width || 7, Math.max(total, 1));
  const filled = Math.round((done / total) * cap);
  let out = '';
  for (let i = 0; i < cap; i++) {
    if (i < filled) out += '●';
    else if (i === filled && done < total) out += SPIN[((tick || 0) % SPIN.length + SPIN.length) % SPIN.length];
    else out += '○';
  }
  return out;
}

/** Build the chip from an already-parsed snapshot (pure; used by tests). */
function buildWorkflowProgressChip(snap, now, tick) {
  if (!snap || snap.status !== 'running') return '';
  if (typeof snap.ts === 'number' && (now - snap.ts) > STALE_MS) return '';
  const done = Math.max(0, Number(snap.agents_done) || 0);
  const total = Math.max(done, Number(snap.agents_total) || 0);
  const id = String(snap.run_id || snap.workflow_name || 'wf').slice(0, 8);
  const dots = progressDots(done, total, 7, tick);
  const tok = Number.isFinite(snap.tokens) && snap.tokens > 0 ? ` · ${(snap.tokens / 1000).toFixed(1)}k tk` : '';
  return `🔄 wf-${id} ${done}/${total}${dots ? ' ' + dots : ''}${tok}`;
}

function statusLine() {
  if (hidden()) return '';
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(pointerPath(), 'utf8'));
  } catch {
    return '';
  }
  // Tick from the same per-second cadence the rest of the statusline uses; the
  // process restarts each render so we derive it from wall-clock seconds.
  const tick = Math.trunc(Date.now() / 500);
  return buildWorkflowProgressChip(snap, Date.now(), tick);
}

module.exports = { buildWorkflowProgressChip, progressDots, statusLine, STALE_MS };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
