// Wave 33 (B.1) — TurboQuant build wrapper · enable state · benchmark gate.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { detectPrereqs, planBuild, build, cacheFlags, type ProbeFns } from "../src/installer.ts";
import { isEnabled, setEnabled, statusChip, evaluateBenchmark } from "../src/state.ts";

const PROBE_OK: ProbeFns = { hasCommand: () => true, hasNvidiaGpu: () => true };
const PROBE_NO_GPU: ProbeFns = { hasCommand: (c) => c === "cmake" || c === "git", hasNvidiaGpu: () => false };

// ── build wrapper ─────────────────────────────────────────────────────────────
test("detectPrereqs flags a missing GPU + CUDA honestly", () => {
  const p = detectPrereqs(PROBE_NO_GPU);
  assert.strictEqual(p.nvidiaSmi, false);
  assert.ok(p.missing.some((m) => /NVIDIA/.test(m)));
  assert.ok(p.missing.some((m) => /CUDA/.test(m)));
});

test("build refuses gracefully without prereqs (stays on stock llama.cpp)", () => {
  const r = build(PROBE_NO_GPU);
  assert.strictEqual(r.built, false);
  assert.match(r.message, /Staying on stock llama\.cpp/);
});

test("build dry-run plans clone+cmake; --run executes every step", () => {
  const dry = build(PROBE_OK);
  assert.strictEqual(dry.built, false);
  assert.match(dry.message, /dry-run/);
  const cmds: string[] = [];
  const r = build(PROBE_OK, { run: true, exec: (c) => cmds.push(c) });
  assert.strictEqual(r.built, true);
  assert.ok(cmds.some((c) => c.includes("git clone")));
  assert.ok(cmds.some((c) => c.includes("cmake") && c.includes("GGML_CUDA=ON")));
});

test("planBuild is source-only (no binary download step)", () => {
  const plan = planBuild(PROBE_OK);
  assert.ok(!plan.steps.some((s) => /download|release|\.tar|\.zip/.test(s)), "no binary release path");
  assert.ok(plan.steps[0].includes("git clone"));
});

test("cacheFlags returns the tbq3 k+v flags", () => {
  const f = cacheFlags();
  assert.deepStrictEqual(f, ["--cache-type-k tbq3", "--cache-type-v tbq3"]);
});

// ── enable state ──────────────────────────────────────────────────────────────
test("enable state round-trips through preferences.json", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-tq-");
  assert.strictEqual(isEnabled(home, {}), false);
  setEnabled(true, home);
  assert.strictEqual(isEnabled(home, {}), true);
  assert.strictEqual(statusChip(home, {}), "🐢 TQ-3bit");
  setEnabled(false, home);
  assert.strictEqual(statusChip(home, {}), null);
});

test("MOOTER_TURBOQUANT=1 forces enabled without persisting", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-tq-env-");
  assert.strictEqual(isEnabled(home, { MOOTER_TURBOQUANT: "1" } as NodeJS.ProcessEnv), true);
  assert.strictEqual(isEnabled(home, {}), false, "env override did not persist");
});

// ── benchmark gate ────────────────────────────────────────────────────────────
test("benchmark gate reports unmeasured (not a fake win) with no numbers", () => {
  const v = evaluateBenchmark(null, null);
  assert.strictEqual(v.measurable, false);
  assert.strictEqual(v.shouldOptOut, false);
  assert.match(v.note, /not benchmarked/);
});

test("benchmark gate opts out when reduction is below the 10% floor", () => {
  const v = evaluateBenchmark(1000, 950); // 5%
  assert.strictEqual(v.measurable, true);
  assert.strictEqual(v.shouldOptOut, true);
});

test("benchmark gate keeps a real win (e.g. 4× → 75% reduction)", () => {
  const v = evaluateBenchmark(1000, 250);
  assert.strictEqual(v.shouldOptOut, false);
  assert.ok(v.reductionPct! > 70);
});
