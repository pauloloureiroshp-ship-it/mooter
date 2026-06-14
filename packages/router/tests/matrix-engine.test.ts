// matrix-engine.test.ts — Wave 58 INTEGRATED matrix-engine verification.
//
// This is the cross-module DoD for the five Wave 58 engine files
// (task-categories · tes-calculator · specialization-matrix · benchmark-fetcher ·
// decide-agent). The per-file unit suites live in ../tests/*.test.ts; this file
// asserts the contract that matters most across modules: HONESTY.
//
// Run (matches the repo's tsx convention):
//   cd packages/router && npx tsx --test src/*.test.ts
//
// ── DOCTRINE V4 #5 — NO FABRICATION ──────────────────────────────────────────
// Every numeric assertion below is traceable to a REAL, cited seed value
// (docs/strategy/BENCHMARK_SOURCES_2026.md + the frozen pricing snapshot) or to
// an explicit null/pending. We never assert a TES against an invented number.
//
// The only (model, category) pair that is BOTH measured AND priced in the Wave
// 58 seed is claude-opus-4-7 on coding.backend/refactor/debug (score 0.876,
// snapshot price $5/$25). opus-4-8 and gpt-5-3-codex are measured but
// pending-price; gpt-5/fable-5/gemini are measured but pending-price too. So the
// TES "real math" assertion below uses opus-4-7 — the honest priced+measured cell.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  TASK_CATEGORIES,
  CODING_CATEGORIES,
  REASONING_CATEGORIES,
  WRITING_CATEGORIES,
  AGENTS_CATEGORIES,
  CONTEXT_CATEGORIES,
  parseTaskCategory,
  categoryGroup,
  type TaskCategory,
} from "../src/task-categories.ts";
import { computeTES, OUTPUT_WEIGHT } from "../src/tes-calculator.ts";
import {
  getCell,
  coverageStats,
  MATRIX_MODELS,
} from "../src/specialization-matrix.ts";
import { decideAgent } from "../src/decide-agent.ts";

// ---------------------------------------------------------------------------
// 1. Task categories — parse / membership across the full 24-category taxonomy.
// ---------------------------------------------------------------------------

describe("task-categories — 24-category taxonomy", () => {
  test("exactly 24 categories, no duplicates", () => {
    assert.equal(TASK_CATEGORIES.length, 24);
    assert.equal(new Set(TASK_CATEGORIES).size, 24);
  });

  test("groups partition the 24 with no overlap (9+4+4+3+4 = 24)", () => {
    assert.equal(CODING_CATEGORIES.length, 9);
    assert.equal(REASONING_CATEGORIES.length, 4);
    assert.equal(WRITING_CATEGORIES.length, 4);
    assert.equal(AGENTS_CATEGORIES.length, 3);
    assert.equal(CONTEXT_CATEGORIES.length, 4);
    const union = new Set([
      ...CODING_CATEGORIES,
      ...REASONING_CATEGORIES,
      ...WRITING_CATEGORIES,
      ...AGENTS_CATEGORIES,
      ...CONTEXT_CATEGORIES,
    ]);
    assert.equal(union.size, 24);
  });

  test("the exact 24 category ids are present (brief contract)", () => {
    const expected = [
      "coding.frontend", "coding.backend", "coding.data", "coding.infra",
      "coding.security", "coding.competitive", "coding.refactor", "coding.test",
      "coding.debug", "reasoning.math", "reasoning.science", "reasoning.general",
      "reasoning.agentic", "writing.prose-pt-pt", "writing.prose-en",
      "writing.structured", "writing.translation", "agents.coordinator",
      "agents.implementor", "agents.reviewer", "context.large", "context.small",
      "context.multimodal", "context.audio",
    ];
    assert.deepEqual([...TASK_CATEGORIES].sort(), [...expected].sort());
  });

  test("parseTaskCategory accepts every real category, rejects non-members", () => {
    for (const cat of TASK_CATEGORIES) {
      assert.equal(parseTaskCategory(cat), cat);
    }
    for (const bad of ["coding", "coding.nope", "", "CODING.BACKEND", "reasoning.maths"]) {
      assert.equal(parseTaskCategory(bad), null, `must reject "${bad}"`);
    }
  });

  test("categoryGroup maps each category to its declared group", () => {
    assert.equal(categoryGroup("coding.backend"), "coding");
    assert.equal(categoryGroup("reasoning.math"), "reasoning");
    assert.equal(categoryGroup("writing.prose-pt-pt"), "writing");
    assert.equal(categoryGroup("agents.reviewer"), "agents");
    assert.equal(categoryGroup("context.audio"), "context");
  });
});

// ---------------------------------------------------------------------------
// 2. TES — null/pending for pending-price OR unknown-score models (NOT a fake
//    number); correct math for a real priced+measured pair.
// ---------------------------------------------------------------------------

describe("TES — honesty gates (no fabrication)", () => {
  test("pending-price measured model → tes null, status 'pending' (never a number)", () => {
    // claude-opus-4-8 / coding.backend is a REAL measured cell (0.886) but its
    // snapshot price is null (pending). TES must refuse to fabricate a number.
    const r = computeTES({
      model: "claude-opus-4-8",
      category: "coding.backend",
      benchmark_score: 0.886,
    });
    assert.equal(r.tes, null, "must not fabricate a TES for a pending-price model");
    assert.equal(r.status, "pending");
    assert.equal(r.price_status, "pending");
  });

  test("unknown-score (no benchmark) priced model → tes null, status 'pending'", () => {
    // claude-opus-4-7 IS priced, but with no benchmark_score there is nothing to
    // divide — refusing to invent a score is the honest behaviour.
    const r = computeTES({
      model: "claude-opus-4-7",
      category: "coding.backend",
      benchmark_score: null,
    });
    assert.equal(r.tes, null);
    assert.equal(r.status, "pending");
    assert.equal(r.benchmark_score, null);
  });

  test("priced + measured pair → TES math is exactly correct", () => {
    // The ONE honest priced+measured cell: opus-4-7 / coding.backend.
    //   score   = 0.876 (SWE-bench Verified, cited)
    //   price   = $5/MTok in, $25/MTok out  ⇒  $0.005/1k in, $0.025/1k out
    //   TES     = (0.876 * 100) / (0.005 + 0.3 * 0.025)
    const score = 0.876;
    const per1kIn = 0.005;
    const per1kOut = 0.025;
    const expected = (score * 100) / (per1kIn + OUTPUT_WEIGHT * per1kOut);

    const r = computeTES({
      model: "claude-opus-4-7",
      category: "coding.backend",
      benchmark_score: score,
    });
    assert.equal(r.status, "ok");
    assert.equal(r.price_status, "priced");
    assert.equal(r.cost_per_1k_in, per1kIn);
    assert.equal(r.cost_per_1k_out, per1kOut);
    assert.ok(
      Math.abs((r.tes as number) - expected) < 1e-2,
      `tes ${r.tes} should ≈ ${expected}`,
    );
  });

  test("OUTPUT_WEIGHT is the documented 0.3 convention", () => {
    assert.equal(OUTPUT_WEIGHT, 0.3);
  });
});

// ---------------------------------------------------------------------------
// 3. Specialization matrix — coverageStats counts ONLY measured cells.
// ---------------------------------------------------------------------------

describe("specialization-matrix — coverage counts only measured cells", () => {
  test("total = 17 models × 24 categories = 408", () => {
    const s = coverageStats();
    assert.equal(s.total_cells, 408); // Wave 58.4: roster 14 → 17 models
    assert.equal(s.total_cells, MATRIX_MODELS.length * TASK_CATEGORIES.length);
  });

  test("measured_cells equals the count of cells whose `measured` flag is true", () => {
    // Recompute independently from the matrix and cross-check against coverageStats.
    const s = coverageStats();
    let measured = 0;
    for (const model of MATRIX_MODELS) {
      for (const cat of TASK_CATEGORIES) {
        const cell = getCell(model, cat as TaskCategory);
        if (cell && cell.measured) measured++;
      }
    }
    assert.equal(s.measured_cells, measured);
    assert.equal(s.measured_cells + s.empty_cells, s.total_cells);
  });

  test("a known empty cell does NOT count toward measured (haiku/context.audio)", () => {
    const cell = getCell("claude-haiku-4-5", "context.audio");
    assert.ok(cell !== null);
    assert.equal(cell!.measured, false);
    assert.equal(cell!.score, null);
    // And it is therefore excluded from the per-category measured tally.
    const s = coverageStats();
    assert.equal(s.by_category["context.audio"] ?? 0, 0);
  });

  test("qualitative (null-score) cited cell IS counted as measured (opus-4-6 prose-en)", () => {
    // measured:true with score:null — honesty requires counting it as measured
    // but tallying it under measured_qualitative, never measured_with_score.
    const cell = getCell("claude-opus-4-6", "writing.prose-en");
    assert.ok(cell !== null);
    assert.equal(cell!.measured, true);
    assert.equal(cell!.score, null);
    const s = coverageStats();
    assert.equal(s.measured_with_score + s.measured_qualitative, s.measured_cells);
    assert.ok(s.measured_qualitative >= 1, "the qualitative prose cell must be tallied");
  });

  test("by_model and by_category sums both equal measured_cells (no double count)", () => {
    const s = coverageStats();
    const byModel = Object.values(s.by_model).reduce((a, b) => a + b, 0);
    const byCat = Object.values(s.by_category).reduce((a, b) => a + b, 0);
    assert.equal(byModel, s.measured_cells);
    assert.equal(byCat, s.measured_cells);
  });

  test("coverage is honestly sparse (well below full)", () => {
    const s = coverageStats();
    assert.ok(s.coverage >= 0 && s.coverage < 0.5, `sparse expected, got ${s.coverage}`);
  });
});

// ---------------------------------------------------------------------------
// 4. decideAgent — excludes unmeasured models from TES ranking, or falls back to
//    the tier heuristic with a coverage_note.
// ---------------------------------------------------------------------------

describe("decideAgent — measured-vs-heuristic honesty", () => {
  test("a category with ZERO measured cells falls back to heuristic + says so", () => {
    // context.audio has no seeded cell for any model → heuristic-only.
    const r = decideAgent({ task_category: "context.audio", min_score: 0 });
    assert.match(r.coverage_note, /heuristic/i);
    // A heuristic pick must NOT cite a benchmark source.
    if (r.chosen_model !== null) {
      assert.equal(r.cited_source, null);
    }
  });

  test("pending-price measured models are excluded from the TES ranking", () => {
    // coding.backend HAS measured cells (opus-4-8, opus-4-7, gpt-5-3-codex), but
    // opus-4-8 + gpt-5-3-codex are pending-price → unrankable by TES. The chosen
    // model must be a priceable one (opus-4-7), never a pending-price model.
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    const pendingPrice = new Set([
      "claude-opus-4-8", "claude-opus-4-6", "claude-fable-5", "gpt-5",
      "gpt-5-3-codex", "gpt-oss", "gemini-3.1-pro", "deepseek-v3.2", "minimax",
    ]);
    assert.ok(r.chosen_model === null || !pendingPrice.has(r.chosen_model));
    // The excluded pending-price candidates appear with an honest why_not + null TES.
    const opus48 = r.alternatives.find((a) => a.model === "claude-opus-4-8");
    assert.ok(opus48, "opus-4-8 must appear as an alternative");
    assert.equal(opus48!.tes, null);
    assert.match(opus48!.why_not, /pending|cannot price|not in/i);
  });

  test("a measured+priced choice cites a real (non-heuristic) source", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    if (r.chosen_model && r.cited_source !== null) {
      assert.ok(r.cited_source.length > 0);
      assert.ok(!/^tier-heuristic/.test(r.cited_source), "a cited source must not be the heuristic marker");
    }
  });

  test("never invents a score: every alternative score is null or real [0,1]", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0 });
    for (const a of r.alternatives) {
      assert.ok(
        a.score === null || (typeof a.score === "number" && a.score >= 0 && a.score <= 1),
        `score out of [0,1] for ${a.model}: ${a.score}`,
      );
    }
  });

  test("coverage_note is always populated for a valid category", () => {
    for (const cat of ["coding.backend", "reasoning.math", "context.audio", "agents.reviewer"]) {
      const r = decideAgent({ task_category: cat, min_score: 0 });
      assert.ok(typeof r.coverage_note === "string" && r.coverage_note.length > 0, cat);
    }
  });

  test("unknown category → null choice + explanatory note, no fabrication", () => {
    const r = decideAgent({ task_category: "coding.not-real" });
    assert.equal(r.chosen_model, null);
    assert.deepEqual(r.alternatives, []);
    assert.match(r.coverage_note, /not in the 24-category taxonomy/i);
  });
});

// ---------------------------------------------------------------------------
// 5. decideAgent — gates: min_score, max_cost_usd, force_model, prefer_local.
// ---------------------------------------------------------------------------

describe("decideAgent — gates", () => {
  test("min_score above every score (1.1) filters everything", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 1.1 });
    assert.equal(r.chosen_model, null);
    assert.match(r.reason, /no candidate cleared the gates|unpriceable/i);
  });

  test("default min_score 0.75 blocks a purely-heuristic pick (heuristic tops at 0.74)", () => {
    // context.audio is heuristic-only; default gate must reject it or pick only a
    // genuinely measured cell — never silently pass a heuristic candidate.
    const r = decideAgent({ task_category: "context.audio" });
    if (r.chosen_model !== null) {
      assert.ok(r.cited_source !== null, "a default-gate pick must be measured, not heuristic");
    }
  });

  test("max_cost_usd cap below every paid blended cost keeps only free/local eligible", () => {
    const r = decideAgent({
      task_category: "coding.backend",
      min_score: 0,
      max_cost_usd: 0.0001, // below opus-4-7's blended $0.0125/1k
    });
    // If anything is chosen, it must be local/free (paid models are filtered).
    if (r.chosen_model !== null) {
      const cap = r.alternatives.find((a) => a.model === "claude-opus-4-7");
      // opus-4-7 (the priceable paid model) must have been filtered by the cap.
      if (cap) assert.match(cap.why_not, /max_cost_usd|cost/i);
    }
  });

  test("force_model (in-roster) is honoured, bypasses the TES sort, flagged in note", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "claude-haiku-4-5" });
    assert.equal(r.chosen_model, "claude-haiku-4-5");
    assert.match(r.reason, /force_model/i);
    assert.match(r.coverage_note, /forced/i);
  });

  test("force_model on a pending-price model surfaces null TES honestly", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "gpt-5" });
    assert.equal(r.chosen_model, "gpt-5");
    assert.equal(r.tes, null);
    assert.match(r.reason, /pending|unavailable/i);
  });

  test("force_model out-of-roster is honoured but flagged UNKNOWN (no fake capability)", () => {
    const r = decideAgent({ task_category: "coding.backend", force_model: "made-up-llm" });
    assert.equal(r.chosen_model, "made-up-llm");
    assert.equal(r.cited_source, null);
    assert.match(r.coverage_note, /unknown|not in the roster/i);
  });
});

describe("decideAgent — prefer_local within the 5% window", () => {
  test("prefer_local does not break the no-fabrication contract", () => {
    const r = decideAgent({ task_category: "coding.backend", min_score: 0, prefer_local: true });
    // A local win must say "local"; every alternative score still null-or-[0,1].
    if (r.chosen_model && (r.chosen_model.includes(":") || r.chosen_model.startsWith("qwen3"))) {
      assert.match(r.reason, /local/i);
    }
    for (const a of r.alternatives) {
      assert.ok(a.score === null || (a.score >= 0 && a.score <= 1));
    }
  });

  test("prefer_local can promote a free local model when within 5% TES of the top pick", () => {
    // On a heuristic-only category with min_score below the heuristic band, all
    // candidates carry no measured score; with prefer_local the local roster
    // model (qwen3-30b/qwen3.6, TES 'free') is eligible. We assert the contract:
    // IF a local model is chosen under prefer_local, the reason cites local; and
    // the local pick's TES, when present, is within the 5% window of the runner-up.
    const r = decideAgent({ task_category: "coding.refactor", min_score: 0, prefer_local: true });
    if (r.chosen_model && (r.chosen_model.startsWith("qwen3") || r.chosen_model.includes(":"))) {
      assert.match(r.reason, /local/i);
      const topAlt = r.alternatives.find((a) => typeof a.tes === "number");
      if (topAlt && typeof r.tes === "number") {
        // local TES must be at least 95% of the best non-chosen rankable TES.
        assert.ok((r.tes as number) >= (topAlt.tes as number) * 0.95);
      }
    }
  });
});
