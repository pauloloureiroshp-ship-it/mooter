'use strict';

// FRENTE C · PM Adapters — local scoped token broker (DC-12).
//
// "tokens num broker local scoped (NÃO no extension storage), escopo mínimo."
//
// Tokens live in per-tool files under `~/.mooter/pm-adapters/tokens/<tool>.token`,
// mode 0600 (mirrors consent.ts getLocalSecret — the canonical machine-local-secret
// pattern). NEVER in VS Code extension storage; never leaves the machine; never logged
// in the clear (redact() before any log/telemetry). Each tool declares a MINIMUM scope
// so the UI/CLI can show — and the user can verify — exactly what the token may do.

const fs = require('fs');
const path = require('path');
const { tokensDir, pmDir, ensureDir, readJson, writeJson } = require('./home.js');

// Minimum scope per tool — advisory (we cannot enforce a remote token's real grant, but
// we DECLARE the least privilege we need, so an over-scoped token is a visible smell).
const MIN_SCOPE = {
  github: 'repo:status (read-only) — PR/CI state only, no write',
  notion: 'insert/update rows in ONE roadmap database — no read of other pages',
  linear: 'create/update issues in ONE team — no read-back',
  slack: 'chat:write to ONE channel — summary notifications only',
};

function tokenFile(tool) {
  return path.join(tokensDir(), `${tool}.token`);
}

function scopeMetaFile() {
  return path.join(pmDir(), 'token-scopes.json');
}

/** Store a token for a tool (0600). Records the declared scope. Returns ok:boolean. */
function setToken(tool, token, { scope } = {}) {
  if (!MIN_SCOPE[tool] || typeof token !== 'string' || !token.trim()) return false;
  ensureDir(tokensDir());
  const file = tokenFile(tool);
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, token.trim(), { mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch { /* Windows: no-op */ }
    fs.renameSync(tmp, file);
  } catch {
    return false;
  }
  // Record declared scope (metadata only — never the token value).
  const meta = readJson(scopeMetaFile(), {});
  meta[tool] = { declared_scope: scope || MIN_SCOPE[tool], min_scope: MIN_SCOPE[tool] };
  writeJson(scopeMetaFile(), meta, { mode: 0o600 });
  return true;
}

/** Read a tool's token, or null. Best-effort. */
function getToken(tool) {
  try {
    const t = fs.readFileSync(tokenFile(tool), 'utf8').trim();
    return t || null;
  } catch {
    return null;
  }
}

function hasToken(tool) {
  return getToken(tool) !== null;
}

/** Remove a tool's token + scope metadata. Returns ok. */
function revoke(tool) {
  let ok = false;
  try { fs.unlinkSync(tokenFile(tool)); ok = true; } catch { /* absent */ }
  const meta = readJson(scopeMetaFile(), {});
  if (meta[tool]) { delete meta[tool]; writeJson(scopeMetaFile(), meta, { mode: 0o600 }); }
  return ok;
}

/** The declared minimum scope for a tool (for UI/CLI display). */
function minScope(tool) {
  return MIN_SCOPE[tool] || null;
}

/** Never print a token in the clear. `gh_abc…WXYZ` style — enough to identify, not to use. */
function redact(token) {
  if (typeof token !== 'string' || !token) return '(none)';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 3)}…${token.slice(-4)}`;
}

module.exports = { MIN_SCOPE, setToken, getToken, hasToken, revoke, minScope, redact, tokenFile };
