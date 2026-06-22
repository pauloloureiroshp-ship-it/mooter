// graph-aware-decide.test.ts — Wave 66 Block 4 (66.C) DoD. NEW FILE (addition).
// Run: cd packages/router && npx tsx --test tests/graph-aware-decide.test.ts
//
// Boundary under test: graphAwareDecide shapes the `args` for decideAgent when a
// resolved graph proves a LOCALIZED, non-risky task — same tier, cheaper model.
// It NEVER imports/edits classify.js or decide-agent.ts (decide-agent stays
// byte-identical; proved at repo level by sha). The Leiden community schema is
// the one fixed against the verified official source (safishamsi/graphify,
// callflow_html.py::normalize_node). Pure, never throws, never mutates `args`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideAgent, type DecideAgentArgs } from "../src/decide-agent.ts";
import {
  graphAwareDecide,
  buildGraphSignal,
  countAffectedCommunities,
  readNodeCommunityMap,
  communityOfNode,
  nodeId,
  graphEdges,
  GRAPH_COMMUNITY_KEYS,
  LOCALIZED_MAX_COMMUNITIES,
  LOCALIZED_COST_TIGHTEN,
  type GraphSignal,
} from "../src/graph-aware-decide.ts";

// A small node-link graph.json shaped exactly like the official producer's
// output: id + node-level `community`, edges under the legacy "links" key.
const GRAPH = {
  directed: true,
  multigraph: false,
  nodes: [
    { id: "auth.login", community: "0", type: "function", source_file: "auth.py" },
    { id: "auth.logout", community: "0", type: "function", source_file: "auth.py" },
    { id: "billing.charge", community: "1", type: "function", source_file: "billing.py" },
    { id: "util.noise", type: "function", source_file: "util.py" }, // no community → "unknown"
  ],
  links: [
    { source: "auth.login", target: "auth.logout", relation: "calls" },
    { source: "auth.login", target: "billing.charge", relation: "calls" },
  ],
};

// ---------------------------------------------------------------------------
// Fixed schema readers (verified official source)
// ---------------------------------------------------------------------------

describe("schema readers — fixed against official graphify normalizer", () => {
  test("nodeId resolves the canonical id variants", () => {
    assert.equal(nodeId({ id: "x" }), "x");
    assert.equal(nodeId({ qualified_name: "pkg.fn" }), "pkg.fn");
    assert.equal(nodeId({}), null);
    assert.equal(nodeId(null), null);
  });

  test("communityOfNode accepts every community key variant", () => {
    for (const k of GRAPH_COMMUNITY_KEYS) {
      assert.equal(communityOfNode({ [k]: "7" }), "7", `key ${k}`);
    }
    // "unknown" sentinel and absence both mean no resolved community.
    assert.equal(communityOfNode({ community: "unknown" }), null);
    assert.equal(communityOfNode({}), null);
  });

  test("graphEdges accepts both links (legacy) and edges (recent)", () => {
    assert.equal(graphEdges({ links: [1, 2] }).length, 2);
    assert.equal(graphEdges({ edges: [1] }).length, 1);
    assert.equal(graphEdges({}).length, 0);
    assert.equal(graphEdges(null).length, 0);
  });

  test("readNodeCommunityMap uses node-level attrs, ignores 'unknown'", () => {
    const m = readNodeCommunityMap(GRAPH);
    assert.equal(m.get("auth.login"), "0");
    assert.equal(m.get("billing.charge"), "1");
    assert.equal(m.has("util.noise"), false); // unknown → not mapped
  });

  test("readNodeCommunityMap falls back to a top-level communities map", () => {
    const g = {
      nodes: [{ id: "a" }, { id: "b" }],
      links: [],
      communities: { "5": ["a"], "6": ["b"], unknown: ["c"] },
    };
    const m = readNodeCommunityMap(g);
    assert.equal(m.get("a"), "5");
    assert.equal(m.get("b"), "6");
    assert.equal(m.has("c"), false); // unknown community ignored
  });

  test("countAffectedCommunities counts distinct resolved communities only", () => {
    assert.equal(countAffectedCommunities(GRAPH, ["auth.login", "auth.logout"]), 1);
    assert.equal(countAffectedCommunities(GRAPH, ["auth.login", "billing.charge"]), 2);
    assert.equal(countAffectedCommunities(GRAPH, ["util.noise"]), 0); // unresolved
    assert.equal(countAffectedCommunities(GRAPH, []), 0);
  });

  test("readers never throw on garbage", () => {
    assert.doesNotThrow(() => readNodeCommunityMap("nope" as unknown));
    assert.doesNotThrow(() => countAffectedCommunities(undefined, ["x"]));
    assert.doesNotThrow(() => buildGraphSignal(null, ["x"], true, false));
  });
});

// ---------------------------------------------------------------------------
// The wrapper — pass-through vs localized bias
// ---------------------------------------------------------------------------

const ARGS: DecideAgentArgs = { task_category: "coding.backend", min_score: 0 };

describe("graphAwareDecide — pass-through (bias skipped)", () => {
  test("no signal → identical to decideAgent(args), bias skipped", () => {
    const base = decideAgent(ARGS);
    const r = graphAwareDecide(ARGS);
    assert.equal(r.graph_bias, "skipped");
    assert.equal(r.chosen_model, base.chosen_model);
    assert.deepEqual(r.alternatives, base.alternatives);
  });

  test("graph not resolved → bias skipped", () => {
    const r = graphAwareDecide(ARGS, { resolved: false, affected_communities: 1, high_risk: false });
    assert.equal(r.graph_bias, "skipped");
    assert.match(r.graph_bias_reason, /not resolved/i);
  });

  test("task spans > 2 communities → not localized → bias skipped", () => {
    const r = graphAwareDecide(ARGS, { resolved: true, affected_communities: 3, high_risk: false });
    assert.equal(r.graph_bias, "skipped");
    assert.equal(r.chosen_model, decideAgent(ARGS).chosen_model);
  });

  test("DOCTRINE: HIGH_RISK + localized → bias FORBIDDEN, decided on caller args", () => {
    const signal: GraphSignal = { resolved: true, affected_communities: 1, high_risk: true };
    const r = graphAwareDecide(ARGS, signal);
    assert.equal(r.graph_bias, "skipped");
    assert.match(r.graph_bias_reason, /HIGH_RISK/);
    // Must equal the un-biased decision (no prefer_local sneaking in).
    assert.deepEqual(r.chosen_model, decideAgent(ARGS).chosen_model);
  });
});

describe("graphAwareDecide — localized bias applied", () => {
  test("resolved + 1 community + not high_risk → prefer_local applied", () => {
    const signal: GraphSignal = { resolved: true, affected_communities: 1, high_risk: false };
    const r = graphAwareDecide(ARGS, signal);
    assert.equal(r.graph_bias, "applied");
    assert.match(r.graph_bias_reason, /localized to 1 Leiden/);
    // Equivalent to decideAgent with prefer_local turned on — the wrapper's only lever.
    assert.deepEqual(r.chosen_model, decideAgent({ ...ARGS, prefer_local: true }).chosen_model);
  });

  test("a caller budget is tightened by the localized factor", () => {
    const withCap: DecideAgentArgs = { ...ARGS, max_cost_usd: 1.0 };
    const r = graphAwareDecide(withCap, { resolved: true, affected_communities: 2, high_risk: false });
    assert.equal(r.graph_bias, "applied");
    assert.match(r.graph_bias_reason, new RegExp(`\\$${LOCALIZED_COST_TIGHTEN}/1k`));
  });

  test("boundary: exactly LOCALIZED_MAX_COMMUNITIES is still localized", () => {
    const r = graphAwareDecide(ARGS, {
      resolved: true,
      affected_communities: LOCALIZED_MAX_COMMUNITIES,
      high_risk: false,
    });
    assert.equal(r.graph_bias, "applied");
  });
});

describe("graphAwareDecide — purity", () => {
  test("never mutates the caller's args", () => {
    const args: DecideAgentArgs = { task_category: "coding.backend", min_score: 0, max_cost_usd: 1.0 };
    const snapshot = JSON.stringify(args);
    graphAwareDecide(args, { resolved: true, affected_communities: 1, high_risk: false });
    assert.equal(JSON.stringify(args), snapshot, "args must be unchanged");
    assert.equal(args.prefer_local, undefined, "prefer_local must not leak onto caller args");
  });

  test("never throws on a bad signal", () => {
    assert.doesNotThrow(() => graphAwareDecide(ARGS, { resolved: true } as unknown as GraphSignal));
    assert.doesNotThrow(() => graphAwareDecide(ARGS, null));
  });
});
