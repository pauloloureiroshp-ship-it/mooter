'use strict';

// Adapter runtime selection (Wave 5 D2 — Mooter Forge).
//
// D2 is REAL: getActiveAdapter() reads the marked adapter's manifest, verifies its
// HMAC signature (natural-order payload, matching packages/router adapter_manifest),
// checks the adapter.gguf exists, and returns the manifest — else falls back to
// baseline (null) with a warning on tamper. A SEPARATE layer; never touches
// classify.js (P11) or safety_boost.js. Best-effort: any error → baseline.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function mooterHome() {
  return path.join(os.homedir(), '.mooter');
}

/** Local HMAC secret (same file consent.ts getLocalSecret persists). */
function readLocalSecret() {
  try {
    return fs.readFileSync(path.join(mooterHome(), '.telemetry_secret'), 'utf8').trim();
  } catch {
    return null;
  }
}

/** Sync signature verify — payload = manifest WITHOUT `signature` (natural order),
 * matching adapter_manifest.signManifest. */
function verifyManifestSignatureSync(manifest, secret) {
  if (!manifest || !manifest.signature || !secret) return false;
  const { signature, ...rest } = manifest;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(rest)).digest('hex');
  return expected === signature;
}

/**
 * The active adapter for routing, or null for baseline. D2: load + verify.
 * @returns {null | object} the validated manifest, or null
 */
function getActiveAdapter() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(mooterHome(), 'preferences.json'), 'utf8'));
    if (!prefs || !prefs.active_adapter_id) return null;

    const dir = path.join(mooterHome(), 'adapters', prefs.active_adapter_id);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const secret = readLocalSecret();
    if (!verifyManifestSignatureSync(manifest, secret)) {
      // Tamper or wrong secret — never honor an unverifiable adapter.
      if (process.env.MOOTER_DEBUG) process.stderr.write('Mooter: active adapter signature invalid — baseline\n');
      return null;
    }
    if (!fs.existsSync(path.join(dir, 'adapter.gguf'))) return null;

    return manifest;
  } catch {
    return null;
  }
}

/** Whether the user has *marked* an adapter active (D1 won't honor it yet). */
function markedAdapterId() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return prefs && typeof prefs.active_adapter_id === 'string' ? prefs.active_adapter_id : null;
  } catch {
    return null;
  }
}

/**
 * Annotate a routing decision with adapter state. Pure (returns a new object).
 * With no adapter (D1 always) the decision is marked baseline; D2's real adapter
 * path is here for forward-compat but unreachable while getActiveAdapter()→null.
 */
function applyAdapterToDecision(decision, adapter) {
  if (!adapter) {
    return {
      ...decision,
      adapter_applied: false,
      adapter_id: null,
      adapter_reason: 'baseline (no adapter installed)',
    };
  }
  return {
    ...decision,
    adapter_applied: true,
    adapter_id: adapter.adapter_id,
    adapter_name: adapter.name,
    adapter_reason: `validated adapter active (${adapter.adapter_type}, ${adapter.quantization})`,
  };
}

module.exports = { getActiveAdapter, markedAdapterId, applyAdapterToDecision, verifyManifestSignatureSync, readLocalSecret };
