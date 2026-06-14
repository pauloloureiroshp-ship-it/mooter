// specialization-matrix.test.ts — Wave 58 unit tests for specialization-matrix.ts
//
// Tests run via: node --test (tsx provides the TS transpilation layer).
// Exercised against the real benchmark seed (no mocking) — same approach as
// benchmark-fetcher.test.ts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getMatrix,
  getCell,
  coverageStats,
  MATRIX_MODELS,
  type SpecializationCell,
} from "../src/specialization-matrix.ts";
import { TASK_CATEGORIES, type TaskCategory } from "../src/task-categories.ts";

// ---------------------------------------------------------------------------
// getMatrix — dense scaffold, sparse measurements
// ---------------------------------------------------------------------------

describe("getMatrix", () => {
  test("is dense: every model × every category key is present", () => {
    const m = getMatrix();
    for (const model of MATRIX_MODELS) {
      assert.ok(m[model], `model row missing: ${model}`);
      for (const cat of TASK_CATEGORIES) {
        assert.ok(m[model][cat], `cell missing: ${model}/${cat}`);
      }
    }
  });

  test("cached: two calls return the same object reference", () => {
    assert.equal(getMatrix(), getMatrix());
  });

  test("every cell respects the §13.3 invariant (score null or in [0,1])", () => {
    const m = getMatrix();
    for (const model of MATRIX_MODELS) {
      for (const cat of TASK_CATEGORIES) {
        const cell: SpecializationCell = m[model][cat];
        assert.ok(
          cell.score === null || (typeof cell.score === "number" && cell.score >= 0 && cell.score <= 1),
          `score out of range: ${model}/${cat} = ${cell.score}`,
        );
      }
    }
  });

  test("empty cells are the exact sentinel { null, 'unknown', false }", () => {
    const m = getMatrix();
    for (const model of MATRIX_MODELS) {
      for (const cat of TASK_CATEGORIES) {
        const cell = m[model][cat];
        if (!cell.measured) {
          assert.equal(cell.score, null, `empty cell must have null score: ${model}/${cat}`);
          assert.equal(cell.source, "unknown", `empty cell must have source 'unknown': ${model}/${cat}`);
          assert.equal(cell.measured, false);
        }
      }
    }
  });

  test("measured cells never carry source 'unknown' (anti-fabrication)", () => {
    const m = getMatrix();
    for (const model of MATRIX_MODELS) {
      for (const cat of TASK_CATEGORIES) {
        const cell = m[model][cat];
        if (cell.measured) {
          assert.notEqual(cell.source, "unknown", `measured cell must cite a source: ${model}/${cat}`);
          assert.ok(cell.source.length > 0);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getCell — lookup contract
// ---------------------------------------------------------------------------

describe("getCell", () => {
  test("returns the seeded cell for a measured (model, category)", () => {
    // claude-opus-4-8 / coding.backend is seeded at 0.886 (SWE-bench Verified).
    const cell = getCell("claude-opus-4-8", "coding.backend");
    assert.ok(cell !== null);
    assert.equal(cell!.measured, true);
    assert.equal(cell!.score, 0.886);
  });

  test("returns the empty sentinel for an in-roster but unmeasured cell", () => {
    const cell = getCell("claude-haiku-4-5", "context.audio");
    assert.ok(cell !== null);
    assert.equal(cell!.measured, false);
    assert.equal(cell!.score, null);
    assert.equal(cell!.source, "unknown");
  });

  test("returns null for a model outside the roster", () => {
    assert.equal(getCell("not-a-real-model", "coding.backend"), null);
  });

  test("preserves a qualitative (null-score) measured cell distinctly from empty", () => {
    // claude-opus-4-6 / writing.prose-en is seeded measured:true with score:null.
    const cell = getCell("claude-opus-4-6", "writing.prose-en");
    assert.ok(cell !== null);
    assert.equal(cell!.measured, true, "qualitative cell is still measured");
    assert.equal(cell!.score, null, "qualitative cell has null score");
    assert.notEqual(cell!.source, "unknown", "qualitative cell cites a source");
  });
});

// ---------------------------------------------------------------------------
// coverageStats — honest reporting
// ---------------------------------------------------------------------------

describe("coverageStats", () => {
  test("total_cells equals models × categories", () => {
    const stats = coverageStats();
    assert.equal(stats.total_cells, MATRIX_MODELS.length * TASK_CATEGORIES.length);
    assert.equal(stats.total_cells, 17 * 24); // Wave 58.4: roster 14 → 17 models
  });

  test("measured + empty = total", () => {
    const stats = coverageStats();
    assert.equal(stats.measured_cells + stats.empty_cells, stats.total_cells);
  });

  test("measured_with_score + measured_qualitative = measured_cells", () => {
    const stats = coverageStats();
    assert.equal(stats.measured_with_score + stats.measured_qualitative, stats.measured_cells);
  });

  test("coverage is sparse — well under full (honest)", () => {
    const stats = coverageStats();
    assert.ok(stats.coverage >= 0 && stats.coverage <= 1);
    assert.ok(stats.coverage < 0.5, `expected a sparse matrix, got coverage=${stats.coverage}`);
  });

  test("by_model and by_category sums each equal measured_cells", () => {
    const stats = coverageStats();
    const modelSum = Object.values(stats.by_model).reduce((a, b) => a + b, 0);
    const catSum = Object.values(stats.by_category).reduce((a, b) => a + b, 0);
    assert.equal(modelSum, stats.measured_cells);
    assert.equal(catSum, stats.measured_cells);
  });
});

// ---------------------------------------------------------------------------
// Type-level smoke: TaskCategory drives getCell's signature.
// ---------------------------------------------------------------------------

describe("type integration", () => {
  test("getCell accepts every TaskCategory without runtime error", () => {
    for (const cat of TASK_CATEGORIES) {
      const cell = getCell("claude-opus-4-8", cat as TaskCategory);
      assert.ok(cell !== null, `cell should exist for in-roster model + ${cat}`);
    }
  });
});
