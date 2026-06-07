// `mooter benchmark` — run the Showcase Benchmark v2 (Wave 30 Phase L).
//
//   mooter benchmark run [--local <model>] [--cloud <m1,m2>] [--runs N]
//                        [--max-cost USD] [--tasks <path>] [--limit N]
//
// Local (Ollama) calls are free; cloud (Anthropic) calls need ANTHROPIC_API_KEY.
// Writes audit/BENCHMARK_v2_{RESULTS.jsonl,REPORT.md,CURRENT.json,CHART.json}.
// MLWR = local routed model meets the objective per-task bar.

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CmdResult } from "./trail.ts";
import { mooterPath } from "../../../synthesis/src/config.ts";
import {
  loadTasks,
  makeOllamaModel,
  makeAnthropicModel,
  runBenchmark,
  computeMlwr,
  toResultsJsonl,
  toReport,
  toChartSpec,
  totalCost,
  type ModelSpec,
  type Tier,
} from "../../../validation/src/index.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.split("=")[1] : i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function findRepoFile(rel: string): string | null {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, rel);
      if (existsSync(cand)) return cand;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

const CLOUD_TIER: Record<string, Tier> = {
  "claude-haiku-4-5-20251001": "T1",
  "claude-sonnet-4-6": "T2",
  "claude-opus-4-8": "T3",
};

export async function runBenchmarkCmd(args: string[]): Promise<CmdResult> {
  const sub = args[0];
  if (sub !== "run") {
    return { exitCode: sub ? 1 : 0, output: "usage: mooter benchmark run [--local <model>] [--cloud m1,m2] [--runs N] [--max-cost USD] [--limit N]" };
  }
  const tasksPath = flag(args, "--tasks") ?? findRepoFile("audit/BENCHMARK_v2_TASKS.json");
  if (!tasksPath || !existsSync(tasksPath)) return { exitCode: 1, output: "benchmark: tasks file not found" };
  const auditDir = dirname(tasksPath);

  const set = loadTasks(tasksPath);
  const limit = Number(flag(args, "--limit"));
  const tasks = Number.isFinite(limit) && limit > 0 ? set.tasks.slice(0, limit) : set.tasks;

  const localId = flag(args, "--local") ?? "qwen3:30b";
  const cloudIds = (flag(args, "--cloud") ?? "claude-haiku-4-5-20251001,claude-sonnet-4-6")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const runsPerTask = Number(flag(args, "--runs")) > 0 ? Number(flag(args, "--runs")) : 1;
  const maxCost = Number(flag(args, "--max-cost")) > 0 ? Number(flag(args, "--max-cost")) : 1.0;

  const models: ModelSpec[] = [makeOllamaModel(localId, "T0", { timeoutMs: 180000 })];
  for (const id of cloudIds) models.push(makeAnthropicModel(id, CLOUD_TIER[id] ?? "T2"));

  let last = 0;
  const results = await runBenchmark(tasks, models, {
    runsPerTask,
    concurrency: 4,
    maxCostUsd: maxCost,
    onProgress: (done, total) => {
      if (done - last >= 5 || done === total) {
        process.stderr.write(`  benchmark ${done}/${total}\n`);
        last = done;
      }
    },
  });

  const mlwr = computeMlwr(results, { localModelIds: [localId] });
  const generatedAt = new Date().toISOString().slice(0, 19) + "Z";
  const meta = { generatedAt, models: models.map((m) => m.id), runsPerTask, tasksCount: tasks.length, note: set.note };

  writeFileSync(join(auditDir, "BENCHMARK_v2_RESULTS.jsonl"), toResultsJsonl(results) + "\n");
  writeFileSync(join(auditDir, "BENCHMARK_v2_REPORT.md"), toReport(results, mlwr, meta));
  writeFileSync(join(auditDir, "BENCHMARK_v2_CHART.json"), JSON.stringify(toChartSpec(mlwr.mlwr), null, 2) + "\n");
  const snapshot = { mlwr: mlwr.mlwr, runs: results.length, generatedAt, note: `local=${localId}; ${meta.models.length} models` };
  writeFileSync(join(auditDir, "BENCHMARK_v2_CURRENT.json"), JSON.stringify(snapshot, null, 2) + "\n");
  // Also cache for the statusline line-3 MLWR chip (Phase N).
  try {
    writeFileSync(mooterPath("mlwr_snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n");
  } catch {
    /* statusline cache is best-effort */
  }

  const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;
  const lines = [
    `🐮 Benchmark v2 complete · ${results.length} runs · cost $${totalCost(results).toFixed(4)}`,
    `   MLWR (local ${localId}): T0 ${pct(mlwr.mlwr.T0)} · T1 ${pct(mlwr.mlwr.T1)} · T2 ${pct(mlwr.mlwr.T2)} · T3 ${pct(mlwr.mlwr.T3)} · overall ${pct(mlwr.mlwr.overall)}`,
    `   artifacts → ${auditDir}/BENCHMARK_v2_{RESULTS.jsonl,REPORT.md,CURRENT.json,CHART.json}`,
  ];
  return { exitCode: 0, output: lines.join("\n") };
}
