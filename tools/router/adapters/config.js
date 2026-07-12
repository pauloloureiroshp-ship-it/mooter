'use strict';

// FRENTE C · PM Adapters — opt-in config (ZERO-BY-DEFAULT).
//
// Gate DC (masterprompt line 106/111): "core $0 funciona sem nenhum · adaptadores
// desligados por default". Enabling lives under a DISTINCT `pm_adapters` key inside
// `~/.mooter/preferences.json` (never collides with the Forge's `active_adapter_id`).
//
// The invariant: an adapter is OFF unless the user has WRITTEN `enabled:true` for it.
// Absent config, unknown tool, corrupt file → false. There is no way to be on by accident.

const path = require('path');
const { mooterHome, readJson, writeJson } = require('./home.js');

const TOOLS = ['github', 'notion', 'linear', 'slack'];

// Every tool starts disabled. Direction is fixed by design, not by config:
//   github    → read-only (repo:status) enrichment; never write-back.
//   notion    → outbound roadmap write-back.
//   linear    → outbound (optional).
//   slack     → outbound summary-notification sink (optional).
const DIRECTION = { github: 'read-only', notion: 'outbound', linear: 'outbound', slack: 'outbound' };

function prefsPath() {
  return path.join(mooterHome(), 'preferences.json');
}

function readPrefs() {
  const p = readJson(prefsPath(), {});
  return p && typeof p === 'object' ? p : {};
}

/** The pm_adapters block, defaulted so every known tool reads as { enabled:false }. */
function readConfig() {
  const block = readPrefs().pm_adapters;
  const cfg = {};
  for (const t of TOOLS) {
    const raw = block && typeof block === 'object' ? block[t] : null;
    cfg[t] = {
      enabled: !!(raw && raw.enabled === true), // ONLY literal true enables. Anything else = off.
      direction: DIRECTION[t],
      ...(raw && typeof raw === 'object' ? stripEnabled(raw) : {}),
    };
  }
  return cfg;
}

function stripEnabled(raw) {
  const { enabled, direction, ...rest } = raw; // `enabled`/`direction` are authoritative above
  return rest;
}

/** True only when the tool is a known tool AND literally enabled. Default: false. */
function isEnabled(tool) {
  if (!TOOLS.includes(tool)) return false;
  return readConfig()[tool].enabled === true;
}

function direction(tool) {
  return DIRECTION[tool] || null;
}

/** Persist enable/disable for a tool (merges, never wipes other keys). Returns ok. */
function setEnabled(tool, enabled, opts = {}) {
  if (!TOOLS.includes(tool)) return false;
  const prefs = readPrefs();
  const block = prefs.pm_adapters && typeof prefs.pm_adapters === 'object' ? prefs.pm_adapters : {};
  const prev = block[tool] && typeof block[tool] === 'object' ? block[tool] : {};
  block[tool] = { ...prev, ...opts, enabled: enabled === true };
  prefs.pm_adapters = block;
  return writeJson(prefsPath(), prefs, { mode: 0o600 });
}

module.exports = { TOOLS, DIRECTION, readConfig, isEnabled, direction, setEnabled, prefsPath };
