// SELF-GATE A — value measurement (LIVE, local, $0).
//
// Runs an all-local Advisory Council on high-CAS prompts and measures the % of cases
// where the council CHANGES the verdict vs a single model. The gate (design Parte 10):
// if the council does not change the verdict in ≥30% of high-CAS cases, CAS is
// miscalibrated — tune before building B/C on a trigger that wins nothing.
//
// "Changed" (deterministic, honest, not trivially-true):
//   (a) the council elevated a DIFFERENT member's answer over the anchor (single
//       model would have shipped the anchor's answer), OR
//   (b) the council cannot confidently endorse the answer (convergence != CONFIRMED)
//       AND that doubt is backed by a documented refute in the minority report.
//
// NOT part of `npm test` — it calls real Ollama. Run:
//   ../cli/node_modules/.bin/tsx scripts/value-gate.ts [threshold]
//
// Honesty: every number below is measured live from local models ($0). No fabrication.

import { writeFileSync } from "node:fs";
import { computeCAS } from "../src/cas.ts";
import { composeCouncil, type RosterEntry } from "../src/compose.ts";
import { deliberate } from "../src/deliberate.ts";
import type { CouncilVerdict } from "../src/types.ts";

// Fast, DISTINCT local families (qwen2 base / gemma4 / qwen3moe-free). Anchor first.
const FAST_ROSTER: RosterEntry[] = [
  { id: "gemma4:e4b", family: "gemma", tier: "T0", kind: "local", estCostUsd: 0 },
  { id: "deepseek-r1:7b", family: "deepseek", tier: "T0", kind: "local", estCostUsd: 0 },
  { id: "qwen2.5:3b", family: "qwen", tier: "T0", kind: "local", estCostUsd: 0 },
];
const ANCHOR = FAST_ROSTER[0].id;

const noMatrix: any = () => ({ chosen_model: null, reason: "", tes: null, alternatives: [], cited_source: null, coverage_note: "" });

const PROMPTS: Array<{ category: string; prompt: string }> = [
  { category: "coding.security", prompt: "Is storing a bcrypt hash of an API key in localStorage safe for a browser SPA? Answer yes/no and why in 2 sentences." },
  { category: "coding.refactor", prompt: "Should a 2000-line God class be split by extracting feature modules, or rewritten from scratch? Pick one and justify briefly." },
  { category: "coding.debug", prompt: "A websocket reconnects randomly every few minutes in production but never locally. Name the single most likely root cause." },
  { category: "coding.infra", prompt: "For a single-region app with 50 req/s, is Kubernetes the right choice over a single VM with a process manager? Decide and justify." },
  { category: "reasoning.math", prompt: "Is 1 a prime number? Answer and give the one-line reason." },
  { category: "reasoning.science", prompt: "Does adding more parallel agents to a debate monotonically improve answer quality? Answer and justify in 2 sentences." },
  { category: "coding.security", prompt: "Is it safe to disable CSRF tokens for an API that only uses Bearer JWT in the Authorization header? Decide and justify." },
  { category: "coding.refactor", prompt: "Should error handling use exceptions or Result types in a TypeScript service layer? Pick one with a one-line rationale." },
  { category: "coding.debug", prompt: "An async function intermittently returns undefined under load. What is the single most likely bug class?" },
  { category: "reasoning.general", prompt: "Is eventual consistency acceptable for a bank account balance shown to a user? Answer yes/no and justify." },
  { category: "coding.competitive", prompt: "To find the k-th largest element in an unsorted array of n items, is a full sort the best approach? Decide and justify." },
  { category: "coding.infra", prompt: "Should secrets be baked into a Docker image at build time for convenience? Answer and justify in one sentence." },
];

function changed(v: CouncilVerdict): { changed: boolean; reason: string } {
  if (v.winnerSeatId && v.winnerSeatId !== ANCHOR) {
    return { changed: true, reason: `preferred ${v.winnerSeatId} over anchor` };
  }
  const refuted = v.minorityReport.some((m) => m.verdict === "refute");
  if (v.convergence !== "CONFIRMED" && refuted) {
    return { changed: true, reason: `non-confirmed (${v.convergence}) + documented refute` };
  }
  return { changed: false, reason: `anchor answer confirmed (${v.convergence})` };
}

async function main() {
  const threshold = Number(process.argv[2] ?? "0.30");
  const cas = computeCAS({ explicit: true }); // high-CAS by construction
  const rows: any[] = [];
  let changedCount = 0;
  let byDifferentWinner = 0;
  let byNonConfirmed = 0;

  process.stdout.write(`SELF-GATE A — LIVE local council, anchor=${ANCHOR}, ${PROMPTS.length} high-CAS prompts\n\n`);

  for (const { category, prompt } of PROMPTS) {
    const council = composeCouncil(category, cas, { maxCostUsd: 0 }, {
      localOnly: true,
      hasCloudKey: false,
      roster: FAST_ROSTER,
      decide: noMatrix,
    });
    const v = await deliberate(prompt, council, { concurrency: 3 });
    const c = changed(v);
    if (c.changed) {
      changedCount++;
      if (v.winnerSeatId && v.winnerSeatId !== ANCHOR) byDifferentWinner++;
      else byNonConfirmed++;
    }
    rows.push({
      category,
      prompt: prompt.slice(0, 60),
      winner: v.winnerSeatId,
      convergence: v.convergence,
      confidence: v.confidence,
      rounds: v.rounds,
      calls: v.modelCalls,
      costUsd: v.costUsd,
      latencyMs: v.latencyMs,
      changed: c.changed,
      reason: c.reason,
    });
    process.stdout.write(
      `${c.changed ? "✓ CHANGED" : "· same   "} [${category}] ${v.convergence} conf=${v.confidence} win=${v.winnerSeatId} r=${v.rounds} (${(v.latencyMs / 1000).toFixed(1)}s) — ${c.reason}\n`,
    );
  }

  const pct = changedCount / PROMPTS.length;
  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
  const summary = {
    prompts: PROMPTS.length,
    changed: changedCount,
    pct: Math.round(pct * 1000) / 1000,
    threshold,
    pass: pct >= threshold,
    breakdown: { byDifferentWinner, byNonConfirmed },
    totalCostUsd: totalCost,
    anchor: ANCHOR,
    seats: FAST_ROSTER.map((r) => r.id),
  };
  writeFileSync(new URL("./value-gate-results.json", import.meta.url), JSON.stringify({ summary, rows }, null, 2));
  process.stdout.write(
    `\n── SUMMARY ──\nchanged ${changedCount}/${PROMPTS.length} = ${(pct * 100).toFixed(1)}% (threshold ${(threshold * 100).toFixed(0)}%) → ${summary.pass ? "PASS" : "FAIL"}\n` +
      `breakdown: different-winner=${byDifferentWinner}, non-confirmed+refute=${byNonConfirmed}\n` +
      `total cost: $${totalCost.toFixed(4)} (all-local)\n`,
  );
  process.exit(summary.pass ? 0 : 3);
}

main().catch((e) => {
  process.stderr.write(`value-gate error: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
