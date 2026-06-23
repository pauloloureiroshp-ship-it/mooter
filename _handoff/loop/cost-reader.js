'use strict';
/**
 * cost-reader.js — W3 Autopilot Loop polish · shared cost aggregation helper.
 *
 * Reads ledger.jsonl and sums `cost` fields for the given wave.
 * Returns a positive number when cost data exists, or null when no entry
 * carries a `cost` field (caller renders "—" per the W3 spec).
 *
 * Pure disk reads — naturally cross-restart persistent:
 *   • No in-memory state.
 *   • A fresh process reading the same ledger.jsonl sees the same result.
 *
 * Used by:
 *   • tools/router/loop-status.js  (statusline chip)
 *   • _handoff/autopilot-loop/cockpit-loop.js  (cockpit snapshot field)
 */

const fs = require('fs');
const path = require('path');

/**
 * Aggregate cost from ledger.jsonl for the given wave.
 *
 * @param {string} loopDir  — absolute path to _handoff/loop/
 * @param {string} wave     — wave label to match (e.g. 'W3')
 * @returns {number|null}   — total cost or null (no cost data available)
 */
function readWaveCost(loopDir, wave) {
  if (!loopDir || !wave) return null;
  try {
    const text = fs.readFileSync(path.join(loopDir, 'ledger.jsonl'), 'utf8');
    let total = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.wave !== wave) continue;          // filter to this wave only
        const c = Number(entry.cost);
        if (Number.isFinite(c) && c > 0) total = (total || 0) + c;
      } catch { /* malformed line — skip, never throw */ }
    }
    return total; // null if no cost field found for this wave
  } catch {
    return null;  // ledger missing / unreadable → null → caller shows "—"
  }
}

/**
 * Format a cost number for display.
 * null / non-finite → '—'
 * < $0.01           → 4 decimal places (avoids "$0.00")
 * ≥ $0.01           → 2 decimal places
 *
 * @param {number|null} c
 * @returns {string}
 */
function fmtCost(c) {
  if (c === null || c === undefined || !Number.isFinite(c) || c < 0) return '—';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

module.exports = { readWaveCost, fmtCost };
