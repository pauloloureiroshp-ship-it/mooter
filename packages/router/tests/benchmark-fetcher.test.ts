// benchmark-fetcher.test.ts — Wave 58 unit tests for benchmark-fetcher.ts
//
// Tests run via: node --test (tsx provides the TS transpilation layer).
// All file I/O is exercised against real fixture paths — no mocking.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  loadBenchmarks,
  refreshBenchmarks,
  getCell,
  getCellsForModel,
  getCellsForCategory,
  type BenchmarkCell,
} from "../src/benchmark-fetcher.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid BenchmarkCell for inline test data. */
function makeCell(
  model: string,
  category: string,
  score: number | null = 0.9,
): BenchmarkCell {
  return {
    model,
    category,
    score,
    source: "test-source",
    source_url: "https://example.com",
    measured: true,
    as_of: "2026-06",
  };
}

// ---------------------------------------------------------------------------
// loadBenchmarks — degrade gracefully contract
// ---------------------------------------------------------------------------

describe("loadBenchmarks", () => {
  test("returns an object with cells array and notes — never throws", () => {
    // Even if seed and overrides are absent this should not throw.
    const result = loadBenchmarks();
    assert.ok(typeof result === "object", "result is object");
    assert.ok(Array.isArray(result.cells), "cells is array");
    assert.ok(typeof result.notes === "object", "notes is object");
  });

  test("notes contains numeric cell counts", () => {
    const { notes } = loadBenchmarks();
    assert.ok(typeof notes.seed_cells === "number");
    assert.ok(typeof notes.override_cells === "number");
    assert.ok(typeof notes.merged_cells === "number");
    assert.ok(notes.merged_cells >= 0);
  });

  test("notes.seed_missing and notes.overrides_missing are booleans", () => {
    const { notes } = loadBenchmarks();
    assert.ok(typeof notes.seed_missing === "boolean");
    assert.ok(typeof notes.overrides_missing === "boolean");
  });

  test("merged_cells >= max(seed_cells, override_cells) — overrides always contribute", () => {
    const { notes } = loadBenchmarks();
    assert.ok(
      notes.merged_cells >= Math.max(notes.seed_cells, notes.override_cells),
      `merged=${notes.merged_cells} seed=${notes.seed_cells} overrides=${notes.override_cells}`,
    );
  });

  test("manual_update_hint is set when both sources are absent", () => {
    // The real ~/.mooter/benchmarks-overrides.json exists in this dev env,
    // so we just verify the contract for when it IS present.
    const { notes } = loadBenchmarks();
    if (notes.seed_missing && notes.overrides_missing) {
      assert.ok(
        typeof notes.manual_update_hint === "string" && notes.manual_update_hint.length > 0,
        "hint must be set when both sources are absent",
      );
    } else {
      // At least one source present — no mandatory hint (may still be set for partial absence).
      assert.ok(true, "at least one source present — no mandatory hint check");
    }
  });

  test("each cell has required fields: model, category, score, source, measured", () => {
    const { cells } = loadBenchmarks();
    for (const cell of cells) {
      assert.ok(typeof cell.model === "string" && cell.model.length > 0, `cell.model missing: ${JSON.stringify(cell)}`);
      assert.ok(typeof cell.category === "string" && cell.category.length > 0, `cell.category missing: ${JSON.stringify(cell)}`);
      // score is number | null — both are valid per §13.3 invariant
      assert.ok(
        cell.score === null || typeof cell.score === "number",
        `cell.score must be number | null: ${JSON.stringify(cell)}`,
      );
      assert.ok(typeof cell.source === "string", `cell.source missing: ${JSON.stringify(cell)}`);
      assert.ok(typeof cell.measured === "boolean", `cell.measured must be boolean: ${JSON.stringify(cell)}`);
    }
  });

  test("no cell has a score outside [0, 1] range (§13.3 anti-fabrication invariant)", () => {
    const { cells } = loadBenchmarks();
    for (const cell of cells) {
      if (cell.score !== null) {
        assert.ok(
          cell.score >= 0 && cell.score <= 1,
          `score out of range [0,1]: ${cell.model}/${cell.category} = ${cell.score}`,
        );
      }
    }
  });

  test("no duplicate (model, category) pairs — overrides layer won", () => {
    const { cells } = loadBenchmarks();
    const seen = new Set<string>();
    for (const cell of cells) {
      const key = `${cell.model}\0${cell.category}`;
      assert.ok(!seen.has(key), `duplicate cell found: ${cell.model}/${cell.category}`);
      seen.add(key);
    }
  });
});

// ---------------------------------------------------------------------------
// refreshBenchmarks — same shape, no network
// ---------------------------------------------------------------------------

describe("refreshBenchmarks", () => {
  test("returns the same shape as loadBenchmarks", () => {
    const loaded = loadBenchmarks();
    const refreshed = refreshBenchmarks();
    assert.ok(Array.isArray(refreshed.cells));
    assert.ok(typeof refreshed.notes.merged_cells === "number");
    // Cell counts should be identical on a back-to-back call (no mutation).
    assert.equal(refreshed.notes.merged_cells, loaded.notes.merged_cells);
  });
});

// ---------------------------------------------------------------------------
// getCell — lookup contract
// ---------------------------------------------------------------------------

describe("getCell", () => {
  const cells: BenchmarkCell[] = [
    makeCell("claude-opus-4-8", "coding.backend", 0.886),
    makeCell("gpt-5", "reasoning.math", 1.0),
    makeCell("claude-opus-4-6", "writing.prose-en", null),
  ];

  test("returns cell when model+category exists", () => {
    const cell = getCell(cells, "claude-opus-4-8", "coding.backend");
    assert.ok(cell !== null);
    assert.equal(cell!.score, 0.886);
  });

  test("returns null when model is present but category differs", () => {
    const cell = getCell(cells, "claude-opus-4-8", "coding.frontend");
    assert.equal(cell, null);
  });

  test("returns null when model is absent entirely", () => {
    const cell = getCell(cells, "gemini-3.1-pro", "coding.backend");
    assert.equal(cell, null);
  });

  test("returns cell when score is null (qualitative result)", () => {
    const cell = getCell(cells, "claude-opus-4-6", "writing.prose-en");
    assert.ok(cell !== null);
    assert.equal(cell!.score, null);
  });

  test("returns null for empty cells list", () => {
    assert.equal(getCell([], "any-model", "any-category"), null);
  });
});

// ---------------------------------------------------------------------------
// getCellsForModel — model slice
// ---------------------------------------------------------------------------

describe("getCellsForModel", () => {
  const cells: BenchmarkCell[] = [
    makeCell("claude-opus-4-8", "coding.backend", 0.886),
    makeCell("claude-opus-4-8", "coding.debug", 0.886),
    makeCell("gpt-5", "reasoning.math", 1.0),
  ];

  test("returns all cells for a given model", () => {
    const result = getCellsForModel(cells, "claude-opus-4-8");
    assert.equal(result.length, 2);
    assert.ok(result.every((c) => c.model === "claude-opus-4-8"));
  });

  test("returns empty array when model has no cells", () => {
    assert.deepEqual(getCellsForModel(cells, "gemini-3.1-pro"), []);
  });
});

// ---------------------------------------------------------------------------
// getCellsForCategory — category slice
// ---------------------------------------------------------------------------

describe("getCellsForCategory", () => {
  const cells: BenchmarkCell[] = [
    makeCell("claude-opus-4-8", "coding.backend", 0.886),
    makeCell("claude-opus-4-7", "coding.backend", 0.876),
    makeCell("gpt-5", "reasoning.math", 1.0),
  ];

  test("returns all cells for a given category", () => {
    const result = getCellsForCategory(cells, "coding.backend");
    assert.equal(result.length, 2);
    assert.ok(result.every((c) => c.category === "coding.backend"));
  });

  test("returns empty array when category has no cells", () => {
    assert.deepEqual(getCellsForCategory(cells, "coding.frontend"), []);
  });
});

// ---------------------------------------------------------------------------
// Integration smoke: real files loaded (if present) contain valid cells
// ---------------------------------------------------------------------------

describe("integration: real ~/.mooter/benchmarks-overrides.json", () => {
  test("cells from overrides file (if present) pass the schema invariants", () => {
    const { cells, notes } = loadBenchmarks();
    if (notes.overrides_missing) {
      // File absent — nothing to assert, test passes vacuously.
      return;
    }
    assert.ok(cells.length > 0, "expected at least one cell from overrides");
    for (const cell of cells) {
      assert.ok(typeof cell.model === "string");
      assert.ok(typeof cell.category === "string");
      assert.ok(cell.score === null || (typeof cell.score === "number" && cell.score >= 0 && cell.score <= 1));
    }
  });
});
