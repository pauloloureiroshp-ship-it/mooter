import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mcnemar,
  analyzePaired,
  actRecalibration,
  actFloorGrid,
  type EvalRow,
} from "../scripts/quality-eval-ab.ts";

// ─────────────────────────────── mcnemar() ──────────────────────────────────
test("mcnemar: no discordance (b=c=0) → p=1, direction=0 (the change moved nothing)", () => {
  const r = mcnemar(0, 0);
  assert.equal(r.n, 0);
  assert.equal(r.p, 1);
  assert.equal(r.direction, 0);
});

test("mcnemar: symmetric discordance is never significant and clamps p at 1", () => {
  const r = mcnemar(5, 5);
  assert.equal(r.direction, 0);
  assert.equal(r.p, 1); // 2·P(X≤5) for Binom(10,.5) > 1 → clamped
});

test("mcnemar: known exact value — b=8,c=1 → p=20/512", () => {
  const r = mcnemar(8, 1);
  // 2·(C(9,0)+C(9,1))·0.5^9 = 2·(1+9)/512 = 20/512
  assert.ok(Math.abs(r.p - 20 / 512) < 1e-12, `got ${r.p}`);
  assert.equal(r.direction, 1);
});

test("mcnemar: a clean one-sided sweep b=6,c=0 is significant at 0.05", () => {
  const r = mcnemar(6, 0);
  assert.ok(Math.abs(r.p - 2 * Math.pow(0.5, 6)) < 1e-12); // 0.03125
  assert.ok(r.p < 0.05);
  assert.equal(r.direction, 1);
});

test("mcnemar: is symmetric in (b,c) magnitude, opposite in sign", () => {
  const a = mcnemar(10, 0);
  const b = mcnemar(0, 10);
  assert.equal(a.p, b.p);
  assert.equal(a.direction, 1);
  assert.equal(b.direction, -1);
});

test("mcnemar: p never exceeds 1 across a range of inputs", () => {
  for (let b = 0; b <= 12; b++) for (let c = 0; c <= 12; c++) {
    const r = mcnemar(b, c);
    assert.ok(r.p >= 0 && r.p <= 1, `p out of range for (${b},${c}): ${r.p}`);
  }
});

// ───────────────────────────── analyzePaired() ──────────────────────────────
function verPair(id: string, aCorrect: boolean, bCorrect: boolean, aSeat = "s1", bSeat = "s1", category = "reasoning"): { a: EvalRow; b: EvalRow } {
  const base = { id, verifiable: true as const, grading: "exact_number", category, convergence: "CONFIRMED", confidence: 0.7, correctA: true };
  return { a: { ...base, winnerSeat: aSeat, correctB: aCorrect }, b: { ...base, winnerSeat: bSeat, correctB: bCorrect } };
}
function split(pairs: Array<{ a: EvalRow; b: EvalRow }>): [EvalRow[], EvalRow[]] {
  return [pairs.map((p) => p.a), pairs.map((p) => p.b)];
}

test("analyzePaired: all concordant → NEUTRAL, KEEP, zero verifiable discordance", () => {
  const pairs = ["x1", "x2", "x3"].map((id) => verPair(id, true, true));
  const [A, B] = split(pairs);
  const r = analyzePaired(A, B);
  assert.equal(r.verifiable.mcnemar.n, 0);
  assert.equal(r.combined_context.mcnemar.n, 0);
  assert.equal(r.verdict, "NEUTRAL");
  assert.equal(r.recommendation, "KEEP_LENGTH_NEUTRAL");
  assert.equal(r.winner_changed.n, 0);
});

test("analyzePaired: a significant VERIFIABLE win for length-neutral → IMPROVE, KEEP", () => {
  // 6 items where length-neutral (a) is correct and position-stable (b) is wrong, winner differs.
  const win = Array.from({ length: 6 }, (_, i) => verPair(`w${i}`, true, false, "short", "verbose"));
  const same = [verPair("c1", true, true)];
  const [A, B] = split([...win, ...same]);
  const r = analyzePaired(A, B);
  assert.equal(r.verifiable.b_a_helped, 6);
  assert.equal(r.verifiable.c_a_hurt, 0);
  assert.ok(r.verifiable.mcnemar.p < 0.05);
  assert.equal(r.primary_signal, "verifiable");
  assert.equal(r.verdict, "IMPROVE");
  assert.equal(r.recommendation, "KEEP_LENGTH_NEUTRAL");
  assert.equal(r.winner_changed.n, 6);
  assert.equal(r.winner_changed.verifiable, 6);
  assert.equal(r.winner_changed.open, 0);
});

test("analyzePaired: a significant VERIFIABLE loss for length-neutral → REGRESS, REVERT", () => {
  const loss = Array.from({ length: 6 }, (_, i) => verPair(`l${i}`, false, true, "short", "verbose"));
  const [A, B] = split(loss);
  const r = analyzePaired(A, B);
  assert.equal(r.verifiable.c_a_hurt, 6);
  assert.ok(r.verifiable.mcnemar.p < 0.05);
  assert.equal(r.verdict, "REGRESS");
  assert.equal(r.recommendation, "REVERT_TO_POSITION_STABLE");
});

test("analyzePaired: small non-significant net → NEUTRAL but still KEEP (not a regression)", () => {
  const pairs = [verPair("a", true, false, "s", "v"), verPair("b", true, false, "s", "v"), verPair("c", false, true, "v", "s")];
  const [A, B] = split(pairs);
  const r = analyzePaired(A, B);
  assert.equal(r.verifiable.b_a_helped, 2);
  assert.equal(r.verifiable.c_a_hurt, 1);
  assert.ok(r.verifiable.mcnemar.p >= 0.05); // n=3 can't reach significance
  assert.equal(r.verdict, "NEUTRAL");
  assert.equal(r.recommendation, "KEEP_LENGTH_NEUTRAL");
});

test("analyzePaired: the OPEN arm alone can NEVER trigger a revert (judge-noisy, corroboration only)", () => {
  // 6 open losses under length-neutral, zero verifiable signal → must NOT revert.
  const open = Array.from({ length: 6 }, (_, i) => ({
    a: { id: `o${i}`, verifiable: false as const, winnerSeat: "short", pairwise: "A" as const, category: "architecture" },
    b: { id: `o${i}`, verifiable: false as const, winnerSeat: "verbose", pairwise: "B" as const, category: "architecture" },
  }));
  const [A, B] = split(open);
  const r = analyzePaired(A, B);
  assert.equal(r.open.c_a_hurt, 6);
  assert.ok(r.open.mcnemar.p < 0.05);          // open arm is significantly negative...
  assert.equal(r.recommendation, "KEEP_LENGTH_NEUTRAL"); // ...but it cannot drive the decision
  assert.equal(r.verdict, "NEUTRAL");
});

test("analyzePaired: open pairwise — council win under LN vs loss under position-stable counts as helped", () => {
  const a: EvalRow = { id: "o1", verifiable: false, winnerSeat: "s", pairwise: "B" };
  const b: EvalRow = { id: "o1", verifiable: false, winnerSeat: "v", pairwise: "A" };
  const r = analyzePaired([a], [b]);
  assert.equal(r.open.n_graded, 1);
  assert.equal(r.open.b_a_helped, 1);
  assert.equal(r.open.c_a_hurt, 0);
});

test("analyzePaired: by_category attributes winner changes and verifiable helped/hurt", () => {
  const pairs = [
    verPair("m1", true, false, "s", "v", "reasoning-math"),
    verPair("m2", true, false, "s", "v", "reasoning-math"),
    verPair("g1", true, true, "s", "s", "general"),
  ];
  const [A, B] = split(pairs);
  const r = analyzePaired(A, B);
  const math = r.by_category.find((c) => c.category === "reasoning-math")!;
  assert.equal(math.n, 2);
  assert.equal(math.winner_changed, 2);
  assert.equal(math.ver_helped, 2);
  assert.equal(math.ver_hurt, 0);
  const gen = r.by_category.find((c) => c.category === "general")!;
  assert.equal(gen.winner_changed, 0);
});

test("analyzePaired: only items present and gradable in BOTH arms contribute", () => {
  const A: Ev