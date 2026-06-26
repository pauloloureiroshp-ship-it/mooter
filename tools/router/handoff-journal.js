#!/usr/bin/env node
// handoff-journal.js — Live Context Accumulator (PASSO 1).
//
// A per-session, DETERMINISTIC turn-by-turn journal. The turn-end hook
// (gsd-turn-end.js) appends one compact entry per assistant turn; the rolling
// summary (handoff-rollup.js) and the cockpit handoff READ this instead of
// resuming a thin slice on-demand at copy time.
//
// The journal is the perfect, never-fabricated layer: every field is derived
// from the transcript the host already wrote (assistant snippet + the last
// tool calls) plus cheap git facts. The qwen rolling summary sits on top of it.
//
// Storage: <handoffDir>/<safeId(sid)>.jsonl  (append-only, bounded ~50 entries,
// rolled atomically). handoffDir = MOOTER_HOME/handoff (tests) else the
// router's own handoff/ dir (production: ~/.claude/tools/router/handoff).
//
// Doctrine: best-effort, NEVER throws — the Stop hook that calls appendTurn
// must never break a turn. The file FORMAT is the only interface the cockpit
// reader (host-extra.js) shares — no cross-package require.

'use strict';

const fs = require('fs');
const path = require('path');

const JOURNAL_MAX = 50;          // keep the last N entries; roll above this
const SNIPPET_MAX = 200;         // assistant_snippet clamp
const TARGET_MAX = 48;           // per-tool target clamp
const TOOLS_MAX = 3;             // last N tool calls per entry

// Path contract — mirrored byte-for-byte by host-extra.js's reader. MOOTER_HOME
// (the .mooter test/sandbox home) roots everything under it; otherwise the
// journal lives next to this file (so it works regardless of where the runtime
// copy was synced to). Resolved live so a test that sets MOOTER_HOME after
// require() still gets an isolated dir.
function _dir() {
  return (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0)
    ? path.join(process.env.MOOTER_HOME, 'handoff')
    : path.join(__dirname, 'handoff');
}
function _safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }
function journalPath(sid) { return path.join(_dir(), _safeId(sid) + '.jsonl'); }
function summaryPath(sid)  { return path.join(_dir(), _safeId(sid) + '.summary.txt'); }
function rollupTsPath(sid) { return path.join(_dir(), _safeId(sid) + '.rollup-ts'); }

// PURE (testable): from a transcript JSONL tail (the lines the host already
// wrote), derive { assistant_snippet (<=200c), tools:[{name,target}] last 3 }.
// Same shape extractPending reads in host-extra.js — kept local so the hook
// needs no cross-package require. Never throws.
function deriveTurn(lines) {
  const out = { assistant_snippet: '', tools: [] };
  const arr = Array.isArray(lines) ? lines : [];
  const allTools = [];
  let lastText = '';
  for (const ln of arr) {
    if (!ln || !String(ln).trim()) continue;
    let d; try { d = JSON.parse(ln); } catch { continue; }
    const msg = d && d.message;
    const role = (msg && msg.role) || (d && d.type);
    if (role !== 'assistant') continue;
    const content = msg && msg.content;
    let textHere = '';
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        if (b.type === 'text' && typeof b.text === 'string') textHere += b.text;
        else if (b.type === 'tool_use') allTools.push({ name: String(b.name || 'tool'), target: _toolTarget(b.input) });
      }
    } else if (typeof content === 'string') { textHere += content; }
    if (textHere.trim()) lastText = textHere.trim().replace(/\s+/g, ' ').slice(0, SNIPPET_MAX);
  }
  out.assistant_snippet = lastText;
  out.tools = allTools.slice(-TOOLS_MAX);
  return out;
}

// PURE: short honest target from a tool_use.input (basename of a path, command,
// pattern, url, …). '' when nothing useful. Mirrors host-extra._toolTarget.
function _toolTarget(input) {
  if (!input || typeof input !== 'object') return '';
  const cand = input.file_path || input.path || input.notebook_path || input.command
    || input.pattern || input.url || input.query || input.description || input.prompt || '';
  let s = String(cand).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/[\\/]/.test(s) && !/\s/.test(s)) s = s.split(/[\\/]/).pop(); // path-like → basename
  return s.slice(0, TARGET_MAX);
}

// Cheap, NON-blocking git facts for a cwd: branch + head sha read straight from
// .git (no subprocess — keeps the sync turn-end append fast). dirty/ahead are
// intentionally NOT computed here (the cockpit's gitStage already supplies them
// to the deterministic handoff skeleton); this is supplementary provenance.
// Returns {} on any failure. Never throws.
function gitInfo(cwd) {
  try {
    if (!cwd || typeof cwd !== 'string') return {};
    let gitDir = path.join(cwd, '.git');
    let st; try { st = fs.statSync(gitDir); } catch { return {}; }
    // Worktree/submodule: .git is a file "gitdir: <path>".
    if (st.isFile()) {
      try {
        const m = fs.readFileSync(gitDir, 'utf8').match(/gitdir:\s*(.+)\s*$/m);
        if (m && m[1]) gitDir = path.resolve(cwd, m[1].trim());
      } catch { return {}; }
    }
    const headRaw = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const refM = headRaw.match(/^ref:\s*(.+)$/);
    if (!refM) return { head: headRaw.slice(0, 12), branch: 'HEAD' }; // detached
    const ref = refM[1].trim();
    const branch = ref.replace(/^refs\/heads\//, '');
    let head = '';
    try { head = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim().slice(0, 12); }
    catch {
      // packed-refs fallback
      try {
        const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8').split('\n');
        for (const l of packed) { const mm = l.match(/^([0-9a-f]{40})\s+(.+)$/); if (mm && mm[2] === ref) { head = mm[1].slice(0, 12); break; } }
      } catch { /* none */ }
    }
    return { head: head || null, branch: branch || null };
  } catch { return {}; }
}

function _normEntry(turn) {
  turn = turn || {};
  const tools = Array.isArray(turn.tools)
    ? turn.tools.slice(-TOOLS_MAX).map((t) => ({ name: String((t && t.name) || 'tool').slice(0, 40), target: String((t && t.target) || '').slice(0, TARGET_MAX) }))
    : [];
  const git = (turn.git && typeof turn.git === 'object') ? {
    head: turn.git.head != null ? String(turn.git.head).slice(0, 12) : null,
    branch: turn.git.branch != null ? String(turn.git.branch).slice(0, 80) : null,
    dirty: Number.isFinite(turn.git.dirty) ? turn.git.dirty : null,
    ahead: Number.isFinite(turn.git.ahead) ? turn.git.ahead : null,
  } : {};
  return {
    ts: (turn.ts && String(turn.ts)) || new Date().toISOString(),
    assistant_snippet: String(turn.assistant_snippet || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX),
    tools,
    git,
    n_turn: Number.isFinite(turn.n_turn) ? turn.n_turn : null,
  };
}

// Append ONE compact entry. Append-only, bounded: when the file exceeds
// JOURNAL_MAX entries it is rewritten (atomically, temp+rename) to the last
// JOURNAL_MAX. Returns true on write, false on any error (never throws).
function appendTurn(sessionId, turn) {
  if (!sessionId) return false;
  try {
    const dir = _dir();
    fs.mkdirSync(dir, { recursive: true });
    const file = journalPath(sessionId);
    const line = JSON.stringify(_normEntry(turn)) + '\n';
    fs.appendFileSync(file, line);
    // Roll if over the bound. Cheap (<=51 small lines).
    let lines;
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return true; }
    if (lines.length > JOURNAL_MAX) {
      const kept = lines.slice(-JOURNAL_MAX).join('\n') + '\n';
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, kept);
      fs.renameSync(tmp, file);
    }
    return true;
  } catch { return false; }
}

// Read parsed entries (oldest→newest). [] on any error.
function readJournal(sessionId) {
  try {
    return fs.readFileSync(journalPath(sessionId), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Last parsed entry, or null.
function lastEntry(sessionId) {
  const j = readJournal(sessionId);
  return j.length ? j[j.length - 1] : null;
}

// Current rolling summary text (written by handoff-rollup.js), or null.
function readSummary(sessionId) {
  try { const t = fs.readFileSync(summaryPath(sessionId), 'utf8').trim(); return t || null; }
  catch { return null; }
}

module.exports = {
  appendTurn, readJournal, lastEntry, deriveTurn, gitInfo, readSummary,
  journalPath, summaryPath, rollupTsPath,
  JOURNAL_MAX, SNIPPET_MAX,
};
Object.defineProperty(module.exports, 'DIR', { enumerable: true, get: _dir });
