'use strict';
// hook-collector.js — Live Preview · MP0 Foundation (file-bus + Hook Collector).
//
// THE event channel that feeds the Live Preview. Pure Node (NO `vscode`, NO routing
// logic): hooks observe the runtime and append normalized events to a file-bus; the
// preview UI (a later MP) renders PURELY from that file. Read-only over the runtime —
// this module never decides routing, only records what already happened.
//
// ── FILE-BUS CONTRACT ──────────────────────────────────────────────────────────────
//   file: <workspace>/_handoff/live-preview/events.jsonl   (append-only, 1 JSON / line)
//   one line = one event, shape:
//     {
//       "ts":      ISO8601 string,                    // when the event was mapped
//       "sid":     string | null,                     // session id (null if unknown)
//       "kind":    "reason"|"task"|"file"|"asset"|"route"|"server",
//       "tool":    string | null,                     // e.g. "Write", subagent type
//       "path":    string | null,                     // file path touched
//       "summary": string | null,                     // short human label (capped)
//       "tier":    "T0".."T5" | null,                 // only if present in payload
//       "model":   string | null,                     // only if present in payload
//       "cost":    number | null,                     // only if present in payload
//       "local":   boolean | null                     // only if present in payload
//     }
//   RULES (honesty first):
//     • EVERY field is nullable. A field that does NOT come from the payload stays null.
//       NEVER fabricate (no guessed tier/model/cost — those live in decisions.log, not here).
//     • Size cap: the bus is trimmed to ~EVENTS_CAP lines (oldest dropped) so it can never
//       grow unbounded. The trim only fires once the file crosses a size gate (cheap appends).
//     • Writes are append-only; the trim rewrites atomically (tmp + rename). Everything is
//       fail-soft — a bad payload, a missing dir, or a corrupted file never throws.
//   NOTE: `mapEvent` currently produces reason/file/task/server. The "asset"/"route" kinds are
//   reserved in the schema for other producers (e.g. the extension's own server/asset taps).
//
// Reuses the house patterns from mc-snapshot.js / sync-collector.js: number-or-null guards,
// tmp+rename atomic write, try/catch → boolean fail-soft.

const fs = require('fs');
const path = require('path');

// ── honesty helpers (mirror mc-snapshot's `n()` discipline: keep real values, drop junk) ──
function s(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const m = (typeof max === 'number' && max > 0) ? max : 280;
  return t.length > m ? t.slice(0, m) : t;
}
function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }
function bool(v) { return v === true ? true : (v === false ? false : null); }
function nowIso() { try { return new Date().toISOString(); } catch { return null; } }

// tier only when the payload carries a valid one — never derived/guessed (honesty rule).
function tierOf(p) {
  const t = (p && typeof p.tier === 'string') ? p.tier.trim().toUpperCase() : null;
  return (t && /^T[0-5]$/.test(t)) ? t : null;
}

// Edit-family tools whose Pre/PostToolUse map to a "file" event. Other tools → irrelevant.
const FILE_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit)$/i;

// Build the common skeleton — all 10 schema keys present, null unless the payload fills them.
function skeleton(p) {
  return {
    ts: nowIso(),
    sid: s((p.session_id || p.sessionId || (p.session && p.session.id)), 200),
    kind: null,
    tool: null,
    path: null,
    summary: null,
    tier: tierOf(p),
    model: s(p.model, 80),
    cost: num(p.cost),
    local: bool(p.local),
  };
}

// mapEvent(hookName, payload) -> schema object | null (null = irrelevant / unmappable).
// Never throws. A field absent from the payload is left null — we do not invent.
function mapEvent(hookName, payload) {
  try {
    const p = (payload && typeof payload === 'object') ? payload : {};
    const name = String(hookName == null ? '' : hookName);

    if (name === 'UserPromptSubmit') {
      const e = skeleton(p);
      e.kind = 'reason';
      e.summary = s(p.prompt || p.user_prompt || p.message, 280);
      return e;
    }

    if (name === 'PreToolUse' || name === 'PostToolUse') {
      const tool = s(p.tool_name || p.toolName || p.tool, 60);
      if (!tool || !FILE_TOOLS.test(tool)) return null; // only Write|Edit-family → file events
      const ti = (p.tool_input || p.toolInput || {}) || {};
      const e = skeleton(p);
      e.kind = 'file';
      e.tool = tool;
      e.path = s(ti.file_path || ti.filePath || ti.path || ti.notebook_path || p.path, 400);
      e.summary = s(ti.summary, 280);
      return e;
    }

    if (name === 'FileChanged') {
      const e = skeleton(p);
      e.kind = 'file';
      e.path = s(p.path || p.file || p.file_path || (p.tool_input && p.tool_input.file_path), 400);
      e.summary = s(p.summary, 280);
      return e;
    }

    if (name === 'TaskCreated' || name === 'TaskCompleted') {
      const e = skeleton(p);
      e.kind = 'task';
      e.tool = s(p.subagent_type || p.subagentType, 60);
      e.summary = s(p.description || p.prompt || p.label, 280)
        || (name === 'TaskCompleted' ? 'completed' : 'created');
      return e;
    }

    if (name === 'Stop' || name === 'SubagentStop') {
      const e = skeleton(p);
      e.kind = 'server';
      e.summary = s(p.reason || p.summary, 280) || 'stop';
      return e;
    }

    return null;
  } catch {
    return null;
  }
}

// ── file-bus ───────────────────────────────────────────────────────────────────────
const EVENTS_CAP = 2000;          // keep at most ~this many lines (oldest trimmed)
const TRIM_GATE_BYTES = 128 * 1024; // only pay the read/trim once the file crosses this size

function eventsPath(workspaceDir) {
  return path.join(String(workspaceDir == null ? '.' : workspaceDir), '_handoff', 'live-preview', 'events.jsonl');
}

// Does the bus end mid-line (truncated/corrupted tail, no trailing newline)? If so the next
// append must lead with '\n' to preserve the 1-JSON-per-line invariant. Cheap (1-byte read),
// fail-soft (unknown → false, behave as a plain append).
function needsLeadingNewline(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return false;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, st.size - 1);
      return buf[0] !== 0x0a; // 0x0a === '\n'
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

// Trim the bus to its last EVENTS_CAP lines — only when it grew past the size gate, so the
// common append stays O(1). Atomic (tmp + rename) and fully fail-soft.
function capFile(file, cap) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size < TRIM_GATE_BYTES) return;
    const txt = fs.readFileSync(file, 'utf8');
    const lines = txt.split('\n').filter((l) => l.length > 0);
    if (lines.length <= cap) return;
    const kept = lines.slice(lines.length - cap).join('\n') + '\n';
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, kept);
    fs.renameSync(tmp, file);
  } catch { /* fail-soft: a trim failure must never break the producer */ }
}

// appendEvent(workspaceDir, evt) -> boolean. Creates the dir if missing, appends one JSON
// line, then trims past the cap. Tolerates a missing dir, a corrupted file, a partial/garbage
// evt — returns false instead of throwing.
function appendEvent(workspaceDir, evt) {
  if (!evt || typeof evt !== 'object') return false;
  let line;
  try { line = JSON.stringify(evt); } catch { return false; }
  if (typeof line !== 'string' || !line) return false;
  try {
    const file = eventsPath(workspaceDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prefix = needsLeadingNewline(file) ? '\n' : '';
    fs.appendFileSync(file, prefix + line + '\n');
    capFile(file, EVENTS_CAP);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  mapEvent,
  appendEvent,
  eventsPath,
  EVENTS_CAP,
  // exported for white-box tests / reuse:
  tierOf,
  FILE_TOOLS,
};
