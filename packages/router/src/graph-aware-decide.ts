// graph-aware-decide.ts — Wave 61 Block 4 (61.C): bias the MODEL within a tier
// when a code knowledge graph proves the task is LOCALIZED. NEW FILE — addition
// only (Wave 58 allowlisted new files under packages/router/src/). It NEVER edits
// or re-implements decide-agent.ts; it only shapes the `args` passed to it.
//
// ── THE BOUNDARY (and the three it does NOT cross) ───────────────────────────
//
//   classify.js (FROZEN)      : prompt → TIER            (untouched)
//   decideAgent (FROZEN-add)  : (category, budget) → MODEL within that tier
//   graphAwareDecide (here)   : (args, graphSignal) → tightens `args`, then calls
//                               decideAgent verbatim. Same tier. Cheaper model
//                               only when the graph says the work is contained.
//
// The saving is NOT a tier downgrade. classify.js already fixed the tier; this
// layer only shops cheaper WITHIN it, and only when a resolved graph shows the
// task touches just 1–2 Leiden communities (a contained refactor needs less
// breadth than a cross-cutting one). On a wider blast radius — or ANY HIGH_RISK
// prompt — the bias is skipped and decideAgent runs on the caller's args
// untouched. Doctrine: never trade quality down on risky work.
//
// ── SCHEMA — fixed against the VERIFIED official source ───────────────────────
//
// The community-field variants below are taken verbatim from the canonical
// normalizer in the official MIT repo github.com/safishamsi/graphify
// (graphify/callflow_html.py::normalize_node, cloned + read 2026-06-21). They are
// NOT guessed: the producer itself accepts any of these keys and a node-level
// `community` is the canonical post-Leiden attribute. The graph.json is NetworkX
// node-link JSON whose edges key is "links" (legacy) or "edges" (recent) — both
// accepted. Every attribute is OPTIONAL and read with a fallback; a missing or
// malformed graph yields an empty map, never a throw (DAY0 recon §1 rule 4).
//
// ── NO FABRICATION (Doctrine V4 #5) ──────────────────────────────────────────
//
// This layer invents no price and no score. The only absolute it introduces is a
// *relative* tightening of a budget the caller already chose (×0.7) — never an
// out-of-nowhere USD cap that could silently filter the legitimate in-tier pick.
// prefer_local only promotes a free local model when it is within 5% TES of the
// top cloud pick (decideAgent's own window), so it cannot crater quality.
//
// Pure module: no I/O, no network, never throws. The hot path takes a precomputed
// community count (cheap); the schema reader (for the offline `mooter graph sync`
// CLI + tests) is where the real graph.json is parsed.

import {
  decideAgent,
  type DecideAgentArgs,
  type DecideAgentResult,
} from "./decide-agent.ts";

// ---------------------------------------------------------------------------
// Fixed schema — community + node-id key variants (verified official source)
// ---------------------------------------------------------------------------

/** Node-id key variants, in the official normalizer's priority order. */
export const GRAPH_NODE_ID_KEYS = [
  "id",
  "node_id",
  "key",
  "uid",
  "name",
  "qualified_name",
  "fqname",
  "symbol",
] as const;

/** Leiden-community key variants, in the official normalizer's priority order.
 *  The producer defaults a missing community to the sentinel "unknown" — which
 *  we treat as "no resolved community" (it never counts toward localization). */
export const GRAPH_COMMUNITY_KEYS = [
  "community",
  "community_id",
  "cluster",
  "cluster_id",
  "group",
  "group_id",
  "modularity_class",
] as const;

/** The producer's sentinel for "node not assigned to a Leiden community". */
const UNKNOWN_COMMUNITY = "unknown";

type GraphNode = Record<string, unknown>;
interface NodeLinkGraph {
  nodes?: unknown;
  links?: unknown;
  edges?: unknown;
  /** Top-level community map: { communityId: [nodeId, ...] }. Either key. */
  communities?: unknown;
  community?: unknown;
}

/** First non-empty stringified value among `keys`, or null. Pure. */
function firstPresent(obj: GraphNode, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s.length) return s;
  }
  return null;
}

/** A node's id under the fixed schema, or null when it carries none. */
export function nodeId(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  return firstPresent(node as GraphNode, GRAPH_NODE_ID_KEYS);
}

/** A node's resolved Leiden community, or null when absent / "unknown". */
export function communityOfNode(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const c = firstPresent(node as GraphNode, GRAPH_COMMUNITY_KEYS);
  if (c === null || c.toLowerCase() === UNKNOWN_COMMUNITY) return null;
  return c;
}

/** The graph's edge list under either NetworkX key (`links` ▸ legacy, `edges` ▸
 *  recent). Always an array (empty when neither is present/valid). Pure. */
export function graphEdges(graph: unknown): unknown[] {
  if (!graph || typeof graph !== "object") return [];
  const g = graph as NodeLinkGraph;
  if (Array.isArray(g.links)) return g.links;
  if (Array.isArray(g.edges)) return g.edges;
  return [];
}

/**
 * Build a `nodeId → communityId` map from a real graph.json, robust to drift:
 *   1. node-level community attribute (the canonical post-Leiden form), then
 *   2. a top-level `communities` / `community` map ({ cid: [nodeIds] }) as a
 *      fallback for producers that keep clustering out-of-band.
 * Tolerant of every shape; unknown/garbage simply contributes nothing.
 * @param graph parsed graph.json (NetworkX node-link)
 */
export function readNodeCommunityMap(graph: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!graph || typeof graph !== "object") return map;
  const g = graph as NodeLinkGraph;

  // (1) node-level community attribute — the canonical form.
  if (Array.isArray(g.nodes)) {
    for (const raw of g.nodes) {
      const id = nodeId(raw);
      if (id === null) continue;
      const c = communityOfNode(raw);
      if (c !== null) map.set(id, c);
    }
  }

  // (2) top-level community map fallback — fill only ids not already resolved.
  const topMap = g.communities ?? g.community;
  if (topMap && typeof topMap === "object" && !Array.isArray(topMap)) {
    for (const [cid, members] of Object.entries(topMap as Record<string, unknown>)) {
      if (!Array.isArray(members)) continue;
      const c = String(cid).trim();
      if (!c.length || c.toLowerCase() === UNKNOWN_COMMUNITY) continue;
      for (const member of members) {
        const id = typeof member === "string" ? member.trim() : nodeId(member);
        if (id && !map.has(id)) map.set(id, c);
      }
    }
  }

  return map;
}

/**
 * Count the DISTINCT resolved Leiden communities a set of affected node ids
 * spans. Nodes with no resolved community are ignored (never inflate the count).
 * 0 when nothing resolves → caller treats that as "not localized".
 * @param graph parsed graph.json
 * @param affectedNodeIds ids the task touches (from impact analysis / grep map)
 */
export function countAffectedCommunities(
  graph: unknown,
  affectedNodeIds: readonly string[],
): number {
  if (!Array.isArray(affectedNodeIds) || affectedNodeIds.length === 0) return 0;
  const byNode = readNodeCommunityMap(graph);
  const seen = new Set<string>();
  for (const id of affectedNodeIds) {
    if (typeof id !== "string") continue;
    const c = byNode.get(id.trim());
    if (c) seen.add(c);
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// The graph signal + the wrapper
// ---------------------------------------------------------------------------

/** The downstream-of-classify graph signal consumed by graphAwareDecide. All
 *  fields are precomputed (cheap) so the hot path never parses graph.json. */
export interface GraphSignal {
  /** A code knowledge graph is resolved & current for this repo (Block 3). */
  resolved: boolean;
  /** Distinct Leiden communities the task touches (countAffectedCommunities). */
  affected_communities: number;
  /** classify.js HIGH_RISK floor fired — bias is forbidden (no downgrade). */
  high_risk: boolean;
}

export interface GraphAwareResult extends DecideAgentResult {
  /** Whether the graph localized-task bias was applied to decideAgent's args. */
  graph_bias: "applied" | "skipped";
  /** Human-readable why — explicit for explainability (Part D). */
  graph_bias_reason: string;
}

/** A task is "localized" when it touches 1–2 Leiden communities. Above that the
 *  blast radius is wide enough to want full in-tier capability — no cheap-out. */
const LOCALIZED_MAX_COMMUNITIES = 2;
/** Relative tightening of a caller-supplied budget for a localized task. Never
 *  an absolute USD cap (that could over-filter); only squeezes an existing one. */
const LOCALIZED_COST_TIGHTEN = 0.7;

/** True only when a resolved graph proves a contained, non-risky task. */
function isLocalizedBiasEligible(signal: GraphSignal | null | undefined): signal is GraphSignal {
  if (!signal || typeof signal !== "object") return false;
  if (signal.resolved !== true) return false;
  if (signal.high_risk === true) return false; // doctrine: never downgrade HIGH_RISK
  const n = signal.affected_communities;
  return Number.isInteger(n) && n >= 1 && n <= LOCALIZED_MAX_COMMUNITIES;
}

/**
 * Graph-aware model selection. When (and only when) a resolved graph shows the
 * task is localized AND the prompt is not HIGH_RISK, tighten `args`
 * (prefer_local + a squeezed budget) and defer to decideAgent. Otherwise call
 * decideAgent on the caller's args verbatim. Pure; never mutates `args`; never
 * throws (decideAgent's own contract); never changes the tier or category.
 *
 * @param args the caller's DecideAgentArgs (tier/category already fixed upstream)
 * @param signal optional graph signal; absent/unresolved ⇒ pass-through
 */
export function graphAwareDecide(
  args: DecideAgentArgs,
  signal?: GraphSignal | null,
): GraphAwareResult {
  if (!isLocalizedBiasEligible(signal)) {
    const reason = !signal || typeof signal !== "object"
      ? "no graph signal — decided on caller args unchanged"
      : signal.resolved !== true
        ? "graph not resolved for this repo — no bias"
        : signal.high_risk === true
          ? "HIGH_RISK prompt — bias forbidden (doctrine: never downgrade), decided on caller args unchanged"
          : `task spans ${signal.affected_communities} communities (not 1–${LOCALIZED_MAX_COMMUNITIES}-localized) — no bias`;
    return { ...decideAgent(args), graph_bias: "skipped", graph_bias_reason: reason };
  }

  // Localized + safe: shop cheaper within the same tier.
  const biased: DecideAgentArgs = { ...args, prefer_local: true };
  if (typeof args.max_cost_usd === "number" && Number.isFinite(args.max_cost_usd)) {
    biased.max_cost_usd = Number((args.max_cost_usd * LOCALIZED_COST_TIGHTEN).toFixed(6));
  }
  const capNote = biased.max_cost_usd !== undefined
    ? `, budget tightened to $${biased.max_cost_usd}/1k`
    : "";
  return {
    ...decideAgent(biased),
    graph_bias: "applied",
    graph_bias_reason:
      `graph-resolved + localized to ${signal.affected_communities} Leiden ` +
      `community${signal.affected_communities === 1 ? "" : "ies"} → prefer_local${capNote} ` +
      `(same tier; advisory)`,
  };
}

/**
 * Convenience: derive a GraphSignal from a real graph.json + the impact set.
 * Used by the offline `mooter graph sync` CLI and tests — NOT the hot path.
 * @param graph parsed graph.json (NetworkX node-link)
 * @param affectedNodeIds ids the task touches
 * @param resolved whether the breadcrumb marks the graph current for cwd
 * @param highRisk classify.js HIGH_RISK floor state
 */
export function buildGraphSignal(
  graph: unknown,
  affectedNodeIds: readonly string[],
  resolved: boolean,
  highRisk: boolean,
): GraphSignal {
  return {
    resolved: resolved === true,
    affected_communities: countAffectedCommunities(graph, affectedNodeIds),
    high_risk: highRisk === true,
  };
}

export { LOCALIZED_MAX_COMMUNITIES, LOCALIZED_COST_TIGHTEN };
