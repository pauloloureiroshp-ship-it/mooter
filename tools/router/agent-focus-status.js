#!/usr/bin/env node
/**
 * agent-focus-status.js — Wave 53 Phase B.3 (agent focus indicator).
 *
 * Opt-in line-3 chip naming the live subagent currently in focus, with its model
 * and elapsed time, e.g. `🤖 model-reasoner (sonnet, 1h12m)`. The existing
 * always-on `🐄 agents N active · spawned · peak` chip shows only COUNTS; this
 * chip adds the missing identity + model + duration for the running agent. Silent
 * when no subagent is active. `hidden_chips: ["agent_focus"]` drops it.
 *
 * Source of truth: subagent_tracker.js snapshot({session_id}).active — each
 * active record carries the REAL { agent_name, tier, model, started_at } written
 * by trackSpawn (started_at is Date.now() ms). No fabrication: model/tier/duration
 * are only rendered when present; the chip never invents a model or a runtime.
 *
 * Budget: one snapshot() read of the per-session tmp JSON (already used by the
 * line-1 herd chip). Any failure → ''.
 */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

let tracker;
try { tracker = require('./subagent_tracker.js'); } catch { tracker = null; }

function prefs() {
  try {
    // An explicit MOOTER_HOME IS the .mooter dir (matches the router-wide
    // convention); else <real-home>/.mooter. $HOME is a no-op for os.homedir() on
    // Windows, so MOOTER_HOME is the portable, hermetic override.
    const home = process.env.MOOTER_HOME;
    const prefsPath = home
      ? path.join(home, 'preferences.json')
      : path.join(os.homedir(), '.mooter', 'preferences.json');
    return JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
  } catch {
    return {};
  }
}

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** Compact duration: `8s` · `4m` · `1h12m`. */
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m}m`;
}

/**
 * Pure renderer (snapshot injected) → chip string ('' when nothing active).
 * Focus = the longest-running active agent (oldest started_at); `+N` for the rest.
 */
function buildAgentFocusChip(snap, now = Date.now()) {
  const active = (snap && Array.isArray(snap.active) ? snap.active : []).filter((a) => a && clean(a.agent_name));
  if (active.length === 0) return '';
  const sorted = active.slice().sort((a, b) => (a.started_at || 0) - (b.started_at || 0));
  const focus = sorted[0];
  const name = clean(focus.agent_name);
  const model = clean(focus.model) || clean(focus.tier);
  const dur = typeof focus.started_at === 'number' ? fmtDur(now - focus.started_at) : '';
  const inside = [model, dur].filter(Boolean).join(', ');
  const extra = active.length - 1;
  return `🤖 ${name}${extra > 0 ? ` +${extra}` : ''}${inside ? ` (${inside})` : ''}`;
}

function resolveSelf(selfSessionId) {
  return selfSessionId || process.env.CLAUDE_SESSION_ID || process.env.MOOTER_SESSION_ID || null;
}

function statusLine(selfSessionId) {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('agent_focus')) return '';
    if (!tracker || typeof tracker.snapshot !== 'function') return '';
    const snap = tracker.snapshot({ session_id: resolveSelf(selfSessionId) });
    return buildAgentFocusChip(snap, Date.now());
  } catch {
    return '';
  }
}

module.exports = { buildAgentFocusChip, fmtDur, statusLine };

if (require.main === module) {
  const out = statusLine(process.argv[2]);
  if (out) process.stdout.write(out + '\n');
}
