#!/usr/bin/env node
// gsd-turn-end.js — Stop hook for frugal turn-latency measurement (v0.7.2)
//
// Fires when the Claude Code main assistant completes a turn. Writes a
// `turn_end` event to decisions.log with the session_id and ts_ms, so the
// savings-tracker can pair it with the matching `classified` event from
// inject_context.js and compute wall-clock turn duration.
//
// This hook is the second half of a pair:
//
//   UserPromptSubmit → inject_context.js → logs classified (ts_ms, session_id)
//                                              ↓
//                           [Claude Code runs the turn]
//                                              ↓
//   Stop              → gsd-turn-end.js    → logs turn_end  (ts_ms, session_id)
//
// The savings-tracker walks the log, pairs events by session_id, computes
// p50/p95 duration, and compares against an estimated Opus baseline.
//
// Design: NEVER fails loudly. Any error → silent exit 0. The statusline
// latency segment simply does not render when data is missing.
//
// Install: add to ~/.claude/settings.json under the hooks block:
//   "Stop": [{"type": "command", "command": "node ~/.claude/hooks/gsd-turn-end.js"}]

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch { process.exit(0); }

const payload = safeJson(raw) || {};

// Claude Code Stop hook payload shape varies across versions; we defensively
// probe for the session id in every likely location.
const sessionId =
  payload.session_id ||
  (payload.session && payload.session.id) ||
  payload.sessionId ||
  'unknown';

const entry = {
  ts: new Date().toISOString(),
  ts_ms: Date.now(),
  event: 'turn_end',
  session_id: sessionId,
  // Optional: some Claude Code versions expose stop_reason on the Stop hook
  stop_reason: payload.stop_reason || null,
};

try {
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
} catch { /* telemetry is best-effort */ }

process.exit(0);
