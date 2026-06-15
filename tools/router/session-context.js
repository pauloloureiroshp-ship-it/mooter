#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * session-context.js — Wave 65 Context Bridge (P0 store/writer + P1 reader).
 *
 * Keeps a per-session conversation transcript so STATELESS dispatches (Ollama now;
 * Gemini/OpenAI later) can answer in-context. The Claude Code host already has
 * native context — it does NOT read this. Writers:
 *   - inject_context.js   → user turns + the current-session pointer
 *   - gsd-turn-end.js      → host (Claude) assistant turns (from transcript_path)
 *   - router-execute.js    → local (Ollama) assistant turns + reads context to inject
 *
 * Doctrine: opt-in (default OFF), sanitized (privacy.sanitize), 0600, local-only
 * (never synced to the hub), TTL-pruned. Every function is best-effort and never
 * throws — the hooks that call it must never break a turn.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Home resolution: an explicit MOOTER_HOME (the .mooter dir, matching the rest of
// the router) roots ALL state — store, pointer and prefs — under it, so tests and
// sandboxed runs never read or write the developer's real home. $HOME is a no-op
// for os.homedir() on Windows, so MOOTER_HOME is the only portable override.
// Lazily resolved (getters) so a test that sets MOOTER_HOME after require() still
// gets an isolated home — a module-load-time const would freeze the real home.
function _mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}
// Store/pointer live under .claude/tools/router in production; when MOOTER_HOME is
// set they live directly under it (one isolated dir for the whole bridge).
function _routerDir() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.claude', 'tools', 'router');
}
function _dir() { return path.join(_routerDir(), '.session-context'); }
function _current() { return path.join(_routerDir(), '.current-session.json'); }
function _prefs() { return path.join(_mooterHome(), 'preferences.json'); }

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // prune transcripts older than 7d
const MAX_TEXT = 4000;                  // cap per-turn stored text
const DEFAULT_BUDGET_TOKENS = 1500;     // injection budget (≈ chars/4)
const DEFAULT_MAX_TURNS = 12;

/** Opt-in: env override wins, else preferences.json `context_bridge === true`. Default OFF. */
function isEnabled() {
  if (process.env.MOOTER_CONTEXT_BRIDGE === '1') return true;
  if (process.env.MOOTER_CONTEXT_BRIDGE === '0') return false;
  try { return JSON.parse(fs.readFileSync(_prefs(), 'utf8')).context_bridge === true; } catch { return false; }
}

function _sanitize(text) {
  try { const pv = require('./privacy.js'); if (pv && typeof pv.sanitize === 'function') return pv.sanitize(String(text)); } catch { /* privacy optional */ }
  return String(text);
}
function _safeId(id) { return String(id || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }
function _file(sessionId) { return path.join(_dir(), _safeId(sessionId) + '.jsonl'); }

/** Point at the session currently being routed — router-execute reads this since the
 *  /mooter-<model> skill invocation carries no session id. */
function setCurrentSession(sessionId) {
  if (!isEnabled()) return false; // true opt-in: zero writes (not even the pointer) when OFF
  try { fs.mkdirSync(_routerDir(), { recursive: true }); fs.writeFileSync(_current(), JSON.stringify({ session_id: sessionId, ts: new Date().toISOString() })); return true; } catch { return false; }
}
function currentSession() {
  try { return JSON.parse(fs.readFileSync(_current(), 'utf8')).session_id || null; } catch { return null; }
}

/** Append one turn. No-op (returns false) when disabled / empty / on any error. */
function appendTurn(sessionId, turn) {
  if (!isEnabled() || !sessionId || !turn || !turn.text) return false;
  try {
    fs.mkdirSync(_dir(), { recursive: true });
    const rec = {
      ts: new Date().toISOString(),
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      model: turn.model || null,
      text: _sanitize(turn.text).slice(0, MAX_TEXT),
      tokens: Number(turn.tokens) || null,
    };
    if (!rec.text) return false;
    // mode 0o600 is honoured on POSIX; on Windows it is a no-op (NTFS ACLs apply) —
    // the file still lives under the user-profile dir whose default ACL is user-only.
    fs.appendFileSync(_file(sessionId), JSON.stringify(rec) + '\n', { mode: 0o600 });
    return true;
  } catch { return false; }
}

/** Read parsed turns (oldest→newest), optionally capped to the last maxN. */
function readTurns(sessionId, maxN) {
  try {
    const turns = fs.readFileSync(_file(sessionId), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return maxN ? turns.slice(-maxN) : turns;
  } catch { return []; }
}

/**
 * Build a budgeted context block to inject into a stateless provider's system prompt.
 * `excludeText` drops a trailing turn equal to it (the current prompt, already passed
 * separately) to avoid duplication. Returns { text, turns, approxTokens } or null.
 */
function buildContextBlock(sessionId, opts = {}) {
  if (!isEnabled() || !sessionId) return null;
  const budgetChars = (Number(opts.budgetTokens) || DEFAULT_BUDGET_TOKENS) * 4;
  let turns = readTurns(sessionId, opts.maxTurns || DEFAULT_MAX_TURNS);
  if (opts.excludeText) {
    const ex = String(opts.excludeText).trim();
    while (turns.length && turns[turns.length - 1].role === 'user' && String(turns[turns.length - 1].text).trim() === ex) turns = turns.slice(0, -1);
  }
  if (!turns.length) return null;
  const picked = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const line = (t.role === 'assistant' ? 'Assistant' : 'User') + (t.model ? ' (' + t.model + ')' : '') + ': ' + t.text;
    if (used + line.length > budgetChars && picked.length) break;
    picked.push(line); used += line.length;
  }
  if (!picked.length) return null;
  picked.reverse();
  return { text: 'Conversation so far (recent turns, for context):\n' + picked.join('\n'), turns: picked.length, approxTokens: Math.round(used / 4) };
}

/** Best-effort TTL prune of stale transcripts. */
function pruneOld() {
  try {
    const now = Date.now();
    const dir = _dir();
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try { if (now - fs.statSync(fp).mtimeMs > TTL_MS) fs.unlinkSync(fp); } catch { /* skip */ }
    }
  } catch { /* dir absent */ }
}

module.exports = {
  isEnabled, setCurrentSession, currentSession, appendTurn, readTurns, buildContextBlock, pruneOld,
  DEFAULT_BUDGET_TOKENS,
};
// DIR/CURRENT are resolved live (honor a MOOTER_HOME set after require) so test
// consumers (sc.DIR) always get the currently-active, isolated path.
Object.defineProperty(module.exports, 'DIR', { enumerable: true, get: _dir });
Object.defineProperty(module.exports, 'CURRENT', { enumerable: true, get: _current });
