// decide-agent-learned.test.ts — Wave 58 (A.12) wiring DoD.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Contract under test: decideAgent gains an OPT-IN `use_learned` flag that
// layers the adaptive-learner's local overrides ON TOP of the cited baseline
// matrix. The two brand-critical invariants:
//   1. DEFAULT-OFF is byte-identical to the pre-wiring engine (no override layer,
//      getCell used directly) — proven by deep-equality against the plain call.
//   2. When an override wins the chosen cell, provenance flips to
//      "adaptive-learned" (NEVER a fabricated benchmark name).
// Overrides are INJECTED here (no filesystem dependency) so the tests are
// deterministic; one test also exercises the real file-read path via a temp file.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideAgent } from "../src/decide-agent.ts";
import { TASK_CATEGORIES } from "../src/task-categories.ts";
import { LEARNED_SOURCE, MIN_DATAPOINTS, type LearnedCell } from "../src/adaptive-learner.ts";

// A category the seed matrix actually measures, so the baseline call chooses a
// model (giving us a concrete cell whose provenance we can watch flip).
const CAT = "coding.backend";

function learnedCell(model: string, category: string, score: number): LearnedCell {
  return {
    model,
    category,
    score,
    source: LEARNED_SOURCE,
    measured: true,
    confidence: "low",
    datapoints: MIN_DATAPOINTS,
    as_of: "2026-07-04T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Invariant 1 — DEFAULT-OFF is identical to the pre-wiring engine.
// ---------------------------------------------------------------------------

describe("decideAgent use_learned — default-off is byte-identical", () => {
  test("omitting use_learned equals use_learned:false", () => {
    const omitted = decideAgent({ task_category: CAT, min_score: 0 });
    const explicitFalse = decideAgent({ task_category: CAT, min_score: 0, use_learned: false });
    assert.deepEqual(explicitFalse, omitted);
  });

  test("use_learned:true with an EMPTY override set equals the plain call", () => {
    // getLearnedCell falls back to getCell for every cell → no observable change.
    const base = decideAgent({ task_category: CAT, min_score: 0 });
    const emptyLearned = decideAgent({
      task_category: CAT,
      min_score: 0,
      use_learned: true,
      overrides: [],
    });
    assert.deepEqual(emptyLearned, base);
  });

  test("an override is IGNORED when use_learned is not set", () => {
    const base = decideAgent({ task_category: CAT, min_score: 0 });
    // Pass a strong override but DON'T flip use_learned → must be inert.
    const ignored = decideAgent({
      task_category: CAT,
      min_score: 0,
      overrides: [learnedCell("claude-opus-4-7", CAT, 0.99)],
    });
    assert.deepEqual(ignored, base);
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — a winning override flips provenance to "adaptive-learned".
// ---------------------------------------------------------------------------

describe("decideAgent use_learned — a winning override is honestly sourced", () => {
  test("overriding the chosen model's cell flips cited_source to adaptive-learned", () => {
    const base = decideAgent({ task_category: CAT, min_score: 0 });
    // Only meaningful when the baseline actually chose a priceable model.
    if (base.chosen_model === null) return;

    const learned = decideAgent({
      task_category: CAT,
      min_score: 0,
      use_learned: true,
      // Boost the already-chosen model → it stays chosen, but now via a learned cell.
      overrides: [learnedCell(base.chosen_model, CAT, 0.99)],
    });

    assert.equal(learned.chosen_model, base.chosen_model, "high learned score keeps the pick");
    assert.equal(learned.cited_source, LEARNED_SOURCE, "provenance must be the learned tag");
    assert.match(learned.reason, /adaptive-learned/, "reason cites the learned source");
    // NEVER surfaced as a vendor benchmark name.
    assert.notEqual(learned.cited_source, base.cited_source);
  });

  test("a learned score is a real number in [0,1] — never fabricated out of range", () => {
    const learned = decideAgent({
      task_category: CAT,
      min_score: 0,
      use_learned: true,
      overrides: [learnedCell("claude-opus-4-7", CAT, 0.88)],
    });
    for (const a of learned.alternatives) {
      assert.ok(
        a.score === null || (typeof a.score === "number" && a.score >= 0 && a.score <= 1),
        `score out of range for ${a.model}: ${a.score}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The real file-read path (resolveOverrides → readOverrides) is reachable.
// ---------------------------------------------------------------------------

describe("decideAgent use_learned — reads overrides from disk when not injected", () => {
  test("overrides_path is honoured and shapes the decision", () => {
    const dir = mkdtempSync(join(tmpdir(), "mooter-learned-"));
    const path = join(dir, "specialization-overrides.json");
    try {
      const base = decideAgent({ task_category: CAT, min_score: 0 });
      if (base.chosen_model === null) return;
      writeFileSync(
        path,
        JSON.stringify({
          version: 1,
          generated_at: "2026-07-04T00:00:00.000Z",
          alpha: 0.3,
          min_datapoints: MIN_DATAPOINTS,
          cells: [learnedCell(base.chosen_model, CAT, 0.99)],
        }),
      );
      const learned = decideAgent({
        task_category: CAT,
        min_score: 0,
        use_learned: true,
        overrides_path: path,
      });
      assert.equal(learned.cited_source, LEARNED_SOURCE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
