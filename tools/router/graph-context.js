#!/usr/bin/env node
/**
 * graph-context.js — Wave 66 Block 3 (the real saving).
 *
 * Downstream of classify.js (FROZEN) and every guardrail, on the full-hint path of
 * inject_context.js. Reads the graph breadcrumb written by graph-context-bridge.js
 * (Block 2) and, when a code knowledge graph is resolved for this repo:
 *
 *   (a) annotates `decision.graph_context` so inject_context can emit a
 *       <graph-context> block telling Claude Code it may query the graph
 *       (query_graph / get_neighbors / shortest_path) INSTEAD of grepping every
 *       file — that context reduction is the real token saving (advisory).
 *   (b) appends '+graph_resolved' to `decision.escalation_rule` for explainability
 *       (the "why" of the routing decision stays explicit).
 *
 * It NEVER changes the tier. Model/tier biasing on graph-resolved context is
 * deliberately deferred to 66.C (graph-aware-decide.ts). Because this layer cannot
 * lower any tier, the HIGH_RISK hard floor is trivially intact — deploy/secrets/
 * migrations stay T3 no matter what the breadcrumb says.
 *
 * Honesty: the token-saving figure is a CONSERVATIVE, repo-size-banded ADVISORY
 * estimate (never guaranteed; gated before publication — see WAVE66_DAY0_RECON.md
 * §§2,5 and the architecture brief §E). Below the announce threshold (<100 source
 * files) or when the repo size is unknown, the estimate is 0 — we never claim a
 * saving we cannot stand behind.
 *
 * Best-effort: every path is wrapped so a broken breadcrumb never blocks the hook.
 */
'use strict';

// Below this source-file count the graph saving is ~nil (DAY0 recon §2): annotate
// only as a navigation aid, but never attach a non-zero saving estimate.
const REPO_THRESHOLD = 100;

let bridge;
try { bridge = require('./graph-context-bridge.js'); } catch { bridge = null; }

/**
 * Conservative ADVISORY estimate of context tokens NOT loaded because the graph
 * answers structurally instead of via grep. Documented, reproducible, deliberately
 * low; banded to the brief's honest curve. Returns 0 below threshold / unknown.
 * @param {unknown} repoSize source-file count the graph was built over
 */
function estimateTokensSaved(repoSize) {
  const n = Number(repoSize);
  if (!Number.isFinite(n) || n < REPO_THRESHOLD) return 0;
  if (n < 500) return 2000;  // 100–500 files (brief band: 6–15× context reduction)
  return 4000;               // 500+ files (brief band: 30×+) — still conservative
}

/**
 * Pure: project a breadcrumb snapshot into a usable graph context, or null when it
 * is absent / unresolved / carries no nodes. Only counts are used; never symbols.
 * @param {any} snap GraphContextSnapshot from graph-context-bridge.readGraphContext
 */
function resolveGraphContext(snap) {
  if (!snap || typeof snap !== 'object') return null;
  const nodes = Number(snap.nodes);
  if (!Number.isFinite(nodes) || nodes <= 0) return null;
  if (snap.resolved === false) return null; // graph exists but not current for cwd
  const repo = typeof snap.repo === 'string' && snap.repo.trim().length ? snap.repo.trim() : null;
  if (repo === null) return null;
  const ctx = { repo, nodes, tokens_saved_est: estimateTokensSaved(snap.repo_size) };
  if (Number.isFinite(Number(snap.repo_size))) ctx.repo_size = Number(snap.repo_size);
  return ctx;
}

/**
 * Annotate a decision with graph context (mutates + returns it). Best-effort: any
 * failure leaves the decision untouched. NEVER changes the tier.
 * @param {Record<string, any>} decision
 * @param {{ snapshot?: any, pointerPath?: string }} [opts] inject a snapshot in tests
 */
function applyGraphContext(decision, opts = {}) {
  try {
    if (!decision || typeof decision !== 'object') return decision;
    const snap = opts.snapshot !== undefined
      ? opts.snapshot
      : (bridge && typeof bridge.readGraphContext === 'function'
        ? bridge.readGraphContext({ pointerPath: opts.pointerPath })
        : null);
    const ctx = resolveGraphContext(snap);
    if (!ctx) return decision; // no graph → decision byte-identical
    decision.graph_context = ctx;
    decision.escalation_rule =
      decision.escalation_rule && decision.escalation_rule !== 'none'
        ? `${decision.escalation_rule}+graph_resolved`
        : 'graph_resolved';
    return decision;
  } catch {
    return decision; // never block the hook
  }
}

/**
 * Pure: render the <graph-context> block lines for a decision's graph_context, or
 * [] when absent. The block is a sibling of <router-hint> (the hint stays intact).
 * @param {Record<string, any>} decision
 * @returns {string[]}
 */
function renderGraphContextBlock(decision) {
  const ctx = decision && decision.graph_context;
  if (!ctx || typeof ctx !== 'object') return [];
  const repoSize = Number.isFinite(Number(ctx.repo_size)) ? ` · ficheiros=${Number(ctx.repo_size)}` : '';
  return [
    '',
    '<graph-context>',
    `nós=${ctx.nodes} · resolved=true · repo=${ctx.repo}${repoSize}`,
    'A code knowledge graph is available for this repo — prefer querying it',
    '(query_graph / get_neighbors / shortest_path) over grepping every file.',
    '</graph-context>',
  ];
}

module.exports = {
  REPO_THRESHOLD,
  estimateTokensSaved,
  resolveGraphContext,
  applyGraphContext,
  renderGraphContextBlock,
};
