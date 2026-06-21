#!/usr/bin/env node
/**
 * graph-status.js — Wave 61 Block 6 — the 🕸 graph statusline chip.
 *
 * OPT-IN line chip summarising the live code knowledge graph for this repo, e.g.
 *   `🕸 1.2k nós`            (graph resolved for the cwd)
 *   `🕸 1.2k nós · stale`    (graph exists but not refreshed for the cwd)
 * Off unless `statusline_chips.graph: true` in ~/.mooter/preferences.json OR env
 * `MOOTER_STATUSLINE_GRAPH=1`. Default OFF → the wired statusline is BYTE-IDENTICAL
 * (this module returns '' until opted in; registered in chip-composer alongside the
 * other self-gating chips). `hidden_chips: ["graph"]` also drops it.
 *
 * ONE real source (no fabrication, Doctrine V4 #5): the breadcrumb at
 * ~/.mooter/graph/active-graph.json written by graph-context-bridge.js (Block 2).
 * It carries COUNTS only — { repo, nodes, resolved, ts, edges? } — never symbol
 * names or paths (k-anon-safe; see WAVE61_DAY0_RECON.md §5).
 *
 * HONESTY — why no "~X% tokens" here (yet): the breadcrumb stores the real node
 * COUNT, not a measured token saving. Printing an invented "~X%" would violate the
 * claims policy (§E: every saving number is advisory + must carry repo-size/source).
 * So 61.A shows only what is real (the node count). The advisory token-saving figure
 * is wired in Block 5 (savings-tracker `graph_saved`, classified `advisory`) and can
 * be surfaced here later from that REAL aggregate — never guessed.
 *
 * When opted in but there is no graph (no breadcrumb / stale / garbage), the chip is
 * the honest `🕸 ?` — never a remembered number (the `?` convention from
 * agents-progress-status.js / cca-f-status.js).
 *
 * Budget: one readFileSync of the small pointer JSON. Any failure → '' (silent).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let bridge;
try { bridge = require('./graph-context-bridge.js'); } catch { bridge = null; }

// A breadcrumb not refreshed within this long is treated as a dead graph and shown
// as `· stale` (matches the staleness convention used by the workflow chips).
const STALE_MS = 24 * 60 * 60 * 1000;

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: env MOOTER_STATUSLINE_GRAPH=1 OR statusline_chips.graph === true. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_GRAPH === '1') return true;
  if (!(p && p.statusline_chips && p.statusline_chips.graph === true)) return false;
  // Respect an explicit hide override even when opted in.
  if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('graph')) return false;
  return true;
}

/** Compact node count: `1.2k nós` (≥1000) or `812 nós`. */
function fmtNodes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  const num = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  return `${num} nós`;
}

/**
 * Pure renderer — breadcrumb snapshot injected → chip string. `snap` is a
 * GraphContextSnapshot (or null), `now` injectable.
 *
 *   🕸 1.2k nós            — resolved & fresh
 *   🕸 1.2k nós · stale    — graph exists but ts older than STALE_MS or resolved=false
 *   🕸 ?                   — opted in but no usable breadcrumb
 */
function buildGraphChip(snap, now = Date.now()) {
  if (!snap || typeof snap !== 'object') return '🕸 ?';
  const nodes = Number(snap.nodes);
  const label = fmtNodes(nodes);
  if (!label) return '🕸 ?';
  const old = typeof snap.ts === 'number' && snap.ts > 0 && now - snap.ts > STALE_MS;
  const stale = snap.resolved === false || old;
  return stale ? `🕸 ${label} · stale` : `🕸 ${label}`;
}

/** Line entry: '' unless opted in, else the live chip (or honest `🕸 ?`). */
function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    const snap = bridge && typeof bridge.readGraphContext === 'function'
      ? bridge.readGraphContext()
      : null;
    return buildGraphChip(snap, Date.now());
  } catch {
    return '';
  }
}

module.exports = {
  buildGraphChip,
  fmtNodes,
  optedIn,
  statusLine,
  STALE_MS,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
