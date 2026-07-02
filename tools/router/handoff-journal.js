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

// ── PERFECT HANDOFF v2.5 — CAPTURE fix (mata a raiz do worktree-crossing) ──────
// The Stop hook used to read git facts from payload.cwd = the CC PROCESS launch
// dir (e.g. ~/frugal), not the worktree the session actually `cd`'d into to commit
// (e.g. ~/frugal-X). So the journal recorded the WRONG branch, and every honest
// consumer downstream inherited the lie. The truth is already in the transcript:
// the Bash `cd <path>` / `git -C <path>` the session ran. These helpers recover it.

// PURE (testable): win32 Git-Bash absolute path (/c/Users/…) → C:/Users/… so Node's
// win32 fs/path understand it. No-op off win32 (there /c/… is a legit absolute path).
function _normMsys(p) {
  const s = String(p == null ? '' : p);
  if (process.platform !== 'win32') return s;
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(s);
  return m ? (m[1] + ':/' + m[2]) : s;
}

// PURE (testable): the cd / git -C path arguments in ONE shell command string, in order.
// Handles "double"/'single' quotes (paths with spaces) and bare tokens (stop at ; & | < > ws).
// `cd`/`pushd` are anchored to a command boundary so `abc-cd` / `record` never false-match. Never throws.
function _extractCwdPaths(cmd) {
  const out = [];
  const s = String(cmd == null ? '' : cmd);
  const re = /(?:(?:^|[;&|(]|\s)(?:cd|pushd)|\bgit\s+-C)\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|<>]+))/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const p = m[1] || m[2] || m[3];
    if (p && p !== '-' && p !== '~') out.push(p); // `cd -` / `cd ~` carry no worktree signal
  }
  return out;
}

// PURE (testable): all git-context working-dir candidates in a transcript tail's Bash
// commands, oldest→newest. Only assistant tool_use blocks with name 'Bash' are scanned.
// Never throws.
function _cwdCandidates(lines) {
  const out = [];
  const arr = Array.isArray(lines) ? lines : [];
  for (const ln of arr) {
    if (!ln || !String(ln).trim()) continue;
    let d; try { d = JSON.parse(ln); } catch { continue; }
    const msg = d && d.message;
    const role = (msg && msg.role) || (d && d.type);
    if (role !== 'assistant') continue;
    const content = msg && msg.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || b.type !== 'tool_use') continue;
      if (String(b.name || '') !== 'Bash') continue;
      const cmd = b.input && typeof b.input.command === 'string' ? b.input.command : '';
      if (!cmd) continue;
      for (const p of _extractCwdPaths(cmd)) out.push(p);
    }
  }
  return out;
}

// Derive the EFFECTIVE working dir for a turn: the most-RECENT git-context path in the
// transcript tail (Bash cd / git -C) whose resolved path is a REAL git worktree (gitInfo
// resolves a branch). This is the root fix — the journal records the branch where commits
// ACTUALLY happen, not the CC launch dir. Grounded: only ever returns a path gitInfo
// resolves; never invents. Falls back to payloadCwd when no candidate resolves (byte-
// identical to the old behaviour for cd-less sessions → no regression). opts.base roots
// relative paths (default payloadCwd || process.cwd()); opts.gitInfo injects the resolver
// (tests). Never throws — the Stop hook must never break a turn.
function effectiveCwd(lines, payloadCwd, opts) {
  opts = opts || {};
  const resolveGit = (typeof opts.gitInfo === 'function') ? opts.gitInfo : gitInfo;
  const base = opts.base || payloadCwd || process.cwd();
  let cands;
  try { cands = _cwdCandidates(lines); } catch { cands = []; }
  // newest-first: the LAST git-context dir the session touched wins.
  for (let i = cands.length - 1; i >= 0; i--) {
    let p = cands[i];
    try {
      p = _normMsys(p);
      p = path.isAbsolute(p) ? p : path.resolve(_normMsys(base), p);
    } catch { continue; }
    let g; try { g = resolveGit(p); } catch { g = null; }
    if (g && g.branch) return p; // grounded: a real worktree with a real branch
  }
  return payloadCwd || null;
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

// ── Ledger Spine L0 — provenance EVENTS (additive, back-compat) ───────────────
// The journal becomes the event ledger (MOO_LEDGER_AND_ORCHESTRATION.md): moos
// EMIT events here; a single reducer (ledger-reduce.js) projects MD/SQLite/etc.
// Event entries carry a `kind` field (intent|turn|decision|outcome|handoff|
// compact|summary|extract) and mechanical provenance — which is the ONLY thing
// distinguishing them from the legacy turn entries appendTurn writes (those have
// no `kind`). readEvents/lastEventOfKind filter on it, so the two coexist in one
// file with zero interference. appendTurn stays byte-identical (untouched).

// Lazy, never-throwing handle to the pure provenance helpers. Kept lazy so the
// hot turn-end path that only calls appendTurn never pays for the require, and so
// a missing module degrades (null hashes) instead of breaking the never-throws.
let _prov;
function _provMod() {
  if (_prov !== undefined) return _prov;
  try { _prov = require('./ledger-prov.js'); } catch { _prov = null; }
  return _prov;
}

// EVENT field clamps — generous (events are the source of truth, not a snippet).
const AGENT_MAX = 64, MODEL_MAX = 64, TIER_MAX = 8, KIND_MAX = 24, IDEM_MAX = 160;
const EVENT_KINDS = ['intent', 'turn', 'decision', 'outcome', 'handoff', 'compact', 'summary', 'extract'];

// Normalize one event entry. The input/output PAYLOADS are retained verbatim
// (the journal is the truth — the reducer reads them); the hashes are the
// content address over the same payloads. Never throws.
function _normEvent(ev) {
  ev = ev || {};
  const entry = {
    ts: (ev.ts && String(ev.ts)) || new Date().toISOString(),
    kind: String(ev.kind || 'turn').slice(0, KIND_MAX),
    agent: ev.agent != null ? String(ev.agent).slice(0, AGENT_MAX) : null,
    model: ev.model != null ? String(ev.model).slice(0, MODEL_MAX) : null,
    tier: ev.tier != null ? String(ev.tier).slice(0, TIER_MAX) : null,
    cost_usd: Number.isFinite(ev.cost_usd) ? ev.cost_usd : null,
    input_hash: ev.input_hash != null ? String(ev.input_hash) : null,
    output_hash: ev.output_hash != null ? String(ev.output_hash) : null,
    idem_key: ev.idem_key != null ? String(ev.idem_key).slice(0, IDEM_MAX) : null,
    gate: ev.gate !== undefined ? ev.gate : null,
  };
  if (ev.input !== undefined) entry.input = ev.input;
  if (ev.output !== undefined) entry.output = ev.output;
  return entry;
}

// Append ONE provenance event. The runner stamps ts + input_hash/output_hash
// MECHANICALLY (over the canonicalized payloads) — the caller never supplies its
// own lineage. Idempotent by idem_key: a second event with the same idem_key
// already present in the (bounded) journal is a no-op. Same bound + atomic roll
// as appendTurn. Returns { ok, deduped }; never throws.
function appendEvent(ev) {
  try {
    ev = ev || {};
    const sid = ev.sid || ev.sessionId;
    if (!sid) return { ok: false, deduped: false };

    // Mechanical provenance: hash the payloads unless the caller already pinned a
    // hash (e.g. replaying a known event). The LLM never writes these.
    let input_hash = ev.input_hash != null ? ev.input_hash : null;
    let output_hash = ev.output_hash != null ? ev.output_hash : null;
    const prov = _provMod();
    if (prov) {
      try { if (input_hash == null && ev.input !== undefined) input_hash = prov.provHash(ev.input); } catch { /* degrade */ }
      try { if (output_hash == null && ev.output !== undefined) output_hash = prov.provHash(ev.output); } catch { /* degrade */ }
    }

    const entry = _normEvent({ ...ev, input_hash, output_hash });

    // Idempotency: dedupe on idem_key against the current journal window.
    if (entry.idem_key) {
      for (const e of readJournal(sid)) {
        if (e && e.idem_key && e.idem_key === entry.idem_key) {
          return { ok: true, deduped: true };
        }
      }
    }

    const dir = _dir();
    fs.mkdirSync(dir, { recursive: true });
    const file = journalPath(sid);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');

    // Roll if over the bound (atomic temp+rename), exactly like appendTurn.
    let lines;
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return { ok: true, deduped: false }; }
    if (lines.length > JOURNAL_MAX) {
      const kept = lines.slice(-JOURNAL_MAX).join('\n') + '\n';
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, kept);
      fs.renameSync(tmp, file);
    }
    return { ok: true, deduped: false };
  } catch { return { ok: false, deduped: false }; }
}

// Read journal entries that are provenance EVENTS (have a `kind`), oldest→newest.
// Legacy turn entries (no `kind`) are excluded. Optional `kind` filter. [] on error.
function readEvents(sessionId, kind) {
  const evs = readJournal(sessionId).filter((e) => e && typeof e.kind === 'string');
  return kind ? evs.filter((e) => e.kind === kind) : evs;
}

// The most recent event of a given kind for a session, or null.
function lastEventOfKind(sessionId, kind) {
  const evs = readEvents(sessionId, kind);
  return evs.length ? evs[evs.length - 1] : null;
}

module.exports = {
  appendTurn, readJournal, lastEntry, deriveTurn, gitInfo, readSummary,
  appendEvent, readEvents, lastEventOfKind,
  journalPath, summaryPath, rollupTsPath,
  JOURNAL_MAX, SNIPPET_MAX, EVENT_KINDS,
  // Perfect Handoff v2.5 — CAPTURE fix (worktree-crossing at the root):
  effectiveCwd, _cwdCandidates, _extractCwdPaths, _normMsys,
};
Object.defineProperty(module.exports, 'DIR', { enumerable: true, get: _dir });
