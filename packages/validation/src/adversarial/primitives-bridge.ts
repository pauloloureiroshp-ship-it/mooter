// Bridge between adversarial review and the Wave 28 Workflow Engine primitives
// (Wave 30 Phase H). Non-invasive: imports the workflow CheckpointSink/log
// primitive and records each review verdict so an adversarial pass slots in as
// a workflow phase between local workers and the cloud synthesis step.
//
// The Workflow Engine package is NOT modified — we only consume its exported
// primitives.

import {
  createMemorySink,
  type CheckpointSink,
} from "../../../workflow/src/primitives.ts";
import { review, type LlmCaller, type Lens, type ReviewTarget, type ReviewResult } from "./reviewer.ts";
import { vote, type VoteResult, type VoteOptions } from "./voter.ts";

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
