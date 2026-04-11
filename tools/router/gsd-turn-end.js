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

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const EXEC_LOG_PATH = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');

let pricing = null;
try { pricing = require(path.join(ROUTER_DIR, 'pricing.js')); } catch { /* optional */ }

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function tailLines(filePath, maxBytes = 131072) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter(Boolean);
  } catch { return []; }
}

function modelEmoji(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus'))   return '🔴';
  if (m.includes('sonnet')) return '🟡';
  if (m.includes('haiku'))  return '⚡';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return '🦙';
  if (m.includes('gemini') || m.includes('google')) return '💎';
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai')) return '🟩';
  return '❓';
}

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return null;
  if (n === 0) return '$0';
  if (n < 0.001) return `~$${(n * 1000).toFixed(1)}m`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

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

const turnEndMs = Date.now();

const entry = {
  ts: new Date().toISOString(),
  ts_ms: turnEndMs,
  event: 'turn_end',
  session_id: sessionId,
  stop_reason: payload.stop_reason || null,
  // Signal to backtest.resolveFeedback() that this turn should be paired
  // with the next classified event in the same session (if any, <30s →
  // followup_immediate; else → accepted).
  followup_pending: true,
};

try {
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
} catch { /* telemetry is best-effort */ }

// ─────────────────────────────────────────────────────────────────────────
// Turn footer — surface to the user what ACTUALLY ran this turn.
//
// Reads:
//   • decisions.log for the classified event of this turn (defines the
//     turn start timestamp)
//   • execution.log for every Bash tool call between turn start and now
//     (each entry is already tagged with model=X role=Y by exec-logger.js)
//
// Produces a systemMessage like:
//   frugal turn end → 🔴 opus ×14 · 🦙 qwen3:30b ×2 · real cost ~$0.09 · saved ~$0.08 vs all-Opus
//
// Silent on any error.
// ─────────────────────────────────────────────────────────────────────────

function emitFooter() {
  if (!sessionId || sessionId === 'unknown') return;

  // Find turn start: the most recent `classified` event for this session
  // that precedes turnEndMs.
  const decisionLines = tailLines(LOG_PATH);
  let turnStartMs = 0;
  let classified = null;
  for (let i = decisionLines.length - 1; i >= 0; i--) {
    const obj = safeJson(decisionLines[i]);
    if (!obj || obj.event !== 'classified') continue;
    if (obj.session_id !== sessionId) continue;
    if ((obj.ts_ms || 0) > turnEndMs) continue;
    classified = obj;
    turnStartMs = obj.ts_ms || 0;
    break;
  }
  if (!turnStartMs) return;

  // Scan execution.log for Bash calls from this session within the turn
  // window. Each line is a plain text log: [ts] session=ID model=X role=Y cmd=...
  const execLines = tailLines(EXEC_LOG_PATH, 524288);
  const modelCounts = {};
  let totalBash = 0;
  for (const line of execLines) {
    const tsMatch = line.match(/^\[([^\]]+)\]/);
    if (!tsMatch) continue;
    const tsMs = Date.parse(tsMatch[1]);
    if (!isFinite(tsMs)) continue;
    if (tsMs < turnStartMs - 1000 || tsMs > turnEndMs + 1000) continue;
    const sessMatch = line.match(/session=(\S+)/);
    if (!sessMatch || sessMatch[1] !== sessionId) continue;
    const modelMatch = line.match(/model=(\S+)/);
    const model = modelMatch ? modelMatch[1] : 'unknown';
    modelCounts[model] = (modelCounts[model] || 0) + 1;
    totalBash++;
  }

  if (totalBash === 0) return; // nothing to show — hook-only turn

  // Build "model ×N" segments, sorted by count desc.
  const segments = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([model, n]) => `${modelEmoji(model)} ${model} ×${n}`);

  // Rough real-cost estimate: sum each Bash call's tier-adjusted cost.
  // We don't have per-call token counts so we assume a canonical 400-char
  // unit of work per Bash call. Good enough for a live indicator.
  const CHAR_UNIT = 400;
  let realCost = 0;
  let baselineCost = 0;
  if (pricing) {
    try {
      for (const [model, n] of Object.entries(modelCounts)) {
        const m = String(model).toLowerCase();
        let tier = 'T2';
        if (m.includes('opus')) tier = 'T3';
        else if (m.includes('sonnet')) tier = 'T2';
        else if (m.includes('haiku')) tier = 'T1';
        else if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) tier = 'T0';
        realCost += pricing.estimateTurnCost(tier, CHAR_UNIT) * n;
        baselineCost += pricing.naiveOpusCost(CHAR_UNIT) * n;
      }
    } catch { /* non-fatal */ }
  }
  const saved = Math.max(0, baselineCost - realCost);

  // "actual ~" marks this as a tier-based estimate (~400 chars per Bash call)
  // since execution.log doesn't store per-call token counts. Still far more
  // accurate than the old advisory-only source: the model mix is ground truth.
  const parts = [...segments];
  if (realCost > 0) parts.push(`actual ~${fmtUsd(realCost)}`);
  if (saved >= 0.001) parts.push(`saved ${fmtUsd(saved)} vs all-Opus`);
  else if (realCost > 0 && saved === 0) parts.push('no savings (all-Opus turn)');

  const footer = `frugal turn end → ${parts.join(' · ')}`;

  try {
    process.stdout.write(JSON.stringify({
      continue: true,
      suppressOutput: false,
      systemMessage: footer,
    }));
  } catch { /* non-fatal */ }
}

try { emitFooter(); } catch { /* never block the turn */ }

process.exit(0);
