// Bridge between adversarial review and the Wave 28 Workflow Engine (Wave 30
// Phase H). Records each review verdict to a CheckpointSink so an adversarial
// pass slots in as a workflow phase between local workers and cloud synthesis.
//
// The sink interface below is STRUCTURALLY IDENTICAL to the Wave 28
// `workflow/src/primitives.ts` CheckpointSink — a workflow MemorySink (or the
// engine's SQLite sink) satisfies it and can be passed straight in. We define
// it locally rather than import the workflow package so the validation layer
// stays Node-builtins-only (importing workflow pulls native/heavy transitive
// deps like p-limit/better-sqlite3 that must not leak into this hot-path
// package or the CLI bundle). The workflow package is NOT modified.

import { review, type LlmCaller, type Lens, type ReviewTarget, type ReviewResult } from "./reviewer.ts";
import { vote, type VoteResult, type VoteOptions } from "./voter.ts";

/** Structurally identical to the Wave 28 workflow CheckpointSink. */
export interface CheckpointSink {
  saveCheckpoint(name: string, data: unknown): void | Promise<void>;
  log(message: string, metadata?: Record<string, unknown>): void | Promise<void>;
}

export interface MemorySink extends CheckpointSink {
  readonly checkpoints: Array<{ name: string; data: unknown }>;
  readonly logs: Array<{ message: string; metadata?: Record<string, unknown> }>;
}

/** In-memory sink (default + test double). A workflow MemorySink also satisfies CheckpointSink. */
export function createMemorySink(): MemorySink {
  const checkpoints: Array<{ name: string; data: unknown }> = [];
  const logs: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  return {
    checkpoints,
    logs,
    saveCheckpoint(name, data) {
      checkpoints.push({ name, data });
    },
    log(message, metadata) {
      logs.push({ message, metadata });
    },
  };
}

export interface TargetVerdict {
  target: ReviewTarget;
  vote: VoteResult;
}

export interface AdversarialOptions extends VoteOptions {
  lenses?: Lens[];
  concurrency?: number;
  sink?: CheckpointSink;
}

/** Run `lenses.length` reviewers per target, bounded concurrency, logging to a sink. */
export async function runAdversarialReview(
  targets: ReviewTarget[],
  call: LlmCaller,
  opts: AdversarialOptions = {},
): Promise<{ verdicts: TargetVerdict[]; sink: CheckpointSink }> {
  const lenses: Lens[] = opts.lenses ?? ["correctness", "security", "repro"];
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const sink = opts.sink ?? createMemorySink();

  // One job = one (target, lens) review. Run with a simple bounded pool.
  const jobs: Array<{ target: ReviewTarget; lens: Lens }> = [];
  for (const target of targets) for (const lens of lenses) jobs.push({ target, lens });

  const byTarget = new Map<string, ReviewResult[]>();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const r = await review(job.target, job.lens, call);
      const arr = byTarget.get(job.target.id) ?? [];
      arr.push(r);
      byTarget.set(job.target.id, arr);
      await sink.log(`review ${job.target.id} via ${job.lens}: ${r.verdict} (${r.confidence.toFixed(2)})`, {
        target: job.target.id,
        lens: job.lens,
        verdict: r.verdict,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, () => worker()));

  const verdicts: TargetVerdict[] = targets.map((target) => {
    const results = byTarget.get(target.id) ?? [];
    const v = vote(results, opts);
    return { target, vote: v };
  });
  for (const tv of verdicts) {
    await sink.saveCheckpoint(`adversarial:${tv.target.id}`, {
      convergence: tv.vote.convergence,
      score: tv.vote.score,
    });
  }
  return { verdicts, sink };
}

/** Convenience: keep only targets whose claims survived adversarial review (not REJECTED). */
export function survivors(verdicts: TargetVerdict[]): TargetVerdict[] {
  return verdicts.filter((v) => v.vote.convergence !== "REJECTED");
}
