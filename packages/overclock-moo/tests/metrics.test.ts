// metrics.test.ts — the honesty contract: measured ≠ estimated, n/d never faked.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendMetric, honestSummaryLines, metricsPath, readMetrics, summarize, METR_CAVEAT, THROUGHPUT_NOTE, type JobResult, type GpuContext } from "../src/metrics.ts";

function r(partial: Partial<JobResult>): JobResult {
  return {
    id: "j",
    kind: "run-tests",
    category: "coding.test",
    model: "qwen3-30b",
    runtimeBase: "qwen3-coder:30b",
    resource: "cpu",
    gate: "test",
    gatePassed: true,
    wallSeconds: 1,
    humanMinutesEst: 3,
    localTokens: null,
    usd: 0,
    ...partial,
  };
}

const ctx = { at: 1000, project: "demo", baseModel: "qwen3-coder:30b", gpu: null };

test("recovered time counts ONLY passed gates (failed work is never claimed)", () => {
  const m = summarize(
    [
      r({ id: "pass", gatePassed: true, humanMinutesEst: 3, wallSeconds: 2 }),
      r({ id: "fail", gatePassed: false, humanMinutesEst: 9, wallSeconds: 1 }), // 9 NOT counted
    ],
    ctx,
  );
  assert.equal(m.estimated.humanMinutesRecovered, 3);
  assert.equal(m.measured.gatePass, 1);
  assert.equal(m.measured.gateFail, 1);
  assert.equal(m.quality.regressions, 1);
  assert.equal(m.quality.passRate, 0.5);
});

test("measured GPU vs CPU seconds are bucketed separately; tokens are real or n/d", () => {
  const m = summarize(
    [
      r({ id: "cpu", resource: "cpu", wallSeconds: 4, localTokens: null }),
      r({ id: "gpu", resource: "gpu", gate: "exec", wallSeconds: 6, localTokens: 120 }),
    ],
    ctx,
  );
  assert.equal(m.measured.cpuSecondsWorked, 4);
  assert.equal(m.measured.gpuSecondsReclaimed, 6);
  assert.equal(m.measured.localTokens, 120);
  assert.equal(m.measured.usd, 0);
});

test("all-CPU run reports localTokens as n/d (null), never 0-as-fact", () => {
  const m = summarize([r({ localTokens: null }), r({ id: "j2", localTokens: null })], ctx);
  assert.equal(m.measured.localTokens, null);
});

test("skipped jobs count toward neither bucket", () => {
  const m = summarize(
    [r({ id: "ok" }), r({ id: "skip", skipped: "ollama-unavailable", gatePassed: false, humanMinutesEst: 5 })],
    ctx,
  );
  assert.equal(m.measured.skipped, 1);
  assert.equal(m.measured.jobsRun, 1); // only the non-skipped, gate-evaluated job
  assert.equal(m.estimated.humanMinutesRecovered, 3); // skip's 5 not counted
});

test("empty run → passRate n/d (null), not a fabricated 0% or 100%", () => {
  const m = summarize([], ctx);
  assert.equal(m.quality.passRate, null);
  assert.equal(m.estimated.humanMinutesRecovered, 0);
});

test("every estimate carries the METR caveat", () => {
  const m = summarize([r({})], ctx);
  assert.equal(m.estimated.caveat, METR_CAVEAT);
  assert.match(m.estimated.caveat, /not a stopwatch/i);
  const lines = honestSummaryLines(m);
  assert.ok(lines.some((l) => /METR/i.test(l)));
  assert.ok(lines.some((l) => /n\/d|util/i.test(l)));
});

test("append + read roundtrip under an isolated MOOTER_HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "overclock-"));
  const m = summarize([r({})], ctx);
  const file = appendMetric(m, home);
  assert.equal(file, metricsPath(home));
  const back = readMetrics(home);
  assert.equal(back.length, 1);
  assert.equal(back[0].project, "demo");
  // raw line is valid JSONL
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8").trim()));
});

// ── Phase 2 additions ────────────────────────────────────────────────────────

test("cloudUsdAvoided sums per-job estimates; null when none present", () => {
  // Two GPU jobs each with a cloudUsdAvoidedEst
  const m1 = summarize(
    [
      r({ id: "g1", resource: "gpu", localTokens: 500, cloudUsdAvoidedEst: 0.0012 }),
      r({ id: "g2", resource: "gpu", localTokens: 400, cloudUsdAvoidedEst: 0.0008 }),
    ],
    ctx,
  );
  assert.ok(m1.measured.cloudUsdAvoided !== null, "should have a sum");
  assert.ok(
    Math.abs((m1.measured.cloudUsdAvoided as number) - 0.002) < 1e-9,
    `expected ~0.002, got ${m1.measured.cloudUsdAvoided}`,
  );

  // No job carries cloudUsdAvoidedEst → null (not fabricated 0)
  const m2 = summarize([r({ id: "cpu-only", resource: "cpu" })], ctx);
  assert.equal(m2.measured.cloudUsdAvoided, null);
});

test("gpuSecondsBusy equals gpuSecondsReclaimed (contract alias)", () => {
  const m = summarize(
    [r({ id: "gpu-job", resource: "gpu", wallSeconds: 7.5 })],
    ctx,
  );
  assert.equal(m.measured.gpuSecondsBusy, m.measured.gpuSecondsReclaimed);
  assert.equal(m.measured.gpuSecondsBusy, 7.5);
});

test("secondary.throughputX is null by default and carries THROUGHPUT_NOTE; ctx.throughputX flows through", () => {
  // Default: no throughputX in ctx
  const m1 = summarize([r({})], ctx);
  assert.equal(m1.secondary.throughputX, null);
  assert.equal(m1.secondary.note, THROUGHPUT_NOTE);

  // With throughputX provided
  const m2 = summarize([r({})], { ...ctx, throughputX: 1.37 });
  assert.equal(m2.secondary.throughputX, 1.37);
  assert.equal(m2.secondary.note, THROUGHPUT_NOTE);

  // Explicit null still null
  const m3 = summarize([r({})], { ...ctx, throughputX: null });
  assert.equal(m3.secondary.throughputX, null);
});

test("utilDuring flows into the metric and into honestSummaryLines", () => {
  const gpu: GpuContext = {
    utilBefore: 38,
    utilAfter: 42,
    utilDuring: 97,
    totalMb: 24000,
    vramBudgetMb: 20000,
    gpuSlots: 2,
    cpuSlots: 4,
  };
  const m = summarize([r({ resource: "gpu" })], { ...ctx, gpu });
  assert.equal(m.gpu?.utilDuring, 97);
  const lines = honestSummaryLines(m);
  // The idle-reclaim headline must contain "38%→97%"
  assert.ok(
    lines.some((l) => l.includes("38%→97%")),
    `Expected a line with "38%→97%" in: ${JSON.stringify(lines)}`,
  );
});

test("honest line labels throughput as secondary and cloud-$ as avoided/est", () => {
  const m = summarize(
    [r({ resource: "gpu", localTokens: 300, cloudUsdAvoidedEst: 0.0015 })],
    { ...ctx, throughputX: 1.1 },
  );
  const lines = honestSummaryLines(m);
  assert.ok(
    lines.some((l) => /secondary/i.test(l)),
    "Expected a line containing 'secondary'",
  );
  assert.ok(
    lines.some((l) => /avoided|evitado/i.test(l)),
    "Expected a line containing 'avoided' or 'evitado' (est label)",
  );
});
