'use strict';
/**
 * pastor-status.js — statusline line-3 chip (Wave 30 Phase N · Wave 31 Pastor v2).
 *
 * Wave 31: prefer the per-task adapter chip
 *   "🧠 pastor: 6 adapters · frontend active"
 * read from ~/.mooter/pastor/adapters-active.json (written by the per-task router).
 * Falls back to the Wave 30 routing-hint chip ("💡 …") when no adapter state exists.
 * Opt-in line-3 only — lines 1-2 are untouched. Any failure → null (never breaks).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Wave 30: pure — build the routing-hint chip from a hint object (unchanged). */
function buildPastorChip(hint) {
  if (!hint) return null;
  if (typeof hint.label === 'string' && hint.label.length > 0) return `💡 ${hint.label}`;
  if (typeof hint.hint === 'string' && hint.hint.length > 0) return `💡 ${hint.hint}`;
  return null;
}

/** Short label for an adapter task_type: "coding-frontend" → "frontend". */
function shortType(t) {
  if (typeof t !== 'string' || !t) return null;
  return t.replace(/^coding-/, '').replace(/^prose-/, '');
}

/** Wave 31: pure — build the per-task adapter chip from pastor adapters-active state. */
function buildAdapterChip(state) {
  if (!state || typeof state.registered !== 'number' || state.registered <= 0) return null;
  const n = state.registered;
  const active = shortType(state.active_type);
  const head = `🧠 pastor: ${n} adapter${n === 1 ? '' : 's'}`;
  return active ? `${head} · ${active} active` : head;
}

function statusLine() {
  try {
    const adapter = buildAdapterChip(readJson(path.join(mooterHome(), 'pastor', 'adapters-active.json')));
    if (adapter) return adapter;
    return buildPastorChip(readJson(path.join(mooterHome(), 'pastor-hint.json')));
  } catch {
    return null;
  }
}

module.exports = { buildPastorChip, buildAdapterChip, shortType, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}
