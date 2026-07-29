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

  // MP-18: Compute total accumulated stats from all execution.log entries
  let totalDecisions = 0;
  let totalRealCost = 0;
  let totalBaselineCost = 0;
  if (pricing) {
    try {
      const allExec = tailLines(EXEC_LOG_PATH, 2097152); // 2MB — covers full history
      const allModelCounts = {};
      for (const line of allExec) {
        const modelMatch = line.match(/model=(\S+)/);
        const model = modelMatch ? modelMatch[1] : null;
        if (model) {
          allModelCounts[model] = (allModelCounts[model] || 0) + 1;
          totalDecisions++;
        }
      }
      for (const [model, n] of Object.entries(allModelCounts)) {
        const m = String(model).toLowerCase();
        let tier = 'T2';
        if (m.includes('opus')) tier = 'T3';
        else if (m.includes('sonnet')) tier = 'T2';
        else if (m.includes('haiku')) tier = 'T1';
        else if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) tier = 'T0';
        totalRealCost += pricing.estimateTurnCost(tier, CHAR_UNIT) * n;
        totalBaselineCost += pricing.naiveOpusCost(CHAR_UNIT) * n;
      }
    } catch { /* non-fatal */ }
  }
  const totalSaved = Math.max(0, totalBaselineCost - totalRealCost);
  const totalSavedPct = totalBaselineCost > 0 ? Math.round((totalSaved / totalBaselineCost) * 100) : 0;
  const sessionSavedPct = baselineCost > 0 ? Math.round((saved / baselineCost) * 100) : 0;

  // "actual ~" marks this as a tier-based estimate (~400 chars per Bash call)
  // since execution.log doesn't store per-call token counts. Still far more
  // accurate than the old advisory-only source: the model mix is ground truth.
  const parts = [...segments];
  if (realCost > 0) parts.push(`actual ~${fmtUsd(realCost)}`);
  // MP-18: session + total format instead of just session savings
  parts.push(`session: ${sessionSavedPct}%`);
  if (totalDecisions > 0) parts.push(`total: ${totalSavedPct}% · ${totalDecisions} decisions`);

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

// ── Sprint 1 feedback loop — augment .last-classified.json ──────────────
// Reads the state file written by inject_context.js at the start of this
// turn, augments it with turn_end_ts and response_len_bucket (derived
// from the last assistant message in transcript_path when available),
// and rewrites it. Silent on any error. Additive only.
function augmentLastClassified() {
  const LAST_CLASSIFIED_PATH = path.join(ROUTER_DIR, '.last-classified.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(LAST_CLASSIFIED_PATH, 'utf8'));
  } catch { return; }
  if (!state || typeof state !== 'object') return;
  if (!sessionId || sessionId === 'unknown') return;
  if (state.session_id !== sessionId) return;

  // Derive response_len_bucket from the last assistant message in the
  // transcript, if the Stop payload provides a transcript_path.
  let responseLen = null;
  let _assistantText = '';
  try {
    const tp = payload.transcript_path || payload.transcriptPath || null;
    if (tp && fs.existsSync(tp)) {
      const lines = tailLines(tp, 262144);
      for (let i = lines.length - 1; i >= 0; i--) {
        let obj;
        try { obj = JSON.parse(lines[i]); } catch { continue; }
        const msg = obj && obj.message;
        if (!msg || msg.role !== 'assistant') continue;
        const content = Array.isArray(msg.content) ? msg.content : null;
        if (!content) continue;
        let total = 0; let _txt = '';
        for (const block of content) {
          if (block && typeof block.text === 'string') { total += block.text.length; _txt += block.text; }
        }
        if (total > 0) { responseLen = total; _assistantText = _txt; break; }
      }
    }
  } catch { /* non-fatal */ }

  let responseLenBucket = null;
  if (responseLen != null) {
    if (responseLen < 500) responseLenBucket = '0-500';
    else if (responseLen < 1000) responseLenBucket = '500-1000';
    else if (responseLen < 2000) responseLenBucket = '1000-2000';
    else responseLenBucket = '2000+';
  }

  state.turn_end_ts = turnEndMs;
  if (responseLenBucket) state.response_len_bucket = responseLenBucket;

  // Wave 65 Context Bridge (P0): record the host (Claude) assistant turn so local
  // dispatches can see what the host said. Absolute require (this hook runs from
  // ~/.claude/hooks/). Opt-in is enforced inside appendTurn; best-effort.
  try {
    if (_assistantText) {
      const _scPath = require('path').join(require('os').homedir(), '.claude', 'tools', 'router', 'session-context.js');
      require(_scPath).appendTurn(sessionId, { role: 'assistant', text: _assistantText });
    }
  } catch { /* best-effort */ }

  try {
    fs.writeFileSync(LAST_CLASSIFIED_PATH, JSON.stringify(state));
  } catch { /* telemetry best-effort */ }
}
try { augmentLastClassified(); } catch { /* never block the turn */ }

// ── Live Context Accumulator (PASSO 3) — incremental handoff journal + rolling
// local summary. At each turn-end: appendTurn (SYNC, fast — derives the snippet
// + last tool calls from the transcript tail the host already wrote, plus cheap
// git facts read straight from .git, no subprocess) THEN spawn the rolling
// summary DETACHED (qwen on the free GPU, throttled inside the child; the hook
// returns immediately, never awaits the model). Best-effort: never blocks/breaks
// the turn. The handoff later READS this accumulated context instead of resuming
// a thin slice on-demand at copy time.
function accumulateHandoff() {
  if (!sessionId || sessionId === 'unknown') return;
  let journal;
  try { journal = require(path.join(ROUTER_DIR, 'handoff-journal.js')); } catch { return; }

  // Derive snippet + last tool calls from the transcript tail (same source the
  // cockpit's extractPending reads). Best-effort; empty when no transcript.
  let derived = { assistant_snippet: '', tools: [] };
  let tail = [];
  try {
    const tp = payload.transcript_path || payload.transcriptPath || null;
    if (tp && fs.existsSync(tp)) {
      tail = tailLines(tp, 262144);
      derived = journal.deriveTurn(tail) || derived;
    }
  } catch { /* best-effort */ }

  // Cheap git facts (branch + head sha from .git — no subprocess, no latency).
  // PERFECT HANDOFF v2.5 — CAPTURE fix (mata a raiz do worktree-crossing): read git from
  // the EFFECTIVE worktree the turn actually cd'd into (recovered from the transcript's
  // Bash `cd` / `git -C`), NOT payload.cwd — which is only the CC PROCESS launch dir, so
  // a session that `cd frugal-X && git commit` used to be journalled under the launch
  // branch. effectiveCwd falls back to payload.cwd when the tail shows no worktree → byte-
  // identical to the old behaviour for cd-less sessions (no regression). Grounded, never throws.
  let git = {};
  try {
    const payloadCwd = (typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : null;
    const cwd = journal.effectiveCwd(tail, payloadCwd);
    if (cwd) git = journal.gitInfo(cwd) || {};
  } catch { /* best-effort */ }

  let nTurn = 0;
  try { nTurn = journal.readJournal(sessionId).length + 1; } catch { /* fresh */ }

  try {
    journal.appendTurn(sessionId, {
      assistant_snippet: derived.assistant_snippet,
      tools: derived.tools,
      git,
      n_turn: nTurn,
    });
  } catch { /* never */ }

  // Fire-and-forget rolling summary — throttled INSIDE the child (≥90s OR ≥5
  // turns). Detached because this hook calls process.exit(0) below, which would
  // kill an un-awaited in-process async. The clipboard never waits on qwen.
  try {
    const rollup = path.join(ROUTER_DIR, 'handoff-rollup.js');
    if (fs.existsSync(rollup)) {
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [rollup, sessionId], {
        detached: true, stdio: 'ignore', windowsHide: true,
      });
      child.unref();
    }
  } catch { /* never */ }
}
try { accumulateHandoff(); } catch { /* never block the turn */ }

// ── Ledger Spine L0 — MECHANICAL decision capture ───────────────────────────
// Derive any AskUserQuestion → answer from the transcript tail the host already
// wrote and emit ONE kind:decision event per answered question into the session
// journal (idempotent by a stable idem_key, so re-scanning on later turns never
// duplicates). The WHY of a choice becomes immutable + attributed + replayable
// instead of evaporating when the context clears — the next session stops
// re-litigating decisions already made. Derived from the transcript, NEVER
// invented; best-effort, never blocks/breaks the turn. (Runs AFTER the turn
// append so the journal's last line stays a turn entry for the cockpit reader.)
function accumulateDecisions() {
  if (!sessionId || sessionId === 'unknown') return;
  let journal, decision, prov;
  try { journal = require(path.join(ROUTER_DIR, 'handoff-journal.js')); } catch { return; }
  if (typeof journal.appendEvent !== 'function') return; // pre-ledger runtime → skip
  try { decision = require(path.join(ROUTER_DIR, 'ledger-decision.js')); } catch { return; }
  try { prov = require(path.join(ROUTER_DIR, 'ledger-prov.js')); } catch { prov = null; }

  // Transcript tail — the same host-written source the journal/footer read.
  let lines = [];
  try {
    const tp = payload.transcript_path || payload.transcriptPath || null;
    if (tp && fs.existsSync(tp)) lines = tailLines(tp, 262144);
  } catch { return; }
  if (!lines.length) return;

  let decisions = [];
  try { decisions = decision.deriveDecisions(lines) || []; } catch { return; }
  if (!decisions.length) return;

  // Mechanical provenance: stamp the architect (cc) + the turn's routed model/tier.
  let model = null, tier = null;
  try {
    const st = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, '.last-classified.json'), 'utf8'));
    if (st && st.session_id === sessionId) { model = st.recommended_model || st.model || null; tier = st.tier || null; }
  } catch { /* optional */ }

  for (const dec of decisions) {
    try {
      const idem_key = 'decision:' + (prov
        ? prov.provHash({ sid: sessionId, q: dec.question, chosen: dec.chosen })
        : (String(dec.question).slice(0, 80) + '|' + String(dec.chosen).slice(0, 40)));
      journal.appendEvent({ sid: sessionId, agent: 'cc', model, tier, kind: 'decision', output: dec, idem_key });
    } catch { /* never */ }
  }
}
try { accumulateDecisions(); } catch { /* never block the turn */ }

// ── MEO Control Tower — typed multi-agent turn checkpoint ──────────────────
// Reuses this already-wired Stop hook instead of adding another global hook.
// Local-only, compact and fail-soft: session/title/model pointers only, never
// prompt or response bodies. Automatic capture explicitly skips git subprocesses
// inside agent-sync-ledger; full git provenance stays a manual checkpoint concern.
function accumulateAgentSync() {
  if (!sessionId || sessionId === 'unknown') return;
  let sync;
  try { sync = require(path.join(ROUTER_DIR, 'agent-sync-ledger.js')); } catch { return; }
  if (!sync || typeof sync.command !== 'function') return;

  const transcriptPath = payload.transcript_path || payload.transcriptPath || null;
  let tail = [];
  try { if (transcriptPath && fs.existsSync(transcriptPath)) tail = tailLines(transcriptPath, 262144); } catch { tail = []; }

  let model = null;
  for (let i = tail.length - 1; i >= 0; i--) {
    let row;
    try { row = JSON.parse(tail[i]); } catch { continue; }
    const m = row && row.message && row.message.model;
    if (typeof m === 'string' && m && m.charAt(0) !== '<') { model = m.slice(0, 120); break; }
  }

  let title = null;
  try {
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      const fd = fs.openSync(transcriptPath, 'r');
      const st = fs.fstatSync(fd); const buf = Buffer.alloc(Math.min(st.size, 96 * 1024));
      fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
      for (const line of buf.toString('utf8').split('\n')) {
        let row; try { row = JSON.parse(line); } catch { continue; }
        if (!row || row.type !== 'user' || !row.message) continue;
        const c = row.message.content; let txt = '';
        if (typeof c === 'string') txt = c;
        else if (Array.isArray(c)) { for (const b of c) if (b && b.type === 'text' && typeof b.text === 'string') txt += b.text; }
        txt = txt.trim(); if (!txt || txt.charAt(0) === '<') continue;
        title = (txt.split('\n').find((x) => x.trim()) || txt).replace(/^#+\s*/, '').replace(/\s+/g, ' ').slice(0, 160);
        if (title) break;
      }
    }
  } catch { title = null; }

  let cwd = (typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();
  try {
    const journal = require(path.join(ROUTER_DIR, 'handoff-journal.js'));
    if (journal && typeof journal.effectiveCwd === 'function') cwd = journal.effectiveCwd(tail, cwd) || cwd;
  } catch { /* payload cwd remains the honest fallback */ }

  const hookPayload = {
    cwd,
    session_id: sessionId,
    session_title: title,
    provider: 'anthropic',
    model,
    execution_channel: 'subscription',
    summary: 'Claude Code turn completed',
    started_at: payload.started_at || payload.startedAt || null,
    ended_at: payload.ended_at || payload.endedAt || null,
    duration_ms: payload.duration_ms != null ? payload.duration_ms : payload.durationMs,
    recorded_by: 'claude-code',
  };
  try { sync.command(['hook'], { stdin: JSON.stringify(hookPayload), root: cwd }); } catch { /* never block Stop */ }
}
try { accumulateAgentSync(); } catch { /* never block the turn */ }

// ── PEÇA 4: Auto-sync silencioso (a cada 25 chamadas) ────────────────────
function autoSync() {
  const { spawn } = require('child_process');
  const SYNC_INTERVAL = 25;
  const COUNTER_PATH = path.join(ROUTER_DIR, '.turn-counter');
  const AUTH_TOKEN_PATH = path.join(os.homedir(), '.frugal', 'auth.token');

  let count = 0;
  try { count = parseInt(fs.readFileSync(COUNTER_PATH, 'utf8'), 10) || 0; } catch { /* first run */ }
  count++;
  try { fs.writeFileSync(COUNTER_PATH, String(count)); } catch { /* best-effort */ }

  if (count % SYNC_INTERVAL === 0 && fs.existsSync(AUTH_TOKEN_PATH)) {
    const doctorPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'mooter-doctor.js');
    if (fs.existsSync(doctorPath)) {
      try {
        const child = spawn('node', [doctorPath, '--sync', '--silent'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } catch { /* non-fatal */ }
    }
  }
}
try { autoSync(); } catch { /* never block the turn */ }

// ── MP-18: Auto-sync silencioso via auto-sync.js (fire-and-forget) ──────
try {
  const autoSyncPath = path.join(ROUTER_DIR, 'auto-sync.js');
  if (fs.existsSync(autoSyncPath)) {
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [autoSyncPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
} catch { /* never block the turn */ }

process.exit(0);
