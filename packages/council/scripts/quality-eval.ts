// COUNCIL QUALITY EVAL — does the Council IMPROVE the answer, or only CHANGE it?
//
// Gate A proved the council CHANGES the verdict (91.7%) but signed a caveat: it did
// NOT prove the change is an IMPROVEMENT (selection was not length-neutral). This eval
// answers the missing question with the judge HYGIENE Gate A lacked:
//   • verifiable items → graded DETERMINISTICALLY (execution / gabarito), NEVER by an LLM.
//   • open items       → blind PAIRWISE judge, order randomized BOTH ways, CROSS-VENDOR
//                        judge (Gemma/Google judging Qwen answers → no self-preference),
//                        LENGTH-NEUTRAL rubric.
//
// Three arms per item:
//   A = single model (strongest single LOCAL model = the fair, conservative baseline).
//   B = Council Advisory verdict (deliberate → verdict.recommendation).
//   C = all-Opus single (ceiling) — SKIPPED here (no ANTHROPIC_API_KEY); reported as null.
//
// Pre-registered BAR (fixed BEFORE running): the council is a QUALITY tool iff
//   (open)       WIN − LOSS > 0 with the binomial CI excluding 0, AND
//   (verifiable) accuracy_delta = acc_B − acc_A ≥ 0.
// Three honest outcomes: net-win → MERGE+TAG flagship · changes-but-not-net-win → GATED
// to high-risk (ESCALATE valve) · net-loss → FIX the length-neutral judge first.
//
// NOT part of `npm test` (it calls real local models). Run from packages/council:
//   ../cli/node_modules/.bin/tsx scripts/quality-eval.ts
// Env knobs: EVAL_LIMIT=N (cap items, smoke), EVAL_SEATS, EVAL_SINGLE, EVAL_JUDGE.
//
// Honesty (Doctrine §5): every number is measured live from local models ($0). No
// fabrication; ties and losses are reported; the bar is fixed above, before any run.

import { writeFileSync, readFileSync } from "node:fs";
import { makeOllamaModel, type ModelSpec } from "../../validation/src/benchmark/callers.ts";
import { deliberate } from "../src/deliberate.ts";
import type { Council, CouncilVerdict } from "../src/types.ts";
import { gradeVerifiable, wilson } from "./quality-grade.ts";

// ──────────────────────────────── config ────────────────────────────────────
// Council seats are behaviourally-distinct Qwen variants (mono-vendor — a disclosed
// limitation; see caveat). The single-model baseline is the STRONGEST seat alone, so
// the council must beat the best single model, not a weak one (conservative). The judge
// is GEMMA (Google) — a different vendor from every answer it scores, which is exactly
// the cross-family hygiene Gate A lacked.
const SEAT_IDS = (process.env.EVAL_SEATS ?? "qwen2.5-coder:7b,qwen2.5:3b,qwen2.5-coder:14b").split(",");
const SINGLE_ID = process.env.EVAL_SINGLE ?? "qwen2.5-coder:14b"; // strongest single local → fair baseline
const JUDGE_ID = process.env.EVAL_JUDGE ?? "gemma3:12b";          // cross-vendor (Google ≠ Alibaba/Qwen)
const LIMIT_ARG = process.argv.slice(2).find((a) => a.startsWith("--limit="))?.split("=")[1];
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG) : process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : Infinity;
const ACT_FLOOR = 0.6; // W2-calibrated ACT confidence floor (mirrors escalation.ts minConfirmedConfidence)

// Reproducibility (W2): the frozen makeOllamaModel uses temperature 0.2 with NO seed, so a
// re-run flips ~12% of items by decode noise alone (single-A flipped 4/32 between two runs
// at identical code) — too noisy to certify a sub-15pp non-regression from ONE sample/item.
// EVAL_SEED / --seed=N builds a DETERMINISTIC local caller (temperature 0 + fixed seed) so
// old-code↔new-code can be compared apples-to-apples. This lives in the eval (NOT a frozen
// engine file); it never modifies callers.ts. Default (no seed) keeps the original caller.
const SEED_ARG = process.argv.slice(2).find((a) => a.startsWith("--seed="))?.split("=")[1];
const EVAL_SEED = SEED_ARG ?? process.env.EVAL_SEED;
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
// A/B attribution (W2): --no-length-neutral runs the council with the pre-W2 tiebreak so the
// length-neutral change can be isolated under a fixed seed. --tag=X suffixes the output files
// so an A/B pair does not clobber the canonical artifacts.
const LENGTH_NEUTRAL = !process.argv.slice(2).includes("--no-length-neutral");
const TAG = process.argv.slice(2).find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "";

function makeSeededOllamaModel(id: string, seed: number): ModelSpec {
  return {
    id, tier: "T0", kind: "local",
    async call(prompt: string) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: id, prompt, stream: false, options: { temperature: 0, seed } }),
        });
        if (!res.ok) return { text: "", costUsd: 0, latencyMs: Date.now() - t0, error: `ollama HTTP ${res.status}` };
        const json = (await res.json()) as { response?: string };
        return { text: json.response ?? "", costUsd: 0, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { text: "", costUsd: 0, latencyMs: Date.now() - t0, error: (e as Error).message };
      }
    },
  };
}
const mkModel = (id: string): ModelSpec =>
  EVAL_SEED !== undefined ? makeSeededOllamaModel(id, Number(EVAL_SEED)) : makeOllamaModel(id, "T0");

const single: ModelSpec = mkModel(SINGLE_ID);
const judge: ModelSpec = mkModel(JUDGE_ID);
const council: Council = {
  seats: SEAT_IDS.map((id) => mkModel(id.trim())),
  judge: null, // Advisory: deterministic synthesis (no internal cloud judge)
  note: `eval council: ${SEAT_IDS.join(" + ")} (local, $0)${EVAL_SEED !== undefined ? `, seed=${EVAL_SEED} deterministic` : ""}`,
  estCostUsd: 0,
};

// ──────────────────────────────── dataset ───────────────────────────────────
interface Item {
  id: string;
  category: string;
  cas?: string;
  verifiable: boolean;
  prompt: string;
  ground_truth?: string;
  grading: string;
  rubric?: string;
  test?: string;
}
function loadDataset(): Item[] {
  const url = new URL("../eval/dataset.jsonl", import.meta.url);
  const text = readFileSync(url, "utf8");
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Item);
}

// ───────────────────── open items: blind pairwise judge ──────────────────────
const RUBRIC_PREFACE =
  "You are an impartial judge. Compare two answers to the same question. Judge ONLY by " +
  "correctness, soundness, and usefulness. LENGTH-NEUTRAL: a concise correct answer must " +
  "NOT be penalised for being shorter, and verbosity must NOT be rewarded. Ignore style and " +
  "formatting. If they are equally good, say tie. End your reply with exactly one line: " +
  "'VERDICT: 1' or 'VERDICT: 2' or 'VERDICT: tie'.";

function parseVerdict(text: string): "1" | "2" | "tie" | null {
  const m = text.match(/VERDICT:\s*(1|2|tie)/i);
  if (m) return m[1].toLowerCase() as "1" | "2" | "tie";
  // fallback: last standalone 1/2/tie token
  const t = text.trim().toLowerCase();
  if (/\btie\b/.test(t.slice(-20))) return "tie";
  const last = (t.match(/\b(1|2)\b/g) ?? []).pop();
  return (last as "1" | "2") ?? null;
}

/** Run the judge once with a given (resp1, resp2) ordering → which response won.
 *  Retries on a call error / unparseable reply (W2: 4/11 open items were lost to transient
 *  judge failures → forced ties that polluted the open arm). Up to 3 attempts before null. */
async function judgeOnce(question: string, rubric: string, r1: string, r2: string): Promise<"1" | "2" | "tie" | null> {
  const prompt =
    `${RUBRIC_PREFACE}\n\nRUBRIC for a good answer: ${rubric}\n\n` +
    `QUESTION:\n${question}\n\n--- Response 1 ---\n${r1}\n\n--- Response 2 ---\n${r2}\n\nWhich response is better?`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await judge.call(prompt);
    if (!out.error) {
      const v = parseVerdict(out.text);
      if (v !== null) return v;
    }
  }
  return null;
}

/** Blind pairwise, BOTH orders. Returns A/B/tie for council(B) vs single(A). */
async function judgePairwise(question: string, rubric: string, ansA: string, ansB: string): Promise<{
  verdict: "B" | "A" | "tie"; order1: string | null; order2: string | null; latencyMs: number;
}> {
  const t0 = Date.now();
  // Order 1: Response1=A, Response2=B  → "1"=A, "2"=B
  const o1 = await judgeOnce(question, rubric, ansA, ansB);
  // Order 2: Response1=B, Response2=A  → "1"=B, "2"=A
  const o2 = await judgeOnce(question, rubric, ansB, ansA);
  const map1 = o1 === "1" ? "A" : o1 === "2" ? "B" : o1 === "tie" ? "tie" : null;
  const map2 = o2 === "1" ? "B" : o2 === "2" ? "A" : o2 === "tie" ? "tie" : null;
  // Aggregate the two blind orders (kills position bias): B wins iff it is preferred net
  // across both orders; symmetric → tie.
  const score = (m: string | null) => (m === "B" ? 1 : m === "A" ? -1 : 0);
  const s = score(map1) + score(map2);
  const verdict = s > 0 ? "B" : s < 0 ? "A" : "tie";
  return { verdict, order1: map1, order2: map2, latencyMs: Date.now() - t0 };
}

// ──────────────────────────────── main ──────────────────────────────────────
async function main() {
  const all = loadDataset();
  const items = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
  process.stdout.write(
    `COUNCIL QUALITY EVAL — ${items.length}/${all.length} items\n` +
    `  council seats: ${SEAT_IDS.join(", ")}\n  single (A): ${SINGLE_ID}\n  judge: ${JUDGE_ID} (cross-vendor)\n\n`,
  );

  // Checkpoint each row as we go (long all-local run) so an interrupted run still yields
  // data. Transient + gitignored; the committed artifact is quality-eval-results.json.
  // RESUME-SAFE (W2): the ~40-min all-local run does not survive a host/session restart,
  // so EVAL_RESUME re-seeds `rows` from the checkpoint and skips already-graded ids, and
  // EVAL_CHUNK_SECONDS bounds each pass (exit 0 with a PARTIAL marker) so the run can be
  // driven to completion in restart-safe chunks. Defaults preserve the original behaviour.
  // Knobs accepted via CLI args (--resume, --chunk=N) or env (EVAL_RESUME, EVAL_CHUNK_SECONDS).
  const argv = process.argv.slice(2);
  const chunkArg = argv.find((a) => a.startsWith("--chunk="))?.split("=")[1];
  const RESUME = argv.includes("--resume") || !!process.env.EVAL_RESUME;
  const CHUNK_SECONDS = chunkArg ? Number(chunkArg)
    : process.env.EVAL_CHUNK_SECONDS ? Number(process.env.EVAL_CHUNK_SECONDS) : Infinity;
  const t0 = Date.now();
  const progressUrl = new URL(`./quality-eval-progress${TAG ? "." + TAG : ""}.jsonl`, import.meta.url);
  const rows: any[] = [];
  const doneIds = new Set<string>();
  if (RESUME) {
    try {
      readFileSync(progressUrl, "utf8").trim().split(/\r?\n/).filter(Boolean).forEach((l) => {
        const r = JSON.parse(l); rows.push(r); doneIds.add(r.id);
      });
    } catch { /* no checkpoint yet → fresh */ }
    process.stdout.write(`RESUME: ${doneIds.size}/${items.length} already graded\n`);
  } else {
    try { writeFileSync(progressUrl, ""); } catch { /* best effort */ }
  }

  let i = doneIds.size;
  for (const item of items) {
    if (doneIds.has(item.id)) continue;
    i++;
    const a = await single.call(item.prompt);
    const v: CouncilVerdict = await deliberate(item.prompt, council, { concurrency: 3, maxRounds: 1, lengthNeutral: LENGTH_NEUTRAL });
    const ansA = a.text ?? "";
    const ansB = v.recommendation ?? "";

    const row: any = {
      id: item.id, category: item.category, verifiable: item.verifiable, grading: item.grading,
      costA: a.costUsd, latA: a.latencyMs, costB: v.costUsd, latB: v.latencyMs,
      councilCalls: v.modelCalls, convergence: v.convergence, confidence: v.confidence,
      winnerSeat: v.winnerSeatId,
      clusterSize: v.agreement?.clusterSize ?? null,
      clusterWeight: v.agreement?.clusterWeight ?? null,
      voteScore: v.voteScore,
    };

    if (item.verifiable) {
      row.correctA = gradeVerifiable(item, ansA);
      row.correctB = gradeVerifiable(item, ansB);
      process.stdout.write(
        `[${i}/${items.length}] ${item.id} ${item.category} (ver) ` +
        `A=${row.correctA === null ? "n/a" : row.correctA ? "✓" : "✗"} ` +
        `B=${row.correctB === null ? "n/a" : row.correctB ? "✓" : "✗"} conf=${v.confidence}\n`,
      );
    } else {
      const pj = await judgePairwise(item.prompt, item.rubric ?? "correctness and usefulness", ansA, ansB);
      row.pairwise = pj.verdict; row.order1 = pj.order1; row.order2 = pj.order2; row.judgeLatMs = pj.latencyMs;
      process.stdout.write(
        `[${i}/${items.length}] ${item.id} ${item.category} (open) ` +
        `judge: ${pj.order1}/${pj.order2} → ${pj.verdict === "B" ? "COUNCIL" : pj.verdict === "A" ? "single" : "tie"}\n`,
      );
    }
    rows.push(row);
    doneIds.add(item.id);
    try { writeFileSync(progressUrl, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); } catch { /* best effort */ }

    // Restart-safe chunking: stop cleanly when this pass's wall-clock budget is spent
    // and work remains. The next (resumed) pass picks up exactly where this one left off.
    if (Number.isFinite(CHUNK_SECONDS) && (Date.now() - t0) / 1000 >= CHUNK_SECONDS && doneIds.size < items.length) {
      process.stdout.write(`PARTIAL ${doneIds.size}/${items.length} — chunk budget (${CHUNK_SECONDS}s) reached; exit 0 for resume\n`);
      process.exit(0);
    }
  }

  // ── aggregate ──────────────────────────────────────────────────────────────
  const ver = rows.filter((r) => r.verifiable && r.correctA !== null && r.correctB !== null);
  const verSkipped = rows.filter((r) => r.verifiable && (r.correctA === null || r.correctB === null));
  const accA = ver.length ? ver.filter((r) => r.correctA).length / ver.length : 0;
  const accB = ver.length ? ver.filter((r) => r.correctB).length / ver.length : 0;
  const accDelta = accB - accA;

  const open = rows.filter((r) => !r.verifiable);
  const wins = open.filter((r) => r.pairwise === "B").length;
  const losses = open.filter((r) => r.pairwise === "A").length;
  const ties = open.filter((r) => r.pairwise === "tie").length;
  const decisive = wins + losses;
  // Binomial CI on win-share among decisive items; net-win iff CI lower bound > 0.5
  // (equivalently, the WIN−LOSS difference's CI excludes 0).
  const winShare = wilson(wins, decisive);
  const openNetWin = decisive > 0 && winShare.lo > 0.5;

  // cost & latency per win
  const totCostB = rows.reduce((s, r) => s + (r.costB || 0), 0);
  const totCostA = rows.reduce((s, r) => s + (r.costA || 0), 0);
  const totLatB = rows.reduce((s, r) => s + (r.latB || 0), 0);
  const totLatA = rows.reduce((s, r) => s + (r.latA || 0), 0);

  // calibration: does high council confidence / CONFIRMED convergence predict accuracy?
  const calib = (pred: (r: any) => boolean, label: string) => {
    const sub = ver.filter(pred);
    return { label, n: sub.length, accB: sub.length ? sub.filter((r) => r.correctB).length / sub.length : null };
  };
  const calibration = [
    calib((r) => r.confidence >= 0.6, "council confidence ≥ 0.6"),
    calib((r) => r.confidence < 0.6, "council confidence < 0.6"),
    calib((r) => r.convergence === "CONFIRMED", "convergence CONFIRMED (ACT v1)"),
    calib((r) => r.convergence !== "CONFIRMED", "convergence not CONFIRMED"),
    calib((r) => r.convergence === "CONFIRMED" && r.confidence >= ACT_FLOOR, `ACT gate v2 (CONFIRMED ∧ conf≥${ACT_FLOOR})`),
    calib((r) => !(r.convergence === "CONFIRMED" && r.confidence >= ACT_FLOOR), "¬ACT v2 (ESCALATE)"),
  ];

  // ACT recalibration (W2): the gate that fires ACT must do so only where empirical
  // precision justifies it. v1 = CONFIRMED alone; v2 = CONFIRMED ∧ confidence ≥ floor.
  const prec = (rs: any[]) => (rs.length ? +(rs.filter((r) => r.correctB).length / rs.length).toFixed(3) : null);
  const actV1 = ver.filter((r) => r.convergence === "CONFIRMED");
  const actV2 = ver.filter((r) => r.convergence === "CONFIRMED" && r.confidence >= ACT_FLOOR);
  const act_recalibration = {
    floor: ACT_FLOOR,
    v1_confirmed_only: { n: actV1.length, act_precision: prec(actV1) },
    v2_confirmed_and_conf_ge_floor: { n: actV2.length, act_precision: prec(actV2) },
    improvement_pp: prec(actV1) !== null && prec(actV2) !== null ? +(((prec(actV2) as number) - (prec(actV1) as number)) * 100).toFixed(1) : null,
    note: "ACT precision = P(correct | gate fires) on the verifiable subset. escalation.ts now requires CONFIRMED ∧ confidence ≥ floor, so ACT fires only where empirical precision justifies it (W2 recalibration of the inverted CONFIRMED signal).",
  };

  // breakdown by category
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const byCategory = cats.map((c) => {
    const rs = rows.filter((r) => r.category === c);
    const vr = rs.filter((r) => r.verifiable && r.correctA !== null && r.correctB !== null);
    const op = rs.filter((r) => !r.verifiable);
    return {
      category: c, n: rs.length,
      accA: vr.length ? +(vr.filter((r) => r.correctA).length / vr.length).toFixed(3) : null,
      accB: vr.length ? +(vr.filter((r) => r.correctB).length / vr.length).toFixed(3) : null,
      open_win: op.filter((r) => r.pairwise === "B").length,
      open_tie: op.filter((r) => r.pairwise === "tie").length,
      open_loss: op.filter((r) => r.pairwise === "A").length,
    };
  });

  // ── pre-registered decision (3 outcomes) ─────────────────────────────────────
  const accNonRegress = accDelta >= 0;
  let recommendation: string, decision: "MERGE_TAG_FLAGSHIP" | "GATED_HIGH_RISK" | "FIX_JUDGE";
  if (openNetWin && accNonRegress) {
    decision = "MERGE_TAG_FLAGSHIP";
    recommendation = "NET-WIN: council beats single on open items (CI excludes 0) and does not regress verifiable accuracy → merge + tag flagship v?.?.0-council-complete.";
  } else if (accDelta < 0 || (decisive > 0 && winShare.p < 0.5)) {
    decision = "FIX_JUDGE";
    recommendation = "NET-LOSS signal: council regresses accuracy and/or loses the open pairwise → FIX length-neutral winner-selection/judge before merging.";
  } else {
    decision = "GATED_HIGH_RISK";
    recommendation = "CHANGES-BUT-NOT-NET-WIN: no statistically clean open-item win (CI includes 0). Keep the council GATED to high-risk (ESCALATE valve); do NOT sell as 'better answers'. It is a safety/dissent tool, not a proven quality lift, at this N.";
  }

  const results = {
    meta: {
      generated_for: "council-quality-eval",
      branch_expected: "wave-council-d",
      n_total: all.length, n_run: items.length,
      arms: { A_single: SINGLE_ID, B_council: SEAT_IDS, C_all_opus: null },
      judge: JUDGE_ID,
      seed: EVAL_SEED !== undefined ? Number(EVAL_SEED) : null,
      deterministic: EVAL_SEED !== undefined,
      length_neutral: LENGTH_NEUTRAL,
      tag: TAG || null,
      classify_sha_frozen: "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
    },
    prereg_bar: "council is a QUALITY tool iff (open) WIN−LOSS>0 with binomial CI excluding 0, AND (verifiable) accuracy_delta ≥ 0. Fixed before running.",
    verifiable: {
      n_graded: ver.length, n_skipped: verSkipped.length, skipped_ids: verSkipped.map((r) => r.id),
      accuracy_single_A: +accA.toFixed(3), accuracy_council_B: +accB.toFixed(3),
      accuracy_delta: +accDelta.toFixed(3), non_regression: accNonRegress,
    },
    open: {
      n: open.length, wins_council_B: wins, ties, losses_single_A: losses,
      win_minus_loss: wins - losses,
      win_share_decisive: +winShare.p.toFixed(3),
      win_share_ci95: [+winShare.lo.toFixed(3), +winShare.hi.toFixed(3)],
      ci_excludes_0_positive: openNetWin,
    },
    cost_latency: {
      total_cost_A_usd: +totCostA.toFixed(6), total_cost_B_usd: +totCostB.toFixed(6),
      total_latency_A_ms: totLatA, total_latency_B_ms: totLatB,
      extra_cost_per_open_win_usd: wins > 0 ? +((totCostB - totCostA) / wins).toFixed(6) : null,
      note: "all-local council → real $0 cost; latency is the true cost signal here.",
    },
    calibration,
    act_recalibration,
    by_category: byCategory,
    decision, recommendation,
    caveat:
      "REAL local run ($0), measured live — no fabrication; ties AND losses reported. LIMITATIONS " +
      "(honest): (1) all-LOCAL — no cloud arm (no ANTHROPIC_API_KEY), so the all-Opus ceiling (C) is " +
      "absent and arm A is the strongest single LOCAL model, not a cloud model. (2) The council is " +
      "MONO-VENDOR (3 Qwen variants) — family diversity is limited by installed models; a multi-vendor " +
      "council may behave differently. (3) The open subset is small (n=" + open.length + ") so the binomial CI " +
      "is wide by construction. (4) Verifiable grading is deterministic (execution/gabarito/regex) — the " +
      "`contains:` specs use substring boolean matching, which can under/over-credit paraphrases. " +
      "MITIGATED: the open judge is CROSS-VENDOR (Gemma/Google ≠ Qwen), blind, order-randomized both " +
      "ways, and length-neutral — the hygiene Gate A lacked. The verifiable subset (deterministic, no LLM) " +
      "is the stronger signal; treat the open pairwise as directional at this N. " +
      "(5) DECODE NONDETERMINISM: the frozen caller uses temperature 0.2 with NO seed, so one " +
      "sample/item carries a large run-to-run noise floor — measured directly, single-A correctness " +
      "flipped 4/32 items between two runs at IDENTICAL code, and council-B flipped 7/32 (mostly via " +
      "review-phase convergence shifts, not winner-selection). A single draw therefore CANNOT certify a " +
      "sub-15pp non-regression; use --seed=N (deterministic temp-0 caller) and compare old↔new code under " +
      "the same seed, or average k≥3 samples, before treating any verifiable Δ as real." +
      (EVAL_SEED !== undefined ? ` This run is deterministic (seed=${EVAL_SEED}).` : " This run is NON-deterministic (no seed)."),
    rows,
  };

  writeFileSync(new URL(`./quality-eval-results${TAG ? "." + TAG : ""}.json`, import.meta.url), JSON.stringify(results, null, 2));

  process.stdout.write(
    `\n── SUMMARY ──\n` +
    `verifiable (n=${ver.length}${verSkipped.length ? `, ${verSkipped.length} skipped` : ""}): ` +
    `acc single=${(accA * 100).toFixed(1)}%  council=${(accB * 100).toFixed(1)}%  Δ=${(accDelta * 100).toFixed(1)}pp\n` +
    `open (n=${open.length}): council win=${wins} tie=${ties} loss=${losses}  ` +
    `win-share=${(winShare.p * 100).toFixed(0)}% CI95=[${(winShare.lo * 100).toFixed(0)},${(winShare.hi * 100).toFixed(0)}]\n` +
    `ACT recalib: v1 CONFIRMED=${act_recalibration.v1_confirmed_only.act_precision} (n=${act_recalibration.v1_confirmed_only.n}) → ` +
    `v2 CONFIRMED∧conf≥${ACT_FLOOR}=${act_recalibration.v2_confirmed_and_conf_ge_floor.act_precision} (n=${act_recalibration.v2_confirmed_and_conf_ge_floor.n})\n` +
    `cost: A=$${totCostA.toFixed(4)} B=$${totCostB.toFixed(4)} · latency A=${(totLatA / 1000).toFixed(0)}s B=${(totLatB / 1000).toFixed(0)}s\n` +
    `DECISION: ${decision}\n${recommendation}\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`quality-eval error: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
