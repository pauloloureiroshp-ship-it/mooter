#!/usr/bin/env node
/**
 * workflow-locks-bridge.js — Wave 33.8 Block C.
 *
 * The Conductor↔Workflow join point that lives OUTSIDE the frozen @mooter/workflow
 * package (Wave 28-33.7 INTOCADOS). A host-side workflow runner — or a PreToolUse
 * hook guarding git/deploy/Notion calls — calls `setWorkflowLocks([...])` after it
 * has acquired the real Conductor lock(s), so the live `active-run.json` breadcrumb
 * records which dangerous resources the run holds. The statusline's
 * workflow-progress chip then renders `🔒 git+notion` alongside the run's progress.
 *
 * This module is the BREADCRUMB writer only — it deliberately does NOT reimplement
 * the Conductor's atomic O_EXCL lock protocol (that stays the single source of
 * truth in packages/worktree-conductor). It just mirrors, into the workflow
 * pointer, the resource names the caller already locked. Best-effort: a broken
 * breadcrumb must never break a run, so every error is swallowed.
 *
 * Shape contract: ActiveRunSnapshot gains an optional `locks_held: string[]`.
 * The JS reader (workflow-progress-status.js) renders it; absent → nothing shown.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function pointerPath() {
  if (process.env.MOOTER_WORKFLOW_ACTIVE) return process.env.MOOTER_WORKFLOW_ACTIVE;
  const home = process.env.MOOTER_HOME || os.homedir();
  return path.join(home, '.mooter', 'workflows', 'active-run.json');
}

function readPointer(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Pure: merge `resources` into a snapshot's `locks_held`, deduped + order-stable.
 * Returns a new snapshot object (does not mutate the input). Non-string / blank
 * entries are dropped. A null snapshot yields null (nothing to stamp onto).
 */
function mergeLocks(snap, resources) {
  if (!snap || typeof snap !== 'object') return null;
  const clean = (Array.isArray(resources) ? resources : [])
    .filter((r) => typeof r === 'string' && r.trim().length)
    .map((r) => r.trim());
  const existing = Array.isArray(snap.locks_held) ? snap.locks_held.filter((r) => typeof r === 'string') : [];
  const seen = new Set();
  const held = [];
  for (const r of [...existing, ...clean]) {
    if (!seen.has(r)) { seen.add(r); held.push(r); }
  }
  return { ...snap, locks_held: held };
}

/** Pure: drop `resources` from a snapshot's `locks_held` (all when omitted). */
function dropLocks(snap, resources) {
  if (!snap || typeof snap !== 'object') return null;
  if (resources === undefined) {
    const { locks_held, ...rest } = snap; // eslint-disable-line no-unused-vars
    return rest;
  }
  const drop = new Set((Array.isArray(resources) ? resources : []).map((r) => String(r).trim()));
  const held = (Array.isArray(snap.locks_held) ? snap.locks_held : []).filter((r) => !drop.has(r));
  return held.length ? { ...snap, locks_held: held } : (() => { const { locks_held, ...rest } = snap; return rest; })(); // eslint-disable-line no-unused-vars
}

/** Stamp held resources into the live breadcrumb. Best-effort → boolean. */
function setWorkflowLocks(resources, opts = {}) {
  try {
    const p = opts.pointerPath || pointerPath();
    const snap = readPointer(p);
    const next = mergeLocks(snap, resources);
    if (!next) return false; // no active run to annotate
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Release held resources from the breadcrumb (all when omitted). Best-effort. */
function clearWorkflowLocks(resources, opts = {}) {
  try {
    const p = opts.pointerPath || pointerPath();
    const snap = readPointer(p);
    const next = dropLocks(snap, resources);
    if (!next) return false;
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
    return true;
  } catch {
    return false;
  }
}

module.exports = { mergeLocks, dropLocks, setWorkflowLocks, clearWorkflowLocks, pointerPath };

if (require.main === module) {
  // CLI: workflow-locks-bridge.js set git notion   |   ... clear [resource...]
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'set') process.exit(setWorkflowLocks(rest) ? 0 : 1);
  if (cmd === 'clear') process.exit(clearWorkflowLocks(rest.length ? rest : undefined) ? 0 : 1);
  process.stderr.write('usage: workflow-locks-bridge.js set|clear [resource...]\n');
  process.exit(2);
}
