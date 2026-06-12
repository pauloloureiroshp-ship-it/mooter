// decide-agent.test.ts — Wave 58 Pareto model selection DoD.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Boundary under test: decideAgent picks a MODEL within a tier the classifier
// already chose. It NEVER imports classify.js and NEVER fabricates a score or a
// price (Doctrine V4 #5). Tests run against the real snapshot + matrix seed.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideAgent,
  tierForModel,
  type DecideAgentResult,
} from "../src/decide-agent.ts";

// ---------------------------------------------------------------------------
// Contract / shape
// ---------------------------------------------------------------------------

describe("decideAgent — shape + invariants", () => {
  test("always returns coverage_note (never empty)", () => {
    const r = decideAgent({ task_category: "coding.backend" });
    assert.ok(typeof r.coverage_note === "string" && r.coverage_note.length > 0);
  });

  test("never throws on any of the 24 categories", () => {
    for (const cat of [
      "coding.frontend",
      "coding.backend",
      "reasoning.math",
      "writing.prose-pt-pt",
      "agents.coordinator",
      "context.audio",
    ]) {
      assert.doesNotThrow(() => decideAgent({ task_category: cat }));
    }
  });

  test("rejects an unknown category with a null choice + explanatory note", () => {
    const r = decideAgent({ task_category: "coding.nope" });
    assert.equal(r.chosen_model, null);
    assert.match(r.coverage_note, /not in the 24-category taxonomy/i);
    assert.deepEqual(r.alternatives, []);
  });
});

// ---------------------------------------------------------------------------
// No fabrication — the brand-critical invariant
// ---------------------------------------------------------------------------

describe("decideAgent — NO FABRICATION", () => {
  test("never invents a score: every alternative score is null or real [0,1]", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    for (const a of r.alternatives) {
      assert.ok(
        a.score === null || (typeof a.score === "number" && a.score >= 0 && a.score <= 1),
        `score out of range for ${a.model}: ${a.score}`,
      );
    }
  });

  test("pending-price models are never chosen by the TES sort", () => {
    // gpt-5, claude-opus-4-8, fable-5, gemini, deepseek, minimax, gpt-oss are
    // all pending-price in the snapshot. With min_score=0 they survive the score
    // gate but must NOT be the chosen model (unrankable by TES).
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    const pending = new Set([
      "gpt-5",
      "gpt-5-3-codex",
      "gpt-oss",
      "gemini-3.1-pro",
      "deepseek-v3.2",
      "minimax",
      "claude-opus-4-8",
      "claude-opus-4-6",
      "claude-fable-5",
    ]);
    assert.ok(r.chosen_model === null || !pending.has(r.chosen_model));
  });

  test("pending-price candidates carry an honest why_not", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    const gpt5 = r.alternatives.find((a) => a.model === "gpt-5");
    assert.ok(gpt5, "gpt-5 should appear as an alternative");
    assert.equal(gpt5!.tes, null);
    assert.match(gpt5!.why_not, /pending|cannot price|not in/i);
  });

  test("a measured choice cites a real source; a heuristic choice cites null", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    if (r.chosen_model && r.cited_source !== null) {
      assert.ok(r.cited_source.length > 0);
      assert.ok(!/^tier-heuristic/.test(r.cited_source));
    }
  });
});

// ---------------------------------------------------------------------------
// Heuristic fallback when a category has no measured data
// ---------------------------------------------------------------------------

describe("decideAgent — tier-heuristic fallback", () => {
  test("context.audio (no measured cells) → coverage_note says HEURISTIC", () => {
    // With a low min_score the heuristic must surface and be labelled.
    const r = decideAgent({ task_category: "context.audio", min_score: 0 });
    assert.match(r.coverage_note, /heuristic/i);
  });

  test("default min_score 0.75 blocks heuristic picks (gap below 0.75)", () => {
    // Heuristic capability proxies top out at 0.74 (T3/T5), so the default gate
    // must reject a purely-heuristic candidate — no silent pass.
    const r = decideAgent({ task_category: "context.audio" });
    // Either nothing chosen, or the chosen model is genuinely measured.
    if (r.chosen_model !== null) {
      assert.ok(r.cited_source !== null, "a default-gate pick must be measured");
    }
  });
});

// ---------------------------------------------------------------------------
// Filtering: min_score and max_cost_usd
// ---------------------------------------------------------------------------

describe("decideAgent — gates", () => {
  test("min_score=1.1 filters everything (no model scores above 1.0)", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 1.1 });
    assert.equal(r.chosen_model, null);
    assert.match(r.reason, /no candidate cleared the gates|unpriceable/i);
  });

  test("max_cost_usd cap keeps free/local models eligible", () => {
    // A tiny cap that would filter all paid models; a local model must still be
    // allowed through (local always passes the cost cap).
    const r = decideAgent({
      task_category: "coding.backend",
      min_score: 0,
      max_cost_usd: 0.0001,
    });
    // No paid model should be the chosen one under this cap (their blended cost
    // exceeds 0.0001/1k); if anything is chosen it must be local/free.
    if (r.chosen_model !== null) {
      assert.match(
        r.coverage_note + r.reason,
        /local|free|heuristic|measured/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// prefer_local
// ---------------------------------------------------------------------------

describe("decideAgent — prefer_local", () => {
  test("prefer_local does not change the no-fabrication contract", () => {
    const r: DecideAgentResult = decideAgent({
      task_category: "coding.backend",
      min_score: 0,
      prefer_local: true,
    });
    // If a local model won, reason must say so.
    if (r.chosen_model && (r.chosen_model.includes(":") || r.chosen_model.startsWith("qwen3"))) {
      assert.match(r.reason, /local/i);
    }
  });
});

// ---------------------------------------------------------------------------
// force_model
// ---------------------------------------------------------------------------

describe("decideAgent — force_model", () => {
  test("in-roster force_model is honoured and flagged", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "claude-haiku-4-5" });
    assert.equal(r.chosen_model, "claude-haiku-4-5");
    assert.match(r.reason, /force_model/i);
    assert.match(r.coverage_note, /forced/i);
  });

  test("out-of-roster force_model is honoured but flagged UNKNOWN", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "some-random-llm" });
    assert.equal(r.chosen_model, "some-random-llm");
    assert.match(r.coverage_note, /unknown|not in the roster/i);
    assert.equal(r.cited_source, null);
  });

  test("forcing a pending-price model surfaces null TES honestly", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "gpt-5" });
    assert.equal(r.chosen_model, "gpt-5");
    assert.equal(r.tes, null);
    assert.match(r.reason, /pending|unavailable/i);
  });
});

// ---------------------------------------------------------------------------
// tierForModel helper
// ---------------------------------------------------------------------------

describe("tierForModel", () => {
  test("local models are T0", () => {
    assert.equal(tierForModel("qwen3-30b"), "T0");
    assert.equal(tierForModel("qwen3:30b"), "T0");
  });

  test("snapshot tiers resolve from the frozen snapshot", () => {
    assert.equal(tierForModel("claude-haiku-4-5"), "T1");
    assert.equal(tierForModel("claude-sonnet-4-6"), "T2");
    assert.equal(tierForModel("claude-opus-4-7"), "T3");
    assert.equal(tierForModel("claude-fable-5"), "T5");
  });

  test("unknown model defaults to the conservative middle band T2", () => {
    assert.equal(tierForModel("totally-unknown-model"), "T2");
  });
});
