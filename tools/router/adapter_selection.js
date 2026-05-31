'use strict';

// Adapter runtime selection (Wave 5 D1 — Adapter Forge foundation).
//
// D1 is a STUB: getActiveAdapter() ALWAYS returns null (baseline), even if the
// user manually marked `active_adapter_id` in preferences.json — because D1 ships
// no validation pipeline yet (that's D2). This is the honest behaviour: we will
// not pretend to honor an adapter we cannot validate. D2 replaces the body of
// getActiveAdapter() with: read manifest → verify signature → check base-model
// match → return the adapter. This module is a SEPARATE layer; it never touches
// classify.js (P11) or safety_boost.js.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * The active adapter for routing, or null for baseline.
 * @returns {null | { adapter_id: string, name: string, adapter_type: string, quantization: string }}
 */
function getActiveAdapter() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    if (!prefs || !prefs.active_adapter_id) return null;
    // Wave 5 D1: even with active_adapter_id set, return null — no validation
    // pipeline yet. D2 will load + verify the manifest and return the adapter.
    return null;
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
      adapter_reason: 'baseline (forge ships Wave 5 D2)',
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

module.exports = { getActiveAdapter, markedAdapterId, applyAdapterToDecision };
