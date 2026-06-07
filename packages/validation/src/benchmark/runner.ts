// Benchmark runner (Wave 30 Phase L) — orchestrates tasks × models × runs with
// bounded concurrency, grading each output. Never throws on a call failure.

import type { ModelSpec } from "./callers.ts";
import { type BenchmarkTask, gradeOutput } from "./task-loader.ts";
import type { Tier } from "../types.ts";

export interface RunResult {
  taskId: string;
  segment: string;
  tier: Tier;
  model: string;
  modelKind: "local" | "cloud";
  run: number;
  text: string;
  costUsd: number;
  latencyMs: number;
  pass: boolean;
  gradeReason: string;
  error?: string;
}

export interface RunOptions {
  runsPerTask?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  /** Cap total cloud cost; once exceeded, remaining cloud calls are skipped (recorded as error). */
  maxCostUsd?: number;
}

export async function runBenchmark(
  tasks: BenchmarkTask[],
  models: ModelSpec[],
  opts: RunOptions = {},
): Promise<RunResult[]> {
  const runs = opts.runsPerTask ?? 1;
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const jobs: Array<{ task: BenchmarkTask; model: ModelSpec; run: number }> = [];
  for (const task of tasks) for (const model of models) for (let r = 1; r <= runs; r++) jobs.push({ task, model, run: r });

  const results: RunResult[] = new Array(jobs.length);
  let cursor = 0;
  let done = 0;
  let spent = 0;

  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const i = cursor++;
      const { task, model, run } = jobs[i];
      let text = "";
      let costUsd = 0;
      let latencyMs = 0;
      let error: string | undefined;
      if (opts.maxCostUsd !== undefined && model.kind === "cloud" && spent >= opts.maxCostUsd) {
        error = `skipped: cost cap $${opts.maxCostUsd} reached`;
      } else {
        const out = await model.call(task.prompt);
        text = out.text;
        costUsd = out.costUsd;
        latencyMs = out.latencyMs;
        error = out.error;
        spent += costUsd;
      }
      const grade = error ? { pass: false, reason: `error: ${error}` } : gradeOutput(text, task.check);
      results[i] = {
        taskId: task.id,
        segment: task.segment,
        tier: task.tier,
        model: model.id,
        modelKind: model.kind,
        run,
        text,
        costUsd,
        latencyMs,
        pass: grade.pass,
        gradeReason: grade.reason,
        error,
      };
      done++;
      opts.onProgress?.(done, jobs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, () => worker()));
  return results;
}

export function totalCost(results: RunResult[]): number {
  return results.reduce((s, r) => s + (r.costUsd || 0), 0);
}
