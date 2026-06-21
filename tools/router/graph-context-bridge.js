#!/usr/bin/env node
/**
 * graph-context-bridge.js — Wave 66 Block 2 (Graphify × Mooter).
 *
 * The Graphify↔Mooter join point that lives OUTSIDE any frozen package. A thin
 * CLI/git-hook (`mooter graph sync`) runs `graphify` incrementally over the cwd
 * and then calls `setGraphContext({ repo, nodes, resolved })` so the live
 * breadcrumb at ~/.mooter/graph/active-graph.json records that a code knowledge
 * graph is available for this repo and how big it is (node COUNT only). The
 * statusline's 🕸 graph chip and the inject_context graph-context layer then read
 * this pointer — the chip renders `🕸 N nós`, the hook tells Claude Code it may
 * query the graph instead of grepping every file.
 *
 * This module is the BREADCRUMB writer only. It deliberately does NOT build, parse
 * or interpret the graph.json itself (that is Graphify's job, run by the caller).
 * It mirrors, into the pointer, the COUNTS the caller already computed — never
 * symbol names or paths (k-anon-safe by construction; see WAVE66_DAY0_RECON.md §5).
 * Best-effort: a broken breadcrumb must never break the hook or the statusline, so
 * every error is swallowed and the writer returns false.
 *
 * Shape contract — GraphContextSnapshot (all fields optional except they are
 * written together):
 *   { repo: string, nodes: number, resolved: boolean, ts: number, edges?: number }
 * Readers treat a missing/garbage pointer as "no graph" (clean state).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function pointerPath() {
  if (process.env.MOOTER_GRAPH_ACTIVE) return process.env.MOOTER_GRAPH_ACTIVE;
  const home = process.env.MOOTER_HOME || os.homedir();
  return path.join(home, '.mooter', 'graph', 'active-graph.json');
}

function readPointer(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Coerce a value to a finite non-negative integer, or null when not a number. */
function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Pure: project a caller-supplied context into a normalised GraphContextSnapshot,
 * or null when there is nothing meaningful to record. `repo` must be a non-blank
 * string and `nodes` a real count — otherwise we have no honest signal to write.
 * `now` is injectable for tests. Only COUNTS are kept; no symbol names ever.
 */
function buildSnapshot(ctx, now) {
  if (!ctx || typeof ctx !== 'object') return null;
  const repo = typeof ctx.repo === 'string' && ctx.repo.trim().length ? ctx.repo.trim() : null;
  const nodes = toCount(ctx.nodes);
  if (repo === null || nodes === null) return null;
  const snap = {
    repo,
    nodes,
    resolved: ctx.resolved !== false, // default true: a written breadcrumb means a graph exists
    ts: Number.isFinite(Number(now)) ? Number(now) : 0,
  };
  const edges = toCount(ctx.edges);
  if (edges !== null) snap.edges = edges;
  // repo_size = source-file count the graph was built over (Wave 66.B). Optional;
  // gates the savings estimate (announce only at >=100 files — see DAY0 recon §2).
  const repoSize = toCount(ctx.repo_size);
  if (repoSize !== null) snap.repo_size = repoSize;
  return snap;
}

/**
 * Stamp the current graph context into the live breadcrumb. Best-effort → boolean.
 * Creates the parent dir if needed. A null/garbage context yields false (nothing
 * to record) and writes nothing.
 */
function setGraphContext(ctx, opts = {}) {
  try {
    const now = opts.now !== undefined ? opts.now : Date.now();
    const next = buildSnapshot(ctx, now);
    if (!next) return false;
    const p = opts.pointerPath || pointerPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Remove the breadcrumb (graph context cleared for this repo). Best-effort. */
function clearGraphContext(opts = {}) {
  try {
    const p = opts.pointerPath || pointerPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the breadcrumb into a normalised snapshot, or null when absent / garbage.
 * Tolerant: a pointer missing `repo` or `nodes` is treated as no-graph (null), so
 * a partially-written or legacy file never produces a misleading chip.
 */
function readGraphContext(opts = {}) {
  const p = opts.pointerPath || pointerPath();
  const raw = readPointer(p);
  if (!raw || typeof raw !== 'object') return null;
  const repo = typeof raw.repo === 'string' && raw.repo.trim().length ? raw.repo.trim() : null;
  const nodes = toCount(raw.nodes);
  if (repo === null || nodes === null) return null;
  const out = { repo, nodes, resolved: raw.resolved !== false, ts: Number(raw.ts) || 0 };
  const edges = toCount(raw.edges);
  if (edges !== null) out.edges = edges;
  const repoSize = toCount(raw.repo_size);
  if (repoSize !== null) out.repo_size = repoSize;
  return out;
}

module.exports = {
  buildSnapshot,
  setGraphContext,
  clearGraphContext,
  readGraphContext,
  pointerPath,
};

if (require.main === module) {
  // CLI: graph-context-bridge.js set <repo> <nodes> [edges] [--repo-size=N] [--unresolved]
  //      graph-context-bridge.js clear
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'set') {
    const flags = rest.filter((a) => a.startsWith('--'));
    const pos = rest.filter((a) => !a.startsWith('--'));
    const [repo, nodes, edges] = pos;
    const repoSizeFlag = flags.find((f) => f.startsWith('--repo-size='));
    const ok = setGraphContext({
      repo,
      nodes,
      edges,
      repo_size: repoSizeFlag ? repoSizeFlag.split('=')[1] : undefined,
      resolved: !flags.includes('--unresolved'),
    });
    process.exit(ok ? 0 : 1);
  }
  if (cmd === 'clear') process.exit(clearGraphContext() ? 0 : 1);
  process.stderr.write('usage: graph-context-bridge.js set <repo> <nodes> [edges] [--repo-size=N] [--unresolved] | clear\n');
  process.exit(2);
}
