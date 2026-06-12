// adaptive-learner.test.ts — Wave 58 unit tests for adaptive-learner.ts (A.12).
//
// Tests run via: node --test (tsx provides the TS transpilation layer).
// All filesystem IO is exercised against a per-test temp dir — never ~/.mooter.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  recomputeFromOutcomes,
  readOverrides,
  getLearnedCell,
  driftReport,
  learnerStatus,
  ewma,
  EWMA_ALPHA,
  MIN_DATAPOINTS,
  LEARNED_SOURCE,
} from "../src/adaptive-learner.ts";
import { getCell } from "../src/specialization-matrix.ts";

// ---------------------------------------------------------------------------
// Temp-dir scaffolding + JSONL fixture builder.
// ---------------------------------------------------------------------------

let dir: string;
let logPath: string;
let overridesPath: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "mooter-adaptive-"));
  logPath = join(dir, "cost-perf-log.jsonl");
  overridesPath = join(dir, "specialization-overrides.json");
});

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

interface Row {
  model_chosen?: string;
  task_category?: string;
  actual_score?: number | null;
  ts?: string;
}

function writeLog(rows: Row[]): void {
  writeFileSync(logPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

/** N rows for one cell with a fixed score, timestamped t0, t0+1d, … */
function cellRows(model: string, category: string, scores: number[], t0 = Date.UTC(2026, 5, 1)): Row[] {
  return scores.map((s, i) => ({
    model_chosen: model,
    task_category: category,
    actual_score: s,
    ts: new Date(t0 + i * 86400000).toISOString(),
  }));
}

const NOW = Date.UTC(2026, 5, 12);

// ---------------------------------------------------------------------------
// ewma — the smoothing primitive
// ---------------------------------------------------------------------------

describe("ewma", () => {
  test("single value returns itself", () => {
    assert.equal(ewma([0.7]), 0.7);
  });

  test("constant series converges to the constant", () => {
    assert.equal(ewma([0.5, 0.5, 0.5, 0.5, 0.5]), 0.5);
  });

  test("weights the most recent value at alpha", () => {
    // ewma([a, b]) = alpha*b + (1-alpha)*a
    const got = ewma([0.0, 1.0]);
    assert.ok(Math.abs(got - EWMA_ALPHA) < 1e-9, `expected alpha=${EWMA_ALPHA}, got ${got}`);
  });
});

// ---------------------------------------------------------------------------
// recomputeFromOutcomes — the learning loop
// ---------------------------------------------------------------------------

describe("recomputeFromOutcomes", () => {
  test("degrades gracefully when the log is absent — never throws", () => {
    const missing = join(dir, "does-not-exist.jsonl");
    const res = recomputeFromOutcomes({ log_path: missing, overrides_path: overridesPath, now: NOW, write: false });
    assert.equal(res.rows_read, 0);
    assert.equal(res.cells.length, 0);
  });

  test("learns a cell once it has >= MIN_DATAPOINTS real outcomes", () => {
    writeLog(cellRows("claude-haiku-4-5", "coding.test", Array(MIN_DATAPOINTS).fill(0.8)));
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    assert.equal(res.cells.length, 1);
    const cell = res.cells[0];
    assert.equal(cell.model, "claude-haiku-4-5");
    assert.equal(cell.category, "coding.test");
    assert.equal(cell.score, 0.8, "constant 0.8 series EWMAs to 0.8");
    assert.equal(cell.datapoints, MIN_DATAPOINTS);
    assert.equal(cell.source, LEARNED_SOURCE);
    assert.equal(cell.measured, true);
    assert.equal(cell.confidence, "low");
    assert.equal(res.written, true);
  });

  test("does NOT learn a cell below MIN_DATAPOINTS (anti-fabrication, no 1-sample learning)", () => {
    writeLog(cellRows("claude-haiku-4-5", "coding.debug", Array(MIN_DATAPOINTS - 1).fill(0.9)));
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    assert.equal(res.cells.length, 0, "below-threshold cell must not be learned");
    assert.equal(res.below_threshold, 1);
  });

  test("skips rows with null/missing actual_score — never zero-fills", () => {
    // 6 rows: 3 valid (0.6), 3 null → only 3 valid datapoints, below MIN_DATAPOINTS.
    const rows: Row[] = [
      ...cellRows("claude-sonnet-4-6", "reasoning.general", [0.6, 0.6, 0.6]),
      { model_chosen: "claude-sonnet-4-6", task_category: "reasoning.general", actual_score: null, ts: "2026-06-05T00:00:00Z" },
      { model_chosen: "claude-sonnet-4-6", task_category: "reasoning.general", ts: "2026-06-06T00:00:00Z" },
      { model_chosen: "claude-sonnet-4-6", task_category: "reasoning.general", actual_score: 2 /* out of range */, ts: "2026-06-07T00:00:00Z" },
    ];
    writeLog(rows);
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    assert.equal(res.cells.length, 0, "only 3 valid scores → below MIN_DATAPOINTS → not learned");
    assert.equal(res.below_threshold, 1);
  });

  test("EWMA reflects a real trend (rising scores weight recent higher)", () => {
    writeLog(cellRows("claude-opus-4-7", "coding.backend", [0.2, 0.3, 0.5, 0.8, 0.9]));
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    const cell = res.cells.find((c) => c.model === "claude-opus-4-7");
    assert.ok(cell);
    const expected = Math.round(ewma([0.2, 0.3, 0.5, 0.8, 0.9]) * 1e4) / 1e4;
    assert.equal(cell!.score, expected);
    // recent-weighted: above the simple mean (0.54)
    assert.ok(cell!.score > 0.54, `EWMA ${cell!.score} should exceed simple mean 0.54`);
  });

  test("ignores out-of-roster models / categories and reports the count", () => {
    writeLog([
      ...cellRows("not-a-model", "coding.test", Array(MIN_DATAPOINTS).fill(0.7)),
      ...cellRows("claude-opus-4-8", "not-a-category", Array(MIN_DATAPOINTS).fill(0.7)),
    ]);
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    assert.equal(res.cells.length, 0);
    assert.equal(res.out_of_roster, 2);
  });

  test("write:false computes without touching the filesystem", () => {
    const p = join(dir, "dry-run-overrides.json");
    writeLog(cellRows("claude-haiku-4-5", "coding.test", Array(MIN_DATAPOINTS).fill(0.8)));
    const res = recomputeFromOutcomes({ log_path: logPath, overrides_path: p, now: NOW, write: false });
    assert.equal(res.cells.length, 1);
    assert.equal(res.written, false);
    assert.equal(existsSync(p), false, "dry run must not write the overrides file");
  });

  test("written file is valid JSON carrying version + alpha + min_datapoints", () => {
    writeLog(cellRows("claude-haiku-4-5", "coding.test", Array(MIN_DATAPOINTS).fill(0.75)));
    recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    const parsed = JSON.parse(readFileSync(overridesPath, "utf8"));
    assert.equal(parsed.alpha, EWMA_ALPHA);
    assert.equal(parsed.min_datapoints, MIN_DATAPOINTS);
    assert.ok(Array.isArray(parsed.cells));
    assert.equal(parsed.cells[0].source, LEARNED_SOURCE);
  });
});

// ---------------------------------------------------------------------------
// readOverrides — round-trip + rejection of malformed cells
// ---------------------------------------------------------------------------

describe("readOverrides", () => {
  test("round-trips a freshly written overrides file", () => {
    writeLog(cellRows("claude-haiku-4-5", "coding.test", Array(MIN_DATAPOINTS).fill(0.8)));
    recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    const cells = readOverrides(overridesPath);
    assert.equal(cells.length, 1);
    assert.equal(cells[0].score, 0.8);
  });

  test("returns [] for a missing file", () => {
    assert.deepEqual(readOverrides(join(dir, "nope.json")), []);
  });

  test("rejects under-threshold / wrong-source cells (anti-fabrication)", () => {
    const p = join(dir, "tampered.json");
    writeFileSync(
      p,
      JSON.stringify({
        version: 1,
        cells: [
          { model: "claude-opus-4-8", category: "coding.backend", score: 0.99, source: "SWE-bench", measured: true, datapoints: 100 }, // wrong source (pretends to be a benchmark)
          { model: "claude-opus-4-8", category: "coding.test", score: 0.5, source: LEARNED_SOURCE, measured: true, datapoints: 1 }, // below MIN_DATAPOINTS
          { model: "claude-opus-4-8", category: "coding.debug", score: 0.6, source: LEARNED_SOURCE, measured: true, datapoints: MIN_DATAPOINTS }, // valid
        ],
      }),
    );
    const cells = readOverrides(p);
    assert.equal(cells.length, 1, "only the valid learned cell survives");
    assert.equal(cells[0].category, "coding.debug");
  });
});

// ---------------------------------------------------------------------------
// getLearnedCell — layered lookup over the baseline matrix
// ---------------------------------------------------------------------------

describe("getLearnedCell", () => {
  test("prefers a learned override and stamps source=adaptive-learned (NOT a benchmark)", () => {
    // claude-opus-4-8 / coding.backend is seeded in the baseline at 0.886 (SWE-bench).
    const baseline = getCell("claude-opus-4-8", "coding.backend");
    assert.equal(baseline!.score, 0.886);

    const overrides = [
      { model: "claude-opus-4-8", category: "coding.backend", score: 0.71, source: LEARNED_SOURCE as typeof LEARNED_SOURCE, measured: true as const, confidence: "low" as const, datapoints: 12, as_of: "2026-06-12T00:00:00.000Z" },
    ];
    const cell = getLearnedCell("claude-opus-4-8", "coding.backend", { overrides });
    assert.ok(cell);
    assert.equal(cell!.score, 0.71, "learned override wins over the baseline");
    assert.equal(cell!.source, LEARNED_SOURCE, "provenance is honest — not 'SWE-bench'");
  });

  test("falls back to the cited baseline cell when no override exists", () => {
    const cell = getLearnedCell("claude-opus-4-8", "coding.backend", { overrides: [] });
    assert.ok(cell);
    assert.equal(cell!.score, 0.886);
    assert.notEqual(cell!.source, LEARNED_SOURCE);
  });

  test("returns null for an off-roster model when no override exists", () => {
    assert.equal(getLearnedCell("not-a-model", "coding.backend", { overrides: [] }), null);
  });
});

// ---------------------------------------------------------------------------
// driftReport — learned vs baseline, honest about missing baselines
// ---------------------------------------------------------------------------

describe("driftReport", () => {
  test("computes drift only where a numeric baseline exists", () => {
    const overrides = [
      // baseline has a numeric score (0.886) → comparable
      { model: "claude-opus-4-8", category: "coding.backend", score: 0.786, source: LEARNED_SOURCE as typeof LEARNED_SOURCE, measured: true as const, confidence: "low" as const, datapoints: 20, as_of: "" },
      // baseline is an empty cell → no_baseline, drift null
      { model: "claude-haiku-4-5", category: "context.audio", score: 0.4, source: LEARNED_SOURCE as typeof LEARNED_SOURCE, measured: true as const, confidence: "low" as const, datapoints: 8, as_of: "" },
    ];
    const rep = driftReport({ overrides });
    assert.equal(rep.rows.length, 2);
    assert.equal(rep.comparable, 1);
    assert.equal(rep.no_baseline, 1);

    const backend = rep.rows.find((r) => r.category === "coding.backend")!;
    assert.equal(backend.baseline_score, 0.886);
    assert.equal(backend.drift, Math.round((0.786 - 0.886) * 1e4) / 1e4); // -0.1

    const audio = rep.rows.find((r) => r.category === "context.audio")!;
    assert.equal(audio.baseline_score, null);
    assert.equal(audio.drift, null, "no numeric baseline → drift null, never 0");

    assert.equal(rep.mean_abs_drift, 0.1, "mean abs drift over the 1 comparable cell");
  });

  test("mean_abs_drift is null when nothing is comparable", () => {
    const overrides = [
      { model: "claude-haiku-4-5", category: "context.audio", score: 0.4, source: LEARNED_SOURCE as typeof LEARNED_SOURCE, measured: true as const, confidence: "low" as const, datapoints: 8, as_of: "" },
    ];
    const rep = driftReport({ overrides });
    assert.equal(rep.comparable, 0);
    assert.equal(rep.mean_abs_drift, null);
  });
});

// ---------------------------------------------------------------------------
// learnerStatus — thin status helper
// ---------------------------------------------------------------------------

describe("learnerStatus", () => {
  test("reports honest zeros when no overrides file exists", () => {
    const st = learnerStatus(join(dir, "absent.json"));
    assert.equal(st.exists, false);
    assert.equal(st.learned_cells, 0);
    assert.equal(st.generated_at, null);
    assert.equal(st.alpha, EWMA_ALPHA);
    assert.equal(st.min_datapoints, MIN_DATAPOINTS);
  });

  test("reflects a written overrides file", () => {
    writeLog(cellRows("claude-haiku-4-5", "coding.test", Array(MIN_DATAPOINTS).fill(0.8)));
    recomputeFromOutcomes({ log_path: logPath, overrides_path: overridesPath, now: NOW });
    const st = learnerStatus(overridesPath);
    assert.equal(st.exists, true);
    assert.equal(st.learned_cells, 1);
    assert.equal(st.generated_at, new Date(NOW).toISOString());
  });
});
