// quality-eval-paired.ts — Round 2 W5: TRUE paired A/B with McNemar-valid premise.
//
// Paired design: runs deliberation ONCE per item (seed=42, temp=0 → deterministic).
// Applies TWO winner-selection strategies post-hoc to the SAME transcript:
//   ln-on (NEW/agreement): competence-weighted self-consistency cluster (W3 default)
//   ln-off (OLD/legacy):   peer-vote rank → score → position-stable (pre-W2 revert)
// Single-A is IDENTICAL in both arms (one model call, same seed → same output).
// McNemar exact test on discordant verifiable pairs (premise INTACT: same transcript).
//
// Pre-registered bars (BEFORE running):
//   Re-cert: council_off (legacy) verifiable acc ≥ 84.4% seeded
//   McNemar: p < 0.05 to call a significant difference
//
// Doctrine §5: no fabrication; ties and losses reported; bar fixed above, before run.
//
// Run from packages/council:
//   EVAL_LIMIT=3 ../cli/node_modules/.bin/tsx scripts/quality-eval-paired.ts   # smoke
//   ../cli/node_modules/.bin/tsx scripts/quality-eval-paired.ts                 # full

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { review } from "../../validation/src/adversarial/reviewer.ts";
import { vote } from "../../validation/src/adversarial/voter.ts";
import type { ReviewResult, ReviewTarget, Lens, LlmCaller, VoteResult } from "../../validation/src/adversarial/reviewer.ts";
import { gradeVerifiable, wilson } from "./quality-grade.ts";

// ──────────────────────────────── config ─────────────────────────────────────
const SEAT_IDS = (process.env.EVAL_SEATS ?? "qwen2.5-coder:7b,qwen2.5:3b,qwen2.5-coder:14b").split(",").map(s => s.trim());
const SINGLE_ID  = process.env.EVAL_SINGLE ?? "qwen2.5-coder:14b"; // strongest single → fair baseline
const JUDGE_ID   = process.env.EVAL_JUDGE  ?? "gemma3:12b";        // cross-vendor judge for open items
const SEED       = 42;
const LIMIT      = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : Infinity;
const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const TIMEOUT_MS = 240_000; // 4 min per call

// Pre-registered re-cert bar (fixed before running, cannot be changed after):
const RECERT_BAR = 0.844; // 84.4% council verifiable acc seeded (same as original gate)

// ──────────────────────────── seeded caller ───────────────────────────────────
async function callSeeded(id: string, prompt: string): Promise<{ text: string; error: string | null; latencyMs: number }> {
  try {
    const body = JSON.stringify({ model: id, prompt, stream: false, options: { temperature: 0, seed: SEED } });
    const r = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { text: "", error: `HTTP ${r.status}`, latencyMs: 0 };
    const j = await r.json() as Record<string, unknown>;
    const latencyMs = j["eval_duration"] ? Math.round((j["eval_duration"] as number) / 1e6) : 0;
    return { text: (j["response"] as string | undefined) ?? "", error: null, latencyMs };
  } catch (e) {
    return { text: "", error: (e as Error).message, latencyMs: 0 };
  }
}

/** LlmCaller (Promise<string>) wrapper for review() compatibility. */
function makeLlmCaller(id: string): LlmCaller {
  return async (prompt: string): Promise<string> => {
    const { text } = await callSeeded(id, prompt);
    return text;
  };
}

// ─────────────────────── open-item pairwise judge ────────────────────────────
const RUBRIC_PREFACE =
  "You are an impartial judge. Compare two answers to the same question. Judge ONLY by " +
  "correctness, soundness, and usefulness. LENGTH-NEUTRAL: a concise correct answer must " +
  "NOT be penalised for being shorter, and verbosity must NOT be rewarded. Ignore style and " +
  "formatting. If they are equally good, say tie. End your reply with exactly one line: " +
  "'VERDICT: 1' or 'VERDICT: 2' or 'VERDICT: tie'.";

function parseJudgeVerdict(text: string): "1" | "2" | "tie" | null {
  const m = text.match(/VERDICT:\s*(1|2|tie)/i);
  if (m) return m[1].toLowerCase() as "1" | "2" | "tie";
  const t = text.trim().toLowerCase();
  if (/\btie\b/.test(t.slice(-20))) return "tie";
  const last = (t.match(/\b(1|2)\b/g) ?? []).pop();
  return (last as "1" | "2") ?? null;
}

async function judgePairwise(q: string, rubric: string, r1: string, r2: string): Promise<"B_on" | "B_off" | "A" | "tie" | null> {
  // Single blind order: Response1=single(A), Response2=council(B)
  // Note: for open items we have one council winner (on or off may differ).
  // We judge A vs the AGREEMENT winner (ln-on) since that's the current production code.
  const prompt = `${RUBRIC_PREFACE}\n\nRUBRIC for a good answer: ${rubric}\n\nQUESTION:\n${q}\n\n--- Response 1 ---\n${r1}\n\n--- Response 2 ---\n${r2}\n\nWhich response is better?`;
  const judgeCall = makeLlmCaller(JUDGE_ID);
  const o1 = parseJudgeVerdict(await judgeCall(prompt));
  const o2 = parseJudgeVerdict(await judgeCall(`${RUBRIC_PREFACE}\n\nRUBRIC for a good answer: ${rubric}\n\nQUESTION:\n${q}\n\n--- Response 1 ---\n${r2}\n\n--- Response 2 ---\n${r1}\n\nWhich response is better?`));
  // map1: 1=A,2=B; map2: 1=B,2=A
  const map1 = o1 === "1" ? "A" : o1 === "2" ? "B" : o1 === "tie" ? "tie" : null;
  const map2 = o2 === "1" ? "B" : o2 === "2" ? "A" : o2 === "tie" ? "tie" : null;
  const s = (m: string | null) => m === "B" ? 1 : m === "A" ? -1 : 0;
  const sc = s(map1) + s(map2);
  return sc > 0 ? "B_on" : sc < 0 ? "A" : "tie";
}

// ───────────────── agreement winner selection (W3 / ln-on) ───────────────────
// Inline implementation of agreement.ts (additive, from pilar/council).

function normalizeAnswer(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/```[a-z]*\n?|```/g, " ")
    .replace(/[\s ]+/g, " ")
    .replace(/^[\s"'`*_(]+|[\s"'`*_).,;:!?]+$/g, "")
    .trim();
}

function seatCompetence(seatId: string): number {
  const id = (seatId || "").toLowerCase();
  const m = id.match(/(\d+(?:\.\d+)?)\s*b\b/);
  const params = m ? Number(m[1]) : NaN;
  let base: number;
  if (!Number.isFinite(params)) base = 2;
  else if (params >= 30) base = 4;
  else if (params >= 12) base = 3;
  else if (params >= 7) base = 2;
  else base = 1;
  const coderBonus = /coder|code/.test(id) ? 1 : 0;
  return base + coderBonus;
}

function selectWinnerByAgreement(candidates: { seatId: string; text: string }[]): string | null {
  if (candidates.length === 0) return null;
  const byKey = new Map<string, { members: string[]; weight: number; topCompetence: number; size: number }>();
  for (const c of candidates) {
    const key = normalizeAnswer(c.text);
    const w = seatCompetence(c.seatId);
    const cur = byKey.get(key);
    if (cur) {
      cur.members.push(c.seatId);
      cur.weight += w;
      cur.topCompetence = Math.max(cur.topCompetence, w);
      cur.size += 1;
    } else {
      byKey.set(key, { members: [c.seatId], weight: w, topCompetence: w, size: 1 });
    }
  }
  const minId = (cl: { members: string[] }) => [...cl.members].sort()[0];
  const clusters = [...byKey.values()].sort((a, b) =>
    b.weight - a.weight || b.topCompetence - a.topCompetence || b.size - a.size || (minId(a) < minId(b) ? -1 : 1),
  );
  const top = clusters[0];
  const lenOf = (id: string) => candidates.find(c => c.seatId === id)!.text.trim().length;
  return [...top.members].sort(
    (a, b) => seatCompetence(b) - seatCompetence(a) || lenOf(a) - lenOf(b) || (a < b ? -1 : 1),
  )[0];
}

// ─────────────── legacy winner selection (pre-W2 / ln-off) ───────────────────
// Mirrors current branch deliberate.ts betterVote + pickWinner loop exactly.

function selectLegacy(candidates: { seatId: string }[], voteOf: (id: string) => VoteResult): string {
  const rank = (v: VoteResult) => v.convergence === "CONFIRMED" ? 2 : v.convergence === "UNCERTAIN" ? 1 : 0;
  let id = candidates[0].seatId;
  let v = voteOf(id);
  for (const c of candidates) {
    const cv = voteOf(c.seatId);
    // betterVote: higher rank wins; equal rank → higher score wins (first keeps on tie, since >= not >).
    if (rank(cv) > rank(v) || (rank(cv) === rank(v) && cv.score > v.score)) {
      v = cv; id = c.seatId;
    }
  }
  return id;
}

// ────────────────────────── McNemar exact ────────────────────────────────────
function mcnemar(b: number, c: number): { p: number; direction: number } {
  // Exact binomial: P(X >= max(b,c) | n=b+c, p=0.5) * 2, clamped to 1.
  const n = b + c;
  if (n === 0) return { p: 1, direction: 0 };
  const k = Math.max(b, c);
  let p = 0;
  for (let i = k; i <= n; i++) {
    const lc = lfact(n) - lfact(i) - lfact(n - i) - n * Math.log(2);
    p += Math.exp(lc);
  }
  p = Math.min(1, 2 * p);
  return { p, direction: b > c ? 1 : b < c ? -1 : 0 };
}
function lfact(n: number): number {
  if (n <= 1) return 0;
  let r = 0; for (let i = 2; i <= n; i++) r += Math.log(i); return r;
}

// ──────────────────────────── dataset ────────────────────────────────────────
interface Item {
  id: string; category: string; verifiable: boolean;
  prompt: string; ground_truth?: string; grading: string; rubric?: string;
}
function loadDataset(): Item[] {
  const url = new URL("../eval/dataset.jsonl", import.meta.url);
  return readFileSync(url, "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as Item);
}

// ──────────────────────────────── main ───────────────────────────────────────
async function main() {
  const all = loadDataset();
  const items = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
  process.stdout.write(
    `COUNCIL QUALITY EVAL — PAIRED A/B (W5 Round 2)\n` +
    `  seats: ${SEAT_IDS.join(", ")}  |  single: ${SINGLE_ID}  |  judge: ${JUDGE_ID}\n` +
    `  seed: ${SEED}  |  temp: 0 (deterministic)  |  n_items: ${items.length}/${all.length}\n` +
    `  strategies: ln-on=agreement(W3) / ln-off=legacy(pre-W2)\n` +
    `  pre-registered bar: council_off verifiable ≥ ${(RECERT_BAR * 100).toFixed(1)}% for re-cert\n\n`,
  );

  const progressUrl = new URL("./quality-eval-paired-progress.jsonl", import.meta.url);
  // Resume support: skip already-done ids.
  const doneIds = new Set<string>();
  const rows: any[] = [];
  if (existsSync(progressUrl)) {
    const lines = readFileSync(progressUrl, "utf8").split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      try { const r = JSON.parse(line); if (r.id) { doneIds.add(r.id); rows.push(r); } } catch { /* skip */ }
    }
    if (doneIds.size > 0) process.stdout.write(`  resuming: ${doneIds.size} items already done\n\n`);
  }

  let idx = 0;
  for (const item of items) {
    idx++;
    if (doneIds.has(item.id)) { process.stdout.write(`[${idx}/${items.length}] ${item.id} SKIP (already done)\n`); continue; }

    process.stdout.write(`[${idx}/${items.length}] ${item.id} (${item.verifiable ? "ver" : "open"}) …\n`);

    // ── Phase 1: single model + seat generation (all seeded, in parallel) ──────
    const [singleOut, ...seatOuts] = await Promise.all([
      callSeeded(SINGLE_ID, item.prompt),
      ...SEAT_IDS.map(id => callSeeded(id, item.prompt)),
    ]);
    const ansA = singleOut.text.trim();

    // Candidates: seats that responded without error
    const candidates = SEAT_IDS
      .map((id, i) => ({ seatId: id, text: seatOuts[i].text.trim(), error: seatOuts[i].error }))
      .filter(c => !c.error && c.text.length > 0);

    if (candidates.length === 0) {
      process.stdout.write(`  → all seats errored, skipping\n`);
      continue;
    }

    // ── Phase 2: cross-review (each seat reviews ALL other candidates, lens=correctness) ──
    const reviewsByCandidate = new Map<string, ReviewResult[]>();
    for (const c of candidates) reviewsByCandidate.set(c.seatId, []);

    const reviewTasks: Array<() => Promise<void>> = [];
    for (const cand of candidates) {
      const target: ReviewTarget = { id: cand.seatId, claim: cand.text, context: item.prompt };
      for (const seat of SEAT_IDS) {
        if (seat === cand.seatId) continue;
        const caller = makeLlmCaller(seat);
        reviewTasks.push(async () => {
          const rr = await review(target, "correctness", caller, `${seat}:correctness`);
          reviewsByCandidate.get(cand.seatId)!.push(rr);
        });
      }
    }
    // Run reviews in limited parallel (2 at a time to avoid Ollama thrashing)
    await runLimited(reviewTasks, 2);

    const voteOf = (id: string) => vote(reviewsByCandidate.get(id) ?? [], { threshold: 0.5 });

    // ── Winner selection: two strategies from the SAME transcript ─────────────
    const winnerId_on  = selectWinnerByAgreement(candidates) ?? candidates[0].seatId;
    const winnerId_off = selectLegacy(candidates, voteOf);
    const ansB_on  = candidates.find(c => c.seatId === winnerId_on)!.text;
    const ansB_off = candidates.find(c => c.seatId === winnerId_off)!.text;
    const winnerChanged = winnerId_on !== winnerId_off;

    // ── Grading ────────────────────────────────────────────────────────────────
    const row: Record<string, unknown> = {
      id: item.id, category: item.category, verifiable: item.verifiable,
      winnerId_on, winnerId_off, winnerChanged,
      voteScore_on:  Math.round(voteOf(winnerId_on).score  * 1000) / 1000,
      voteScore_off: Math.round(voteOf(winnerId_off).score * 1000) / 1000,
      convergence_on:  voteOf(winnerId_on).convergence,
      convergence_off: voteOf(winnerId_off).convergence,
    };

    if (item.verifiable) {
      row["correctA"]   = gradeVerifiable(item, ansA);
      row["correct_on"] = gradeVerifiable(item, ansB_on);
      row["correct_off"]= gradeVerifiable(item, ansB_off);
      const ca = row["correctA"], co = row["correct_on"], cf = row["correct_off"];
      process.stdout.write(
        `  single=${ca === null ? "n/a" : ca ? "✓" : "✗"}  ` +
        `on(agr)=${co === null ? "n/a" : co ? "✓" : "✗"}  ` +
        `off(leg)=${cf === null ? "n/a" : cf ? "✓" : "✗"}  ` +
        `winnerChanged=${winnerChanged}\n`,
      );
    } else {
      // Open: judge single vs agreement council winner
      const pj = await judgePairwise(item.prompt, item.rubric ?? "correctness and usefulness", ansA, ansB_on);
      row["pairwise_on"] = pj;
      process.stdout.write(`  open: judge A vs council_on → ${pj}\n`);
    }

    rows.push(row);
    try { writeFileSync(progressUrl, rows.map(r => JSON.stringify(r)).join("\n") + "\n"); } catch { /* best effort */ }
  }

  // ── Aggregate ────────────────────────────────────────────────────────────────
  const ver = rows.filter(r => r.verifiable && r.correctA !== null && r.correct_on !== null && r.correct_off !== null);
  const accA   = ver.length ? ver.filter(r => r.correctA  ).length / ver.length : 0;
  const acc_on = ver.length ? ver.filter(r => r.correct_on).length / ver.length : 0;
  const acc_off= ver.length ? ver.filter(r => r.correct_off).length / ver.length : 0;

  // McNemar: compare ln-on (agreement) vs ln-off (legacy) directly.
  // b = on=false, off=true (legacy helped vs agreement)
  // c = on=true,  off=false (agreement helped vs legacy)
  const b = ver.filter(r => !r.correct_on &&  r.correct_off).length;
  const c = ver.filter(r =>  r.correct_on && !r.correct_off).length;
  const mn = mcnemar(b, c);

  // Re-cert check (legacy/off vs pre-registered bar)
  const recertPass = acc_off >= RECERT_BAR;

  // ACT recalibration: convergence=CONFIRMED as confidence proxy
  const verConf = ver.filter(r => r.convergence_off === "CONFIRMED");
  const actPrecision_off = verConf.length ? verConf.filter(r => r.correct_off).length / verConf.length : null;

  // Open items
  const open = rows.filter(r => !r.verifiable);
  const wins = open.filter(r => r.pairwise_on === "B_on").length;
  const losses = open.filter(r => r.pairwise_on === "A").length;
  const ties = open.filter(r => r.pairwise_on === "tie").length;

  // Single-A sanity check: should be IDENTICAL in both arms (same seed). Reported as acc_single.
  process.stdout.write(`\n── SUMMARY ──────────────────────────────────────────\n`);
  process.stdout.write(`verifiable (n=${ver.length}): single=${(accA*100).toFixed(1)}%  on(agr)=${(acc_on*100).toFixed(1)}%  off(leg)=${(acc_off*100).toFixed(1)}%\n`);
  process.stdout.write(`McNemar (on vs off): b=${b} c=${c} p=${mn.p.toFixed(4)} direction=${mn.direction > 0 ? "on>off" : mn.direction < 0 ? "off>on" : "tie"}\n`);
  process.stdout.write(`Re-cert bar ≥${(RECERT_BAR*100).toFixed(1)}%: off(legacy)=${(acc_off*100).toFixed(1)}% → ${recertPass ? "PASS ✓" : "FAIL ✗"}\n`);
  process.stdout.write(`winner changed: ${ver.filter(r => r.winnerChanged).length}/${ver.length} verifiable items\n`);
  process.stdout.write(`open (n=${open.length}): council_on win=${wins} tie=${ties} loss=${losses}\n`);
  process.stdout.write(`ACT off(CONFIRMED): n=${verConf.length}  precision=${actPrecision_off !== null ? (actPrecision_off*100).toFixed(1)+"%" : "n/a"}\n`);

  const verdict = mn.p < 0.05 ? (mn.direction > 0 ? "ON_BETTER" : "OFF_BETTER") : "NEUTRAL";
  const recertDecision = recertPass ? "KEEP_REVERT" : "REVERT_FAILS_BAR";

  const results = {
    meta: {
      script: "quality-eval-paired.ts",
      wave: "W5",
      round: 2,
      design: "ONE_PASS_PAIRED — same deliberation transcript, two winner strategies post-hoc",
      seed: SEED,
      temperature: 0,
      seats: SEAT_IDS,
      single: SINGLE_ID,
      judge: JUDGE_ID,
      n_items: items.length,
      n_all: all.length,
      strategies: { ln_on: "agreement (W3 / pilar/council default)", ln_off: "legacy (pre-W2 / reverted)" },
      classify_sha_frozen: "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
      prereq_mcnemar: "Single-A IDENTICAL (one call, same seed) → decode noise cancelled. Premise INTACT.",
    },
    prereg_bar: `council_off (legacy) verifiable acc ≥ ${(RECERT_BAR*100).toFixed(1)}% seeded. Fixed before running.`,
    verifiable: {
      n_graded: ver.length,
      acc_single_A: +accA.toFixed(3),
      acc_council_on: +acc_on.toFixed(3),
      acc_council_off: +acc_off.toFixed(3),
      delta_on_vs_single: +(acc_on - accA).toFixed(3),
      delta_off_vs_single: +(acc_off - accA).toFixed(3),
    },
    paired_ab: {
      n_common: ver.length,
      winner_changed: { n: ver.filter(r => r.winnerChanged).length, rate: +(ver.filter(r => r.winnerChanged).length / Math.max(1, ver.length)).toFixed(3) },
      b_off_helped_vs_on: b,
      c_on_helped_vs_off: c,
      mcnemar: { b, c, n: b + c, p: +mn.p.toFixed(6), direction: mn.direction },
      verdict,
    },
    recert: {
      bar: RECERT_BAR,
      acc_council_off: +acc_off.toFixed(3),
      pass: recertPass,
      decision: recertDecision,
    },
    act_recalibration: {
      arm_off: { n_confirmed: verConf.length, act_precision: actPrecision_off !== null ? +actPrecision_off.toFixed(3) : null },
      note: "CONFIRMED convergence as proxy for high-confidence items (floor=0.5 via voteThreshold default). n_confirmed=0 means no items reached CONFIRMED convergence in 1 round with seed=42.",
    },
    open: { n: open.length, wins_council_on: wins, ties, losses_single_A: losses },
    rows,
  };

  writeFileSync(new URL("./quality-eval-paired-results.json", import.meta.url), JSON.stringify(results, null, 2));
  process.stdout.write(`\nresults → quality-eval-paired-results.json\n`);
  process.exit(0);
}

/** Run tasks with limited parallelism. */
async function runLimited(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (t) await t().catch(() => { /* reviewer errors handled inside review() */ });
    }
  });
  await Promise.all(workers);
}

main().catch(e => {
  process.stderr.write(`quality-eval-paired error: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
