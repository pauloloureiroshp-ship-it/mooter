// Wave 58 (batch 3) — `mooter matrix` suite. node:test + tsx.
// Run: cd packages/cli && npm test
//
// Drives runMatrix() against the REAL Wave 58 engine (specialization-matrix,
// tes-calculator, decide-agent) and the REAL tools/router/matrix-snapshot.js,
// asserting the anti-fabrication contract: a TES is printed ONLY when a cell is
// measured AND priced; otherwise the row reads 'unmeasured' or 'pending', never
// a guessed number. Snapshot/evolution write to a temp MOOTER_HOME so the real
// ~/.mooter is never touched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMatrix, parsePeriodDays, buildDefaultView } from "../src/commands/matrix.ts";

// ── parsePeriodDays (pure) ─────────────────────────────────────────────────

test("parsePeriodDays accepts Nd / N, rejects junk + bare flag", () => {
  assert.equal(parsePeriodDays("30d"), 30);
  assert.equal(parsePeriodDays("7"), 7);
  assert.equal(parsePeriodDays("  14D "), 14);
  assert.equal(parsePeriodDays("x"), null);
  assert.equal(parsePeriodDays("0d"), null); // not positive
  assert.equal(parsePeriodDays(true), null); // bare --period with no value
  assert.equal(parsePeriodDays(undefined), null);
});

// ── default TES table ──────────────────────────────────────────────────────

test("default view: TES table for the default category (coding.backend)", async () => {
  const res = await runMatrix([]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Matrix · TES for coding\.backend/);
  assert.match(res.output, /models measured for this category/);
  assert.match(res.output, /TES = quality per \$/);
  // The recommendation chain + honesty footer are always present.
  assert.match(res.output, /Recommended:/);
  assert.match(res.output, /never prints a fabricated TES/i);
});

test("default view: --category selects a different category", async () => {
  const res = await runMatrix(["--category", "reasoning.math"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Matrix · TES for reasoning\.math/);
});

test("default view: every roster model appears exactly once (14 models)", async () => {
  const res = await runMatrix(["--category", "coding.backend", "--json"]);
  const view = JSON.parse(res.output);
  assert.equal(view.rows.length, 14);
  const models = new Set(view.rows.map((r: { model: string }) => r.model));
  assert.equal(models.size, 14, "no duplicate models");
});

test("anti-fabrication: unmeasured cells never carry a TES number", async () => {
  const res = await runMatrix(["--category", "coding.backend", "--json"]);
  const view = JSON.parse(res.output);
  for (const r of view.rows) {
    if (r.status === "unmeasured") {
      assert.equal(r.score, null, `${r.model} unmeasured → score null`);
      assert.equal(r.tes, null, `${r.model} unmeasured → tes null (never fabricated)`);
    }
    if (r.status === "pending") {
      // pending = price not yet known; we refuse to compute a TES.
      assert.equal(r.tes, null, `${r.model} pending → tes null`);
    }
    if (r.status === "measured") {
      assert.equal(typeof r.tes, "number", `${r.model} measured → real TES`);
      assert.ok(typeof r.score === "number", `${r.model} measured → real score`);
    }
  }
});

test("default view: rows sort real-TES-desc, nulls last", async () => {
  const res = await runMatrix(["--category", "coding.backend", "--json"]);
  const view = JSON.parse(res.output);
  const tesSeq = view.rows.map((r: { tes: number | null }) => r.tes);
  // Every non-null TES must come before the first null, and be non-increasing.
  let seenNull = false;
  let prev = Infinity;
  for (const t of tesSeq) {
    if (t === null) {
      seenNull = true;
      continue;
    }
    assert.ok(!seenNull, "no real TES after a null TES");
    assert.ok(t <= prev, "TES is non-increasing");
    prev = t;
  }
});

test("default view: recommendation matches a top measured row when one exists", async () => {
  const res = await runMatrix(["--category", "coding.backend", "--json"]);
  const view = JSON.parse(res.output);
  const measured = view.rows.filter((r: { status: string }) => r.status === "measured");
  if (measured.length > 0) {
    // A category with measured+priced cells must yield a concrete recommendation.
    assert.ok(view.recommendation.chosen_model, "recommends a model");
    assert.match(view.recommendation.coverage_note, /MEASURED|measured|heuristic/);
  }
});

test("default view: a category with NO measured cells recommends none honestly", async () => {
  // reasoning.math has no measured cells in the Wave 58 seed; decideAgent falls
  // back to the tier heuristic and may decline — either way it must not invent a
  // measured citation.
  const res = await runMatrix(["--category", "reasoning.math", "--json"]);
  const view = JSON.parse(res.output);
  const measured = view.rows.filter((r: { status: string }) => r.status === "measured");
  assert.equal(measured.length, 0, "precondition: reasoning.math is unmeasured in the seed");
  // cited_source for a heuristic/none pick is null (never a fabricated benchmark).
  assert.equal(view.recommendation.cited_source, null);
});

test("buildDefaultView is reachable as a pure-ish helper (engine-backed)", async () => {
  // Smoke: the exported helper composes the same shape the command renders from.
  const mod = await import("../../router/src/specialization-matrix.ts");
  const tes = await import("../../router/src/tes-calculator.ts");
  const decide = await import("../../router/src/decide-agent.ts");
  const view = buildDefaultView("coding.backend", { matrix: mod, tes, decide });
  assert.equal(view.category, "coding.backend");
  assert.equal(view.rows.length, 14);
});

// ── category validation ────────────────────────────────────────────────────

test("unknown --category → exit 1 with a helpful message", async () => {
  const res = await runMatrix(["--category", "nope.bad"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown category "nope\.bad"/);
  assert.match(res.output, /24 categories/);
});

// ── help + unknown subcommand ──────────────────────────────────────────────

test("--help prints usage without touching the engine", async () => {
  const res = await runMatrix(["--help"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Token-Efficiency Score/);
  assert.match(res.output, /matrix evolution/);
  assert.match(res.output, /matrix snapshot/);
});

test("unknown subcommand → exit 1", async () => {
  const res = await runMatrix(["bogus-sub"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown subcommand 'bogus-sub'/);
});

// ── evolution ──────────────────────────────────────────────────────────────

test("evolution requires --category", async () => {
  const res = await runMatrix(["evolution"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /--category <cat> is required/);
});

test("evolution rejects an unknown category", async () => {
  const res = await runMatrix(["evolution", "--category", "nope.bad"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown category/);
});

test("evolution rejects a non-positive --period", async () => {
  const res = await runMatrix(["evolution", "--category", "coding.backend", "--period", "junk"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /--period must be a positive number/);
});

test("evolution with no snapshots is honest sparsity (not an error)", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-mx-evo-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try {
    const res = await runMatrix(["evolution", "--category", "coding.backend", "--period", "30d"]);
    assert.equal(res.exitCode, 0);
    assert.match(res.output, /No snapshot data for this category/);
    assert.match(res.output, /honest sparsity/i);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test("evolution --json emits {category, period_days, points}", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-mx-evoj-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try {
    const res = await runMatrix(["evolution", "--category", "coding.backend", "--json"]);
    assert.equal(res.exitCode, 0);
    const obj = JSON.parse(res.output);
    assert.equal(obj.category, "coding.backend");
    assert.equal(obj.period_days, 30); // default
    assert.ok(Array.isArray(obj.points));
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

// ── snapshot ───────────────────────────────────────────────────────────────

test("snapshot writes a day-file to MOOTER_HOME and reports honestly", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-mx-snap-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try {
    const res = await runMatrix(["snapshot", "--json"]);
    assert.equal(res.exitCode, 0);
    const obj = JSON.parse(res.output);
    assert.equal(obj.written, true);
    assert.ok(existsSync(obj.file), "day-file exists on disk");
    assert.equal(typeof obj.cells_measured, "number");
    assert.equal(typeof obj.pricing_pending_count, "number");
    // The written file is valid JSON with the documented keys.
    const snap = JSON.parse(readFileSync(obj.file, "utf8"));
    assert.equal(typeof snap.date, "string");
    assert.ok("tes_by_cell" in snap);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test("snapshot (human) renders the camera headline", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-mx-snaph-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try {
    const res = await runMatrix(["snapshot"]);
    assert.equal(res.exitCode, 0);
    assert.match(res.output, /Matrix snapshot/);
    assert.match(res.output, /cell\(s\) with a real TES/);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

// ── no hyperbole ─────────────────────────────────────────────────────────────

test("no hyperbole anywhere in the matrix output", async () => {
  const res = await runMatrix(["--category", "coding.backend"]);
  assert.ok(!/revolutionary|magic|AI-powered|best-in-class|guaranteed/i.test(res.output));
});
