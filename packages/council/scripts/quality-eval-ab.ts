// COUNCIL QUALITY EVAL — PAIRED A/B analyzer (length-neutral winner-selection isolation)
//
// WHY THIS EXISTS (W3). The headline quality-eval compares two INDEPENDENT draws
// (new code run vs old code run). Caveat (5) of that eval measures the noise floor of a
// single draw directly: single-A correctness flips 4/32 and council-B flips 7/32 between
// two runs at IDENTICAL code. So a 6.3pp verifiable Δ from independent draws is WITHIN the
// decode-noise band — it certifies neither a win nor a regression for the W2 change.
//
// THE FIX IS PAIRING. Run the council twice at the SAME --seed=N: once with the
// length-neutral tiebreak (--tag=ln-on, production default) and once with the pre-W2
// position-stable tiebreak (--no-length-neutral --tag=ln-off). Because generation is seeded
// (temperature 0 + fixed seed) and the winner is chosen AFTER cross-exam, the two runs share
// an IDENTICAL deliberation transcript per item — the ONLY thing that can differ is which
// candidate `pickWinner` selects. Decode noise is therefore CANCELLED, and any per-item
// outcome difference is attributable to the length-neutral change alone. The correct test for
// such paired binary outcomes is McNemar's exact (sign) test on the discordant pairs.
//
// THE DECISION RESTS ON THE DETERMINISTIC ARM. Verifiable items are graded by execution /
// gabarito (no LLM); open items are graded by a cross-vendor LLM judge. Pooling the two into
// one McNemar mixes grading processes of very different reliability, so the keep/revert verdict
// is driven by the VERIFIABLE McNemar alone; the open arm is REPORTED as corroboration but can
// never single-handedly trigger a revert. This is the honest hierarchy of evidence.
//
// HONESTY (Doctrine §5). Reads only the two seeded progress files; computes everything from
// their rows; fabricates nothing. NEUTRAL (the change moved no graded outcome) is the most
// likely honest result, since the tiebreak only bites when |Δscore| ≤ ε — and that is itself
// a finding: a position artifact removed at ~zero quality cost.
//
// Run (from packages/council, AFTER the two seeded passes exist):
//   ../cli/node_modules/.bin/tsx scripts/quality-eval-ab.ts --a=ln-on --b=ln-off [--floor=0.6]
// Inputs:  scripts/quality-eval-progress.<a>.jsonl  and  .<b>.jsonl
// Output:  scripts/quality-eval-ab-results.json  (+ a human summary on stdout)
//
// NOT part of `npm test`. The PURE helpers (mcnemar, analyzePaired, actRecalibration,
// actFloorGrid) ARE unit-tested in tests/quality-eval-ab.test.ts — main() is guarded so
// importing this file runs nothing.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { wilson } from "./quality-grade.ts";

// ─────────────────────────────── row shape ──────────────────────────────────
// Mirror of the per-item rows checkpointed by quality-eval.ts (quality-eval-progress.<tag>.jsonl).
export interface EvalRow {
  id: string;
  category?: string;
  verifiable: boolean;
  grading?: string;
  convergence?: string;
  confidence?: number;
  winnerSeat?: string | null;
  correctA?: boolean | null;
  correctB?: boolean | null;
  pairwise?: "A" | "B" | "tie";
}

// ───────────────────────────── McNemar exact ────────────────────────────────
/**
 * McNemar's exact (two-sided sign) test on the discordant counts of a paired 2×2 table.
 *   b = pairs where arm-A succeeded and arm-B failed  (here: length-neutral helped)
 *   c = pairs where arm-A failed   and arm-B succeeded (here: length-neutral hurt)
 * Concordant pairs carry no information and are excluded by construction. Under H0 each of
 * the n = b+c discordant pairs flips by chance with prob 0.5, so the exact two-sided p-value
 * is min(1, 2·P(X ≤ min(b,c))) with X ~ Binomial(n, 0.5). `direction` = sign(b − c): +1 means
 * arm-A (length-neutral) won the net of the discordant pairs, −1 means it lost, 0 means a tie.
 * n = 0 (no discordance) → p = 1, direction = 0 (the change moved nothing).
 */
export function mcnemar(b: number, c: number): { b: number; c: number; n: number; p: number; direction: number } {
  const n = b + c;
  if (n === 0) return { b, c, n: 0, p: 1, direction: 0 };
  const k = Math.min(b, c);
  // Cumulative binomial P(X ≤ k) built iteratively: pmf(i) = pmf(i-1)·(n-i+1)/i, pmf(0)=0.5^n.
  let pmf = Math.pow(0.5, n);
  let cum = pmf;
  for (let i = 1; i <= k; i++) {
    pmf = (pmf * (n - i + 1)) / i;
    cum += pmf;
  }
  return { b, c, n, p: Math.min(1, 2 * cum), direction: Math.sign(b - c) };
}

// ───────────────────────────── paired analysis ──────────────────────────────
const SIG = 0.05; // significance level for "significantly worse" (the only thing that can REVERT)

/** Council outcome of an OPEN item as a signed score: council win = +1, loss = −1, tie = 0. */
function openScore(p: EvalRow["pairwise"]): number {
  return p === "B" ? 1 : p === "A" ? -1 : 0;
}

type McNemar = ReturnType<typeof mcnemar>;

export interface PairedResult {
  arms: { a: string; b: string };
  n_common: number;
  gradable: number;
  winner_changed: { n: number; verifiable: number; open: number; rate: number; rate_ci95: [number, number]; ids: string[] };
  verifiable: { n_graded: number; b_a_helped: number; c_a_hurt: number; concordant: number; mcnemar: McNemar; acc_a: number; acc_b: number };
  open: { n_graded: number; b_a_helped: number; c_a_hurt: number; concordant: number; mcnemar: McNemar };
  combined_context: { b_a_helped: number; c_a_hurt: number; mcnemar: McNemar };
  by_category: Array<{ category: string; n: number; winner_changed: number; ver_helped: number; ver_hurt: number }>;
  primary_signal: "verifiable";
  verdict: "IMPROVE" | "NEUTRAL" | "REGRESS";
  recommendation: "KEEP_LENGTH_NEUTRAL" | "REVERT_TO_POSITION_STABLE";
  rationale: string;
}

/**
 * Join two seeded arms by id and run the paired comparison. arm `a` is the length-neutral
 * (production) arm; arm `b` is the position-stable (pre-W2) arm. Only items present in BOTH
 * and gradable in both contribute. The keep/revert verdict is driven by the VERIFIABLE McNemar
 * (deterministic); the open McNemar and the pooled count are reported for context only.
 */
export function analyzePaired(rowsA: EvalRow[], rowsB: EvalRow[], aTag = "a", bTag = "b"): PairedResult {
  const byId = new Map<string, EvalRow>();
  for (const r of rowsB) byId.set(r.id, r);
  const pairs: Array<{ a: EvalRow; b: EvalRow }> = [];
  for (const a of rowsA) {
    const b = byId.get(a.id);
    if (b) pairs.push({ a, b });
  }

  const isVerGradable = (a: EvalRow, b: EvalRow) => a.verifiable && typeof a.correctB === "boolean" && typeof b.correctB === "boolean";
  const isOpenGradable = (a: EvalRow, b: EvalRow) => !a.verifiable && a.pairwise != null && b.pairwise != null;

  // Blast radius: on how many gradable items did the tiebreak actually pick a different seat?
  const gradable = pairs.filter(({ a, b }) => isVerGradable(a, b) || isOpenGradable(a, b));
  const changedPairs = gradable.filter(({ a, b }) => (a.winnerSeat ?? null) !== (b.winnerSeat ?? null));
  const changedVer = changedPairs.filter(({ a }) => a.verifiable).length;
  const wc = wilson(changedPairs.length, gradable.length);

  // Verifiable paired table (deterministic grading — the decision signal).
  const ver = pairs.filter(({ a, b }) => isVerGradable(a, b));
  let vB = 0, vC = 0, vConc = 0, accAn = 0, accBn = 0;
  for (const { a, b } of ver) {
    if (a.correctB) accAn++;
    if (b.correctB) accBn++;
    if (a.correctB && !b.correctB) vB++;        // length-neutral correct, position-stable wrong
    else if (!a.correctB && b.correctB) vC++;   // length-neutral wrong, position-stable correct
    else vConc++;
  }

  // Open paired table (cross-vendor blind pairwise — corroboration only at this N).
  const open = pairs.filter(({ a, b }) => isOpenGradable(a, b));
  let oB = 0, oC = 0, oConc = 0;
  for (const { a, b } of open) {
    const d = openScore(a.pairwise) - openScore(b.pairwise);
    if (d > 0) oB++;          // council outcome better under length-neutral
    else if (d < 0) oC++;     // council outcome worse under length-neutral
    else oConc++;
  }

  const verMc = mcnemar(vB, vC);
  const openMc = mcnemar(oB, oC);
  const combMc = mcnemar(vB + oB, vC + oC);

  // Per-category diagnosis: where does the tiebreak actually move things?
  const cats = [...new Set(gradable.map(({ a }) => a.category ?? "?"))].sort();
  const by_category = cats.map((category) => {
    const items = gradable.filter(({ a }) => (a.category ?? "?") === category);
    const ch = items.filter(({ a, b }) => (a.winnerSeat ?? null) !== (b.winnerSeat ?? null)).length;
    let hb = 0, hc = 0;
    for (const { a, b } of items.filter(({ a }) => a.verifiable)) {
      if (a.correctB && !b.correctB) hb++;
      else if (!a.correctB && b.correctB) hc++;
    }
    return { category, n: items.length, winner_changed: ch, ver_helped: hb, ver_hurt: hc };
  });

  // ── verdict (verifiable-primary) ───────────────────────────────────────────
  // REVERT only on a DETERMINISTIC significant paired loss; IMPROVE on a deterministic
  // significant paired win; otherwise KEEP (a position artifact removed at no measured cost).
  const openHint = oB === oC ? "open arm neutral" : oB > oC ? `open arm corroborates (helped ${oB}, hurt ${oC})` : `open arm leans negative (helped ${oB}, hurt ${oC}) — not decisive (judge-noisy)`;
  let verdict: PairedResult["verdict"];
  let recommendation: PairedResult["recommendation"];
  let rationale: string;
  if (verMc.n === 0 && oB + oC === 0) {
    verdict = "NEUTRAL";
    recommendation = "KEEP_LENGTH_NEUTRAL";
    rationale = `Length-neutral moved ZERO graded outcomes at this seed (all ${gradable.length} gradable items concordant). It removed a position artifact at zero measured quality cost → keep the default.`;
  } else if (verMc.direction < 0 && verMc.p < SIG) {
    verdict = "REGRESS";
    recommendation = "REVERT_TO_POSITION_STABLE";
    rationale = `VERIFIABLE paired LOSS: helped ${vB}, hurt ${vC}, McNemar p=${verMc.p.toFixed(4)} < ${SIG} (deterministic). Flip the deliberate.ts default to position-stable; keep length-neutral behind the flag. (${openHint}.)`;
  } else if (verMc.direction > 0 && verMc.p < SIG) {
    verdict = "IMPROVE";
    recommendation = "KEEP_LENGTH_NEUTRAL";
    rationale = `VERIFIABLE paired WIN: helped ${vB}, hurt ${vC}, McNemar p=${verMc.p.toFixed(4)} < ${SIG} (deterministic). Keep the default. (${openHint}.)`;
  } else {
    verdict = "NEUTRAL";
    recommendation = "KEEP_LENGTH_NEUTRAL";
    rationale = `No significant verifiable difference (helped ${vB}, hurt ${vC}, McNemar p=${verMc.p.toFixed(4)}). Not a proven lift, but NOT a regression — keep the default (position-free + concise) as the safer tiebreak. (${openHint}.)`;
  }

  return {
    arms: { a: aTag, b: bTag },
    n_common: pairs.length,
    gradable: gradable.length,
    winner_changed: { n: changedPairs.length, verifiable: changedVer, open: changedPairs.length - changedVer, rate: gradable.length ? +(changedPairs.length / gradable.length).toFixed(3) : 0, rate_ci95: [+wc.lo.toFixed(3), +wc.hi.toFixed(3)], ids: changedPairs.map((p) => p.a.id) },
    verifiable: { n_graded: ver.length, b_a_helped: vB, c_a_hurt: vC, concordant: vConc, mcnemar: verMc, acc_a: ver.length ? +(accAn / ver.length).toFixed(3) : 0, acc_b: ver.length ? +(accBn / ver.length).toFixed(3) : 0 },
    open: { n_graded: open.length, b_a_helped: oB, c_a_hurt: oC, concordant: oConc, mcnemar: openMc },
    combined_context: { b_a_helped: vB + oB, c_a_hurt: vC + oC, mcnemar: combMc },
    by_category,
    primary_signal: "verifiable",
    verdict, recommendation, rationale,
  };
}

// ─────────────────── ACT-floor recalibration (Round B, per arm) ──────────────
/**
 * P(correct | gate fires) for v1 (CONFIRMED alone) vs v2 (CONFIRMED ∧ confidence ≥ floor) on
 * an arm's verifiable rows. Pure post-hoc over rows — re-runs NO model. The W2 claim is that
 * v2 is more precise than v1; this measures it honestly on the seeded data.
 */
export function actRecalibration(rows: EvalRow[], floor = 0.6) {
  const ver = rows.filter((r) => r.verifiable && typeof r.correctB === "boolean");
  const prec = (rs: EvalRow[]) => (rs.length ? +(rs.filter((r) => r.correctB).length / rs.length).toFixed(3) : null);
  const v1 = ver.filter((r) => r.convergence === "CONFIRMED");
  const v2 = ver.filter((r) => r.convergence === "CONFIRMED" && (r.confidence ?? 0) >= floor);
  const p1 = prec(v1), p2 = prec(v2);
  return {
    floor,
    v1_confirmed_only: { n: v1.length, act_precision: p1 },
    v2_confirmed_and_conf_ge_floor: { n: v2.length, act_precision: p2 },
    improvement_pp: p1 != null && p2 != null ? +(((p2 - p1) * 100)).toFixed(1) : null,
    v2_beats_v1: p1 != null && p2 != null ? p2 > p1 : null, // STRICT: a tie is no justification for the floor
  };
}

/**
 * Grid-search the ACT confidence floor over candidate values, trading precision against
 * coverage (the fraction of CONFIRMED verdicts that still fire ACT). Pure post-hoc over rows —
 * NO model re-run. `best` = the floor that maximises ACT precision while keeping ACT coverage
 * ≥ `minCoverage` AND STRICTLY beating the v1 (CONFIRMED-alone) precision; ties break toward
 * MORE coverage (the lower floor). A floor that merely TIES v1 is not a justification — it only
 * shrinks coverage for no precision gain. If no candidate strictly beats v1 at adequate
 * coverage, `best` is null — the honest signal to revert the floor to 0 and document that the
 * inversion is not robustly fixable on this dataset.
 */
export function actFloorGrid(rows: EvalRow[], floors: number[] = [0.5, 0.55, 0.6, 0.65], minCoverage = 0.3) {
  const ver = rows.filter((r) => r.verifiable && typeof r.correctB === "boolean");
  const confirmed = ver.filter((r) => r.convergence === "CONFIRMED");
  const v1Prec = confirmed.length ? confirmed.filter((r) => r.correctB).length / confirmed.length : null;
  const grid = floors.map((floor) => {
    const gate = confirmed.filter((r) => (r.confidence ?? 0) >= floor);
    const prec = gate.length ? gate.filter((r) => r.correctB).length / gate.length : null;
    const coverage = confirmed.length ? gate.length / confirmed.length : null;
    return {
      floor,
      n_fires: gate.length,
      coverage: coverage != null ? +coverage.toFixed(3) : null,
      act_precision: prec != null ? +prec.toFixed(3) : null,
      beats_v1: prec != null && v1Prec != null ? prec > v1Prec : null, // STRICT improvement only
    };
  });
  // Eligible = strictly beats v1 AND keeps enough coverage. Choose max precision, then max coverage.
  const eligible = grid.filter((g) => g.beats_v1 === true && (g.coverage ?? 0) >= minCoverage && g.act_precision != null);
  eligible.sort((x, y) => (y.act_precision! - x.act_precision!) || ((y.coverage ?? 0) - (x.coverage ?? 0)));
  const best = eligible[0]
    ? { floor: eligible[0].floor, act_precision: eligible[0].act_precision, coverage: eligible[0].coverage }
    : null;
  return {
    v1_confirmed_only: { n: confirmed.length, act_precision: v1Prec != null ? +v1Prec.toFixed(3) : null },
    min_coverage: minCoverage,
    grid,
    best,
    recommendation: best ? `SET_FLOOR_${best.floor}` : "REVERT_FLOOR_TO_0",
  };
}

// ──────────────────────────────── io + main ─────────────────────────────────
function loadProgress(tag: string): EvalRow[] {
  const suffix = tag ? "." + tag : "";
  const url = new URL(`./quality-eval-progress${suffix}.jsonl`, import.meta.url);
  let text: string;
  try {
    text = readFileSync(url, "utf8");
  } catch {
    throw new Error(`missing ${url.pathname} — run the seeded pass first: tsx scripts/quality-eval.ts --seed=42 ${tag === "ln-off" ? "--no-length-neutral " : ""}--tag=${tag}`);
  }
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as EvalRow);
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
  const aTag = arg("a", "ln-on");
  const bTag = arg("b", "ln-off");
  const floor = Number(arg("floor", "0.6"));

  const rowsA = loadProgress(aTag);
  const rowsB = loadProgress(bTag);
  const paired = analyzePaired(rowsA, rowsB, aTag, bTag);
  const actA = actRecalibration(rowsA, floor);
  const actB = actRecalibration(rowsB, floor);
  const floorGridA = actFloorGrid(rowsA);

  const out = {
    meta: {
      generated_for: "council-quality-eval-paired-ab",
      method: "Same-seed paired A/B: identical deliberation transcript per item, only the winner-selection tiebreak differs. McNemar exact on discordant pairs cancels decode noise. Verdict driven by the deterministic verifiable arm; open arm is corroboration only.",
      arm_a: `${aTag} (length-neutral, production default)`,
      arm_b: `${bTag} (position-stable, pre-W2)`,
      significance_level: SIG,
      classify_sha_frozen: "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
    },
    paired,
    act_recalibration: {
      arm_a: actA, arm_b: actB,
      floor_grid_arm_a: floorGridA,
      note: "Primary arm = arm_a (production, length-neutral). arm_b is a sensitivity check. v2 must beat v1 to justify the W2 ACT confidence floor; the floor_grid picks the best floor at adequate coverage, or signals REVERT_FLOOR_TO_0 if none beats v1.",
    },
  };
  writeFileSync(new URL("./quality-eval-ab-results.json", import.meta.url), JSON.stringify(out, null, 2));

  const p = paired;
  process.stdout.write(
    `\n── PAIRED A/B (same-seed, noise-cancelled) ──\n` +
    `arms: a=${aTag} (length-neutral)  vs  b=${bTag} (position-stable)\n` +
    `common=${p.n_common} gradable=${p.gradable} · winner changed on ${p.winner_changed.n} (ver ${p.winner_changed.verifiable} / open ${p.winner_changed.open}; rate=${(p.winner_changed.rate * 100).toFixed(1)}% CI95=[${(p.winner_changed.rate_ci95[0] * 100).toFixed(0)},${(p.winner_changed.rate_ci95[1] * 100).toFixed(0)}])\n` +
    (p.winner_changed.n ? `  changed ids: ${p.winner_changed.ids.join(", ")}\n` : "") +
    `verifiable (n=${p.verifiable.n_graded}): LN helped ${p.verifiable.b_a_helped}, hurt ${p.verifiable.c_a_hurt}, same ${p.verifiable.concordant} · McNemar p=${p.verifiable.mcnemar.p.toFixed(4)} · accB a=${p.verifiable.acc_a} b=${p.verifiable.acc_b}\n` +
    `open       (n=${p.open.n_graded}): LN helped ${p.open.b_a_helped}, hurt ${p.open.c_a_hurt}, same ${p.open.concordant} · McNemar p=${p.open.mcnemar.p.toFixed(4)} (corroboration only)\n` +
    `ACT floor (arm_a): v1 CONFIRMED=${actA.v1_confirmed_only.act_precision} (n=${actA.v1_confirmed_only.n}) → v2 conf≥${floor}=${actA.v2_confirmed_and_conf_ge_floor.act_precision} (n=${actA.v2_confirmed_and_conf_ge_floor.n}) · v2_beats_v1=${actA.v2_beats_v1} · grid→${floorGridA.recommendation}\n` +
    `\nVERDICT: ${p.verdict} → ${p.recommendation}\n${p.rationale}\n`,
  );
  process.exit(0);
}

// Guard: only run when invoked directly (so the test can import the pure helpers).
function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return pathToFileURL(entry).href === import.meta.url; } catch { return false; }
}
if (isMain()) main();
