'use strict';

// FRENTE C · PM Adapters — shared home + fs helpers.
//
// The router's user-data home is `~/.mooter` (same convention as adapter_selection.js,
// consent.ts, handoff-journal.js). The Forge already owns `~/.mooter/adapters/<id>/`
// (LoRA manifests + adapter.gguf) — so the PM-adapter subsystem carves out a DISTINCT
// namespace `~/.mooter/pm-adapters/` for tokens, consent and debounce state. No collision.
//
// Everything here is best-effort: never throws (mirrors the Ledger's "degrades, never
// blocks the architect" doctrine). A missing/locked file → sensible empty default.

const fs = require('fs');
const path = require('path');
const os = require('os');

/** The user-data home. An explicit MOOTER_HOME IS the .mooter dir; else <home>/.mooter.
 *  Cross-platform — never depends on $HOME (matches adapter_selection.js:16-21). */
function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/** PM-adapter data root — distinct from the Forge's `~/.mooter/adapters/`. */
function pmDir() {
  return path.join(mooterHome(), 'pm-adapters');
}

function tokensDir() {
  return path.join(pmDir(), 'tokens');
}

/** Ensure a directory exists with owner-only perms (0700). Best-effort. */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch { /* Windows: no-op */ }
    return true;
  } catch {
    return false;
  }
}

/** Read + parse a JSON file. Returns `fallback` on any error (missing, locked, corrupt). */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Atomic-ish JSON write (temp + rename) with owner-only perms. Returns ok:boolean. */
function writeJson(file, obj, { mode = 0o600 } = {}) {
  try {
    ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode });
    try { fs.chmodSync(tmp, mode); } catch { /* Windows: no-op */ }
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

module.exports = { mooterHome, pmDir, tokensDir, ensureDir, readJson, writeJson };
