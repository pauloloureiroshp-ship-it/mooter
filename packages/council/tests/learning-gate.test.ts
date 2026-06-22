// SELF-GATE D — learning. End-to-end simulation through the VAULT: log N councils whose
// value decays over time, read the ledger back, auto-tune the CAS threshold, and confirm
// it RISES as the council becomes redundant (fires less over time) + distillation kicks in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logCouncilOutcome, readLearningLedger, type CouncilOutcome } from "../src/pastor.ts";
import { autoTuneCasThreshold } from "../src/cas-tune.ts";
import { distillHook } from "../src/distill.ts";

function outcome(category: string, changedVerdict: boolean): CouncilOutcome {
  return { category, changedVerdict, decisive: true, stable: !changedVerdict, costUsd: 0, seats: ["qwen3:30b", "gemma3:12b", "deepseek-r1:7b"] };
}

test("GATE D (e2e): a council whose value decays makes the Pastor fire it less", () => {
  const home = mkdtempSync(join(tmpdir(), "council-gateD-"));
  const cat = "coding.infra";

  // Phase 1: 10 councils that genuinely change the verdict (council earns its cost).
  for (let i = 0; i < 10; i++) logCouncilOutcome(outcome(cat, true), { home });
  const early = autoTuneCasThreshold(readLearningLedger({ home }));

  // Phase 2: 15 councils that no longer change anything (redundant).
  for (let i = 0; i < 15; i++) logCouncilOutcome(outcome(cat, false), { home });
  const later = autoTuneCasThreshold(readLearningLedger({ home }));

  // THE GATE D PROPERTY: the CAS threshold RISES as the council turns redundant
  // (it fires less over time), driven by the recency-weighted EWMA.
  assert.ok(
    later.threshold > early.threshold,
    `threshold must rise: early=${early.threshold} later=${later.threshold}`,
  );
  assert.ok(later.redundancyEwma > 0.6, `redundancy EWMA should be high, got ${later.redundancyEwma}`);
  assert.match(later.note, /raised|redundant/);

  // Honest nuance: the EWMA (recency) leads the distill hook (lifetime mean). After the
  // decay the lifetime change-rate is still 40% (10/25), so distill — conservatively —
  // does NOT yet skip. Two complementary signals; the recency one reacts first.
  const d = distillHook(cat, readLearningLedger({ home }));
  assert.equal(d.skip, false);
  assert.ok(d.predictedChange > 0.2);
});

test("GATE D (e2e): a persistently valuable council keeps firing (no premature distill)", () => {
  const home = mkdtempSync(join(tmpdir(), "council-gateD2-"));
  const cat = "coding.security";
  for (let i = 0; i < 20; i++) logCouncilOutcome(outcome(cat, true), { home });

  const tuned = autoTuneCasThreshold(readLearningLedger({ home }));
  assert.ok(tuned.threshold <= 0.5, `valuable council keeps a low threshold, got ${tuned.threshold}`);
  assert.equal(distillHook(cat, readLearningLedger({ home })).skip, false);
});
