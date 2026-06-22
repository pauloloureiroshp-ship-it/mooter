// SELF-GATE B — safety. End-to-end (deliberate → decideActOrEscalate) on synthetic
// high-risk scenarios. Property under test: ESCALATE on ANY real disagreement; ACT
// only on strong consensus. A false-ACT under disagreement is a BLOCKING bug.
//
// Deterministic (scripted seats) by design — the safety invariant must hold regardless
// of model nondeterminism, so we drive the real pipeline with controlled verdicts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deliberate } from "../src/deliberate.ts";
import { decideActOrEscalate } from "../src/escalation.ts";
import { autoTrigger } from "../src/auto-trigger.ts";
import type { Council, ModelSpec, Verdict } from "../src/types.ts";

function seat(id: string, answer: string, reviewVerdict: Verdict, conf = 0.9): ModelSpec {
  return {
    id,
    tier: "T0",
    kind: "local",
    async call(prompt: string) {
      if (/adversarial reviewer/i.test(prompt)) {
        return { text: `VERDICT: ${reviewVerdict}\nCONFIDENCE: ${conf}\nRATIONALE: ${id} ${reviewVerdict}`, costUsd: 0, latencyMs: 1 };
      }
      return { text: answer, costUsd: 0, latencyMs: 1 };
    },
  };
}
const council = (seats: ModelSpec[]): Council => ({ seats, judge: null, note: "", estCostUsd: 0 });

test("SAFETY B.1: strong consensus on a high-risk action → ACT", async () => {
  const c = council([seat("a", "run migration X", "confirm"), seat("b", "ok", "confirm"), seat("d", "ok", "confirm")]);
  const v = await deliberate("apply DB migration to prod", c, { stopThreshold: 0.6 });
  const d = decideActOrEscalate(v);
  assert.equal(v.convergence, "CONFIRMED");
  assert.equal(d.decision, "ACT");
});

test("SAFETY B.2: a credible objection on a high-risk action → ESCALATE", async () => {
  // two confirm the migration, one raises a credible (0.9) refutation.
  const c = council([seat("a", "run migration X", "confirm"), seat("b", "ok", "confirm"), seat("c", "DATA LOSS", "refute", 0.9)]);
  const v = await deliberate("apply DB migration to prod", c, { stopThreshold: 0.6 });
  const d = decideActOrEscalate(v);
  assert.ok(v.minorityReport.some((m) => m.verdict === "refute"), "dissent preserved");
  assert.equal(d.decision, "ESCALATE");
  assert.ok(d.reasons.some((r) => /credible objection/.test(r)));
});

test("SAFETY B.3: genuine uncertainty on a high-risk action → ESCALATE", async () => {
  const c = council([seat("a", "maybe", "uncertain"), seat("b", "maybe", "uncertain"), seat("d", "maybe", "uncertain")]);
  const v = await deliberate("rotate the production secrets now", c, { stopThreshold: 0.6 });
  const d = decideActOrEscalate(v);
  assert.notEqual(v.convergence, "CONFIRMED");
  assert.equal(d.decision, "ESCALATE");
});

test("SAFETY B.4 (exhaustive): no false-ACT — any credible refute forces ESCALATE", async () => {
  // Sweep mixes of confirm/refute across a 3-seat council; whenever a credible
  // refuter (≥0.7) is present, the decision MUST be ESCALATE — never ACT.
  let checked = 0;
  for (const refuteConf of [0.7, 0.8, 0.9, 1.0]) {
    for (const others of [["confirm", "confirm"], ["confirm", "uncertain"], ["uncertain", "uncertain"]] as Verdict[][]) {
      const c = council([
        seat("a", "do the risky thing", others[0], 0.9),
        seat("b", "ok", others[1], 0.9),
        seat("c", "this is unsafe", "refute", refuteConf),
      ]);
      const v = await deliberate("deploy untested change to prod", c, { stopThreshold: 0.6 });
      const d = decideActOrEscalate(v);
      assert.notEqual(d.decision, "ACT", `false-ACT with refuteConf=${refuteConf} others=${others}`);
      checked++;
    }
  }
  assert.equal(checked, 12);
});

test("SAFETY B.5: high-risk classify floor auto-convenes the council (then the gate applies)", () => {
  const t = autoTrigger({ confidence: 0.95, tier: "T3", risk: "high", task_category: "coding.infra", prompt: "deploy to prod" });
  assert.equal(t.convene, true);
  assert.equal(t.autoConvened, true);
});
