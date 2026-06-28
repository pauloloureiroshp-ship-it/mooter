// metrics.test.ts — the honesty contract: measured ≠ estimated, n/d never faked.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendMetric, honestSummaryLines, metricsPath, readMetrics, summarize, METR_CAVEAT, type JobResult } from "../src/metrics.ts";

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
