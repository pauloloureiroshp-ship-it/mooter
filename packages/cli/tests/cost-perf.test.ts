// Wave 58 batch 3 — `mooter cost-perf` + `mooter benchmarks`. node:test + tsx.
//
// Tests are load-safe: --help / unknown-subcommand / argument-validation paths
// all resolve without touching the CommonJS cost-perf-tracker.js or the ESM
// benchmark-fetcher (the lazy loaders only fire after valid subcommand dispatch).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runCostPerf, runBenchmarks, parseLastDays } from "../src/commands/cost-perf.ts";

// ── parseLastDays ─────────────────────────────────────────────────────────────

test("parseLastDays: '7d' → 7", () => {
  assert.equal(parseLastDays("7d"), 7);
});

test("parseLastDays: '30d' → 30", () => {
  assert.equal(parseLastDays("30d"), 30);
});

test("parseLastDays: bare '90' → 90", () => {
  assert.equal(parseLastDays("90"), 90);
});

test("parseLastDays: true (flag present, no value) → null (honest unknown)", () => {
  assert.equal(parseLastDays(true), null);
});

test("parseLastDays: undefined → null", () => {
  assert.equal(parseLastDays(undefined), null);
});

test("parseLastDays: 'garbage' → null", () => {
  assert.equal(parseLastDays("garbage"), null);
});

test("parseLastDays: '0d' → null (zero is not a valid window)", () => {
  assert.equal(parseLastDays("0d"), null);
});

// ── mooter cost-perf ──────────────────────────────────────────────────────────

test("cost-perf: no args → usage, exit 0", async () => {
  const res = await runCostPerf([]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter cost-perf/);
  assert.match(res.output, /report/);
});

test("cost-perf: --help → usage, exit 0", async () => {
  const res = await runCostPerf(["--help"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter cost-perf/);
});

test("cost-perf: unknown subcommand → exit 1 + usage", async () => {
  const res = await runCostPerf(["frobnicate"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown subcommand 'frobnicate'/);
});

test("cost-perf report: when tracker is unavailable, returns honest error (no crash)", async () => {
  // The tracker may not be resolvable in all CI configurations (e.g. a
  // freshly checked-out packages/cli without the sibling tools/ directory).
  // Either it works and exits 0, or it exits 1 with an actionable message —
  // never a thrown exception.
  let res: Awaited<ReturnType<typeof runCostPerf>>;
  try {
    res = await runCostPerf(["report"]);
  } catch (e) {
    assert.fail(`runCostPerf threw instead of returning CmdResult: ${e}`);
    return;
  }
  // If it failed because of missing module, the message must be actionable.
  if (res.exitCode !== 0) {
    assert.match(res.output, /cost-perf-tracker|source checkout/);
  } else {
    // Succeeded — output must look like the report (or honest empty-state).
    assert.match(res.output, /mooter cost-perf report/);
  }
});

test("cost-perf report: --json flag is passed through (no crash)", async () => {
  let res: Awaited<ReturnType<typeof runCostPerf>>;
  try {
    res = await runCostPerf(["report", "--json"]);
  } catch (e) {
    assert.fail(`runCostPerf threw: ${e}`);
    return;
  }
  // Either JSON output (exitCode 0) or an honest error — never a bare crash.
  if (res.exitCode === 0) {
    // Must be valid JSON when tracker is available.
    assert.doesNotThrow(() => JSON.parse(res.output), "output is not valid JSON");
  } else {
    assert.match(res.output, /cost-perf-tracker|source checkout/);
  }
});

test("cost-perf report: --last 7d passes the window through (no crash)", async () => {
  let res: Awaited<ReturnType<typeof runCostPerf>>;
  try {
    res = await runCostPerf(["report", "--last", "7d"]);
  } catch (e) {
    assert.fail(`runCostPerf threw: ${e}`);
    return;
  }
  if (res.exitCode === 0) {
    // The 7-day window must appear somewhere in the output.
    assert.match(res.output, /7d|7/);
  } else {
    assert.match(res.output, /cost-perf-tracker|source checkout/);
  }
});

// ── mooter benchmarks ─────────────────────────────────────────────────────────

test("benchmarks: no args → usage, exit 0", async () => {
  const res = await runBenchmarks([]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter benchmarks/);
  assert.match(res.output, /refresh|list/);
});

test("benchmarks: --help → usage, exit 0", async () => {
  const res = await runBenchmarks(["--help"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter benchmarks/);
});

test("benchmarks: unknown subcommand → exit 1 + usage", async () => {
  const res = await runBenchmarks(["frobnicate"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown subcommand 'frobnicate'/);
});

test("benchmarks refresh: returns honest state (no crash)", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["refresh"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  if (res.exitCode === 0) {
    assert.match(res.output, /mooter benchmarks refresh/);
    // Must mention seed and override counts — honest state.
    assert.match(res.output, /seed cells|override cells|merged/);
  } else {
    assert.match(res.output, /benchmark-fetcher|source checkout/);
  }
});

test("benchmarks refresh: --json produces valid JSON when fetcher is available", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["refresh", "--json"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  if (res.exitCode === 0) {
    const parsed = JSON.parse(res.output) as { notes: { merged_cells: number } };
    assert.ok(typeof parsed.notes === "object", "notes field present");
    assert.ok(typeof parsed.notes.merged_cells === "number", "merged_cells is a number");
  } else {
    assert.match(res.output, /benchmark-fetcher|source checkout/);
  }
});

test("benchmarks list: returns honest state (no crash)", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["list"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  if (res.exitCode === 0) {
    assert.match(res.output, /mooter benchmarks list/);
    // Must include coverage stat — honest measurement count.
    assert.match(res.output, /measured|Coverage|logical cells/);
  } else {
    assert.match(res.output, /benchmark-fetcher|source checkout/);
  }
});

test("benchmarks list: --json produces valid JSON when fetcher is available", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["list", "--json"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  if (res.exitCode === 0) {
    const parsed = JSON.parse(res.output) as { total_logical: number; cells: unknown[] };
    assert.ok(typeof parsed.total_logical === "number", "total_logical present");
    assert.ok(Array.isArray(parsed.cells), "cells is an array");
    // 14 models × 24 categories = 336 logical cells
    assert.equal(parsed.total_logical, 336);
  } else {
    assert.match(res.output, /benchmark-fetcher|source checkout/);
  }
});

test("benchmarks list: --model filter accepted without crash", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["list", "--model", "claude-opus-4-6"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  // Either valid output or an honest error — never a bare throw.
  assert.ok(res.exitCode === 0 || res.exitCode === 1);
});

test("benchmarks list: --category filter accepted without crash", async () => {
  let res: Awaited<ReturnType<typeof runBenchmarks>>;
  try {
    res = await runBenchmarks(["list", "--category", "coding.frontend"]);
  } catch (e) {
    assert.fail(`runBenchmarks threw: ${e}`);
    return;
  }
  assert.ok(res.exitCode === 0 || res.exitCode === 1);
});

// ── anti-fabrication invariants ────────────────────────────────────────────────

test("usage text: no hyperbole (honest tone)", async () => {
  const { output: cpOut } = await runCostPerf([]);
  const { output: bmOut } = await runBenchmarks([]);
  for (const out of [cpOut, bmOut]) {
    assert.ok(!/revolutionary|magic|AI-powered|always accurate/i.test(out), "no hyperbole in usage");
  }
});

test("cost-perf usage: mentions manual-update and source journal location", async () => {
  const { output } = await runCostPerf([]);
  assert.match(output, /cost-perf-log\.jsonl/);
});

test("benchmarks usage: mentions manual curation and A.16 (no network)", async () => {
  const { output } = await runBenchmarks([]);
  assert.match(output, /[Mm]anual|A\.16|no network/);
});
