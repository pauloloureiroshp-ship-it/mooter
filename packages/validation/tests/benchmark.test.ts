import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTasks, validateTaskSet, gradeOutput, type BenchmarkTask } from "../src/benchmark/task-loader.ts";
import { runBenchmark } from "../src/benchmark/runner.ts";
import { computeMlwr } from "../src/benchmark/mlwr.ts";
import { toResultsJsonl, toReport, toChartSpec } from "../src/benchmark/reporter.ts";
import { parseJudge, judgeBlinded } from "../src/benchmark/judge.ts";
import type { ModelSpec } from "../src/benchmark/callers.ts";

const TASKS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "audit", "BENCHMARK_v2_TASKS.json");

test("the committed task set is valid and has 24 tasks across tiers", () => {
  const set = loadTasks(TASKS_PATH);
  assert.equal(set.tasks.length, 24);
  const tiers = new Set(set.tasks.map((t) => t.tier));
  assert.deepEqual([...tiers].sort(), ["T0", "T1", "T2", "T3"]);
});

test("validateTaskSet flags duplicates and bad tiers", () => {
  const bad = validateTaskSet({
    version: 2,
    tasks: [
      { id: "x", segment: "s", tier: "T0", prompt: "p" },
      { id: "x", segment: "s", tier: "T9" as never, prompt: "" },
    ],
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /duplicate/.test(e)));
});

test("gradeOutput: regex-present / regex-absent / contains-any", () => {
  assert.equal(gradeOutput("currentUser = 1", { kind: "regex-present", pattern: "currentUser" }).pass, true);
  assert.equal(gradeOutput("usr = 1", { kind: "regex-present", pattern: "currentUser" }).pass, false);
  assert.equal(gradeOutput("clean", { kind: "regex-absent", pattern: "TODO" }).pass, true);
  assert.equal(gradeOutput("has TODO", { kind: "regex-absent", pattern: "TODO" }).pass, false);
  assert.equal(gradeOutput("mentions sql injection", { kind: "contains-any", any: ["sql injection", "xss"] }).pass, true);
  assert.equal(gradeOutput("nothing", { kind: "contains-any", any: ["sql injection"] }).pass, false);
});

// Deterministic mock models: "good-local" passes T0/T1, fails harder tiers; cloud always passes.
function mockModel(id: string, kind: "local" | "cloud", answer: (t: BenchmarkTask) => string): ModelSpec {
  return {
    id,
    tier: "T0",
    kind,
    async call(prompt: string) {
      const fakeTask = { prompt } as BenchmarkTask;
      return { text: answer(fakeTask), costUsd: kind === "cloud" ? 0.001 : 0, latencyMs: 5 };
    },
  };
}

const TASKS: BenchmarkTask[] = [
  { id: "a", segment: "s", tier: "T0", prompt: "rename to currentUser", check: { kind: "regex-present", pattern: "currentUser" } },
  { id: "b", segment: "s", tier: "T1", prompt: "commit", check: { kind: "regex-present", pattern: "^feat" } },
  { id: "c", segment: "s", tier: "T3", prompt: "audit sql", check: { kind: "regex-present", pattern: "sql injection" } },
];

test("runBenchmark grades each (task,model,run) and survives a failing call", async () => {
  const local = mockModel("local", "local", (t) =>
    t.prompt.includes("rename") ? "currentUser" : t.prompt.includes("commit") ? "feat: x" : "looks fine",
  );
  const cloud = mockModel("cloud", "cloud", () => "sql injection: use parameterized queries; feat: x; currentUser");
  const results = await runBenchmark(TASKS, [local, cloud], { runsPerTask: 1, concurrency: 2 });
  assert.equal(results.length, 6); // 3 tasks × 2 models
  const localT0 = results.find((r) => r.model === "local" && r.tier === "T0")!;
  assert.equal(localT0.pass, true);
  const localT3 = results.find((r) => r.model === "local" && r.tier === "T3")!;
  assert.equal(localT3.pass, false); // "looks fine" misses sql injection
});

test("computeMlwr: local pass-rate per tier", async () => {
  const local = mockModel("local", "local", (t) =>
    t.prompt.includes("rename") ? "currentUser" : t.prompt.includes("commit") ? "feat: x" : "nope",
  );
  const results = await runBenchmark(TASKS, [local], { runsPerTask: 1 });
  const m = computeMlwr(results);
  assert.equal(m.mlwr.T0, 1);
  assert.equal(m.mlwr.T1, 1);
  assert.equal(m.mlwr.T3, 0);
  assert.equal(m.runs, 3);
});

test("runBenchmark cost cap skips cloud calls once exceeded", async () => {
  const cloud = mockModel("cloud", "cloud", () => "x");
  const many: BenchmarkTask[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, segment: "s", tier: "T2", prompt: "p" }));
  const results = await runBenchmark(many, [cloud], { runsPerTask: 1, concurrency: 1, maxCostUsd: 0.0025 });
  const skipped = results.filter((r) => r.error?.includes("cost cap"));
  assert.ok(skipped.length > 0, "some cloud calls should be cost-capped");
});

test("reporter produces valid JSONL, markdown, and chart spec", async () => {
  const local = mockModel("local", "local", () => "currentUser feat: x sql injection");
  const results = await runBenchmark(TASKS, [local], { runsPerTask: 1 });
  const m = computeMlwr(results);
  const jsonl = toResultsJsonl(results);
  for (const line of jsonl.split("\n")) JSON.parse(line); // each line valid JSON
  const md = toReport(results, m, { generatedAt: "2026-06-07", models: ["local"], runsPerTask: 1, tasksCount: 3 });
  assert.match(md, /MLWR/);
  assert.match(md, /overall/);
  const spec = toChartSpec(m.mlwr) as { data: { values: unknown[] } };
  assert.equal(spec.data.values.length, 4);
});

test("judge: parse + blinded majority", async () => {
  assert.deepEqual(parseJudge("WINNER: A\nCONFIDENCE: 0.8"), { winner: "A", confidence: 0.8 });
  const judges = [
    async () => "WINNER: A\nCONFIDENCE: 0.9",
    async () => "WINNER: A\nCONFIDENCE: 0.7",
    async () => "WINNER: B\nCONFIDENCE: 0.6",
  ];
  const { verdict } = await judgeBlinded("task", "out A", "out B", judges);
  assert.equal(verdict.winner, "A");
});
