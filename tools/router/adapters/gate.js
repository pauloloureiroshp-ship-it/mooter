'use strict';

// FRENTE C · PM Adapters — human write-back gate (DC-12).
//
// "write-back com gate humano na 1ª vez por ferramenta."
//
// Being enabled + holding a token is NOT enough to write to an external tool. The FIRST
// write-back per tool requires an explicit, recorded human consent. Until a human grants
// it (via `cli.js grant <tool>` or a UI button that calls grant()), every outbound
// delivery is BLOCKED — the events still coalesce locally but nothing leaves the machine.
//
// This is the projection-sink analogue of consent.ts: opt-in, off by default, and the
// grant is persisted so the human is asked ONCE per tool, not per event.

const path = require('path');
const { pmDir, readJson, writeJson } = require('./home.js');

function consentPath() {
  return path.join(pmDir(), 'consent.json');
}

function readConsent() {
  const c = readJson(consentPath(), {});
  return c && typeof c === 'object' ? c : {};
}

/** Has a human granted first-write consent for this tool? Default: false. */
function hasConsent(tool) {
  const rec = readConsent()[tool];
  return !!(rec && rec.granted === true);
}

/** Record human consent for a tool's write-back. `at` is injectable for tests. */
function grant(tool, { by = 'human', note = '', at } = {}) {
  const c = readConsent();
  c[tool] = { granted: true, granted_at: at || new Date().toISOString(), by, note };
  return writeJson(consentPath(), c, { mode: 0o600 });
}

/** Withdraw consent — the next write-back is gated again. */
function revoke(tool) {
  const c = readConsent();
  if (!c[tool]) return false;
  delete c[tool];
  return writeJson(consentPath(), c, { mode: 0o600 });
}

/** Full consent record for a tool (for UI/CLI display), or null. */
function record(tool) {
  return readConsent()[tool] || null;
}

module.exports = { hasConsent, grant, revoke, record, consentPath };
