// Live adversarial-review demo (Wave 30 Phase H).
//
//   MODEL=qwen2.5:3b ../cli/node_modules/.bin/tsx examples/adversarial-demo.ts
//
// Fans out a 3-lens reviewer cluster against two claims (one true, one false)
// using a real local Ollama model, then prints the convergence verdict. Skips
// gracefully (exit 0) if Ollama is unreachable or has no models.

import { makeOllamaCaller, ollamaReachable, type ReviewTarget } from "../src/adversarial/reviewer.ts";
import { runAdversarialReview } from "../src/adversarial/primitives-bridge.ts";

const model = process.env.MODEL ?? "qwen2.5:3b";

const targets: ReviewTarget[] = [
  {
    id: "true-claim",
    claim: "In JavaScript, Array.prototype.map returns a new array and does not mutate the original.",
  },
  {
    id: "false-claim",
    claim: "In JavaScript, Array.prototype.map mutates the original array in place and returns undefined.",
  },
];

async function main(): Promise<void> {
  if (!(await ollamaReachable())) {
    console.log("⚠️  Ollama unreachable or no models — demo skipped.");
    return;
  }
  console.log(`🐮 Adversarial review demo · model=${model} · 3 lenses × ${targets.length} claims\n`);
  const call = makeOllamaCaller({ model, timeoutMs: 90000 });
  const { verdicts } = await runAdversarialReview(targets, call, {
    lenses: ["correctness", "completeness", "repro"],
    concurrency: 3,
  });
  for (const v of verdicts) {
    console.log(
      `• ${v.target.id}: ${v.vote.convergence} (score ${v.vote.score.toFixed(2)}, ` +
        `confirm ${v.vote.confirmMass.toFixed(2)} / refute ${v.vote.refuteMass.toFixed(2)})`,
    );
    for (const r of v.vote.reviewers) {
      console.log(`    - ${r.lens}: ${r.verdict} (${r.confidence.toFixed(2)}) — ${r.rationale.slice(0, 80)}`);
    }
  }
}

main().catch((e) => {
  console.error("demo error:", e);
  process.exit(1);
});
