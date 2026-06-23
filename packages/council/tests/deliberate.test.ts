import { test } from "node:test";
import assert from "node:assert/strict";
import { deliberate } from "../src/deliberate.ts";
import type { Council, ModelSpec, Verdict } from "../src/types.ts";

// A scripted seat: returns `answer` for a generation prompt, and a VERDICT block for
// an adversarial-review prompt (detected by review()'s "adversarial reviewer" preamble).
function seat(id: string, answer: string, reviewVerdict: Verdict, conf = 0.9, err = false): ModelSpec {
  return {
    id,
    tier: "T0",
    kind: "local",
    async call(prompt: string) {
      if (err) return { text: "", costUsd: 0, latencyMs: 0, error: "ollama HTTP 500" };
      if (/adversarial reviewer/i.test(prompt)) {
        return {
          text: `VERDICT: ${reviewVerdict}\nCONFIDENCE: ${conf}\nRATIONALE: ${id} ${reviewVerdict}s the claim`,
          costUsd: 0,
          latencyMs: 1,
        };
      }
      return { text: answer, costUsd: 0, latencyMs: 1 };
    },
  };
}
function council(seats: ModelSpec[]): Council {
  return { seats, judge: null, note: "test", estCostUsd: 0 };
}

test("deliberate: consensus (all confirm) → adaptive stop at round 1, CONFIRMED", async () => {
  const c = council([seat("a", "ans A", "confirm"), seat("b", "ans B", "confirm"), seat("d", "ans D", "confirm")]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.rounds, 1, "adaptive stop");
  assert.equal(v.convergence, "CONFIRMED");
  assert.ok(v.confidence > 0.8);
  assert.equal(v.costUsd, 0, "all-local is free");
});

test("deliberate: strong rejection is also consensus → adaptive stop at round 1", async () => {
  const c = council([seat("a", "ans A", "refute"), seat("b", "ans B", "refute"), seat("d", "ans D", "refute")]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.rounds, 1, "unanimous refute stops early too");
  assert.equal(v.convergence, "REJECTED");
  assert.ok(v.confidence <= 0.4, "rejected → low confidence");
});

test("deliberate: genuine uncertainty → escalates to round 2", async () => {
  const c = council([seat("a", "ans A", "uncertain"), seat("b", "ans B", "uncertain"), seat("d", "ans D", "uncertain")]);
  const v = await deliberate("q", c, { stopThreshold: 0.6, maxRounds: 2 });
  assert.equal(v.rounds, 2, "uncertainty needs another round");
  assert.equal(v.convergence, "UNCERTAIN");
});

test("deliberate: minority report preserved even when the winner is CONFIRMED", async () => {
  // The strongest seat WINS (agreement → highest competence) and is CONFIRMED by the
  // other two — yet it itself refutes both of them. That dissent must survive in the
  // minority report (the council exposes disagreement, never fabricates unanimity).
  const c = council([
    seat("qwen2.5-coder:14b", "ans S", "refute"),
    seat("qwen2.5-coder:7b", "ans M", "confirm"),
    seat("qwen2.5:3b", "ans W", "confirm"),
  ]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.winnerSeatId, "qwen2.5-coder:14b");
  assert.equal(v.convergence, "CONFIRMED");
  assert.ok(v.minorityReport.length >= 2, `expected dissent preserved, got ${v.minorityReport.length}`);
  assert.ok(v.minorityReport.every((m) => m.verdict !== "confirm"));
  assert.ok(v.dissent.length >= 1, "dissent section non-empty");
});

test("deliberate: stability detected when a 2nd round does not move the outcome", async () => {
  const c = council([seat("a", "A", "uncertain"), seat("b", "B", "uncertain"), seat("d", "D", "uncertain")]);
  const v = await deliberate("q", c, { stopThreshold: 0.6, maxRounds: 2 });
  assert.equal(v.rounds, 2);
  assert.equal(v.stable, true, "round 2 changed nothing → stable");
});

test("deliberate: decisive round 1 is not flagged stable (no 2nd round happened)", async () => {
  const c = council([seat("a", "A", "confirm"), seat("b", "B", "confirm"), seat("d", "D", "confirm")]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.rounds, 1);
  assert.equal(v.stable, false);
});

test("deliberate: all seats error → honest empty verdict, no fabrication", async () => {
  const c = council([seat("a", "", "uncertain", 0.9, true), seat("b", "", "uncertain", 0.9, true)]);
  const v = await deliberate("q", c);
  assert.equal(v.rounds, 0);
  assert.equal(v.recommendation, "(no answer produced)");
  assert.match(v.coverageNote, /errored/);
});

test("deliberate: recommendation is the winning seat's text (agreement → most competent)", async () => {
  const c = council([
    seat("qwen2.5-coder:14b", "answer-strong", "confirm"),
    seat("qwen2.5-coder:7b", "answer-mid", "confirm"),
    seat("qwen2.5:3b", "answer-weak", "confirm"),
  ]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.winnerSeatId, "qwen2.5-coder:14b");
  assert.equal(v.recommendation, "answer-strong");
});

test("deliberate: agreement — among DIFFERENT answers the most competent seat wins, NOT the most concise (W2 regression fix)", async () => {
  // All seats confirm each other → all CONFIRMED, tied on correctness. The weakest seat
  // is the most concise; the pre-W3 length-neutral tiebreak handed it the win and that
  // drove every W2 verifiable regression. Agreement selection picks the strongest seat.
  const c = council([
    seat("qwen2.5-coder:14b", "the answer is 42, with supporting reasoning", "confirm"),
    seat("qwen2.5-coder:7b", "perhaps 17", "confirm"),
    seat("qwen2.5:3b", "0", "confirm"), // shortest, weakest — the old trap
  ]);
  const v = await deliberate("q", c, { stopThreshold: 0.6 });
  assert.equal(v.convergence, "CONFIRMED");
  assert.equal(v.winnerSeatId, "qwen2.5-coder:14b");
  assert.equal(v.recommendation, "the answer is 42, with supporting reasoning");
});

test("deliberate: winnerStrategy controls — length-neutral picks shortest, legacy picks last-in-array (A/B controls)", async () => {
  const c = council([
    seat("qwen2.5-coder:14b", "this is a long verbose answer with many redundant words", "confirm"),
    seat("qwen2.5-coder:7b", "yes", "confirm"),          // shortest
    seat("qwen2.5:3b", "yes indeed sir", "confirm"),      // last in array
  ]);
  const vLen = await deliberate("q", c, { stopThreshold: 0.6, winnerStrategy: "length-neutral" });
  assert.equal(vLen.recommendation, "yes", "length-neutral picks the shortest");
  const vLegacy = await deliberate("q", c, { stopThreshold: 0.6, winnerStrategy: "legacy" });
  assert.equal(vLegacy.recommendation, "yes indeed sir", "legacy picks last-in-array");
  const vBackCompat = await deliberate("q", c, { stopThreshold: 0.6, lengthNeutral: false });
  assert.equal(vBackCompat.recommendation, "yes indeed sir", "lengthNeutral:false maps to legacy (back-compat)");
});
