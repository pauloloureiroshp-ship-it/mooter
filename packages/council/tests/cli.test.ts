import { test } from "node:test";
import assert from "node:assert/strict";
import { runCouncilCli } from "../src/cli.ts";
import type { Council, CouncilVerdict, ModelSpec } from "../src/types.ts";

function fakeSeat(id: string, kind: "local" | "cloud" = "local"): ModelSpec {
  return { id, tier: "T0", kind, call: async () => ({ text: "", costUsd: 0, latencyMs: 0 }) };
}
const fakeCouncil: Council = {
  seats: [fakeSeat("qwen3:30b"), fakeSeat("gemma3:12b"), fakeSeat("deepseek-r1:7b")],
  judge: null,
  note: "seats=[...] judge=deterministic · no cloud key → all-local council",
  estCostUsd: 0,
};
const fakeVerdict: CouncilVerdict = {
  recommendation: "use a worktree per member",
  confidence: 0.83,
  consensus: ["[correctness] approach is sound"],
  dissent: ["[security/b] misses an auth check"],
  uniqueFindings: ["[repro/c] untested on windows"],
  minorityReport: [{ reviewer: "c", lens: "security", verdict: "refute", confidence: 0.9, rationale: "auth gap" }],
  seats: ["qwen3:30b", "gemma3:12b", "deepseek-r1:7b"],
  winnerSeatId: "deepseek-r1:7b",
  judge: null,
  rounds: 1,
  costUsd: 0,
  latencyMs: 4200,
  modelCalls: 9,
  convergence: "CONFIRMED",
  voteScore: 0.9,
  coverageNote: "all-local council ($0)",
};

const deps = {
  composeCouncil: (() => fakeCouncil) as any,
  deliberate: (async () => fakeVerdict) as any,
  hasCloudKey: false,
  // no-op persistence so tests never touch the real ~/.mooter vault
  record: (() => ({ record: {} as any, ledgerPath: "", statePath: "" })) as any,
};

test("cli: no prompt → usage + exit 2", async () => {
  const r = await runCouncilCli([], deps);
  assert.equal(r.exitCode, 2);
  assert.match(r.output, /usage: mooter council/);
});

test("cli: explain mode is dry, shows CAS + composition + savings, no deliberate", async () => {
  let deliberated = false;
  const r = await runCouncilCli(["explain", "should we cache the vault?"], {
    ...deps,
    deliberate: (async () => {
      deliberated = true;
      return fakeVerdict;
    }) as any,
  });
  assert.equal(r.exitCode, 0);
  assert.equal(deliberated, false, "explain must not deliberate");
  assert.match(r.output, /explain/);
  assert.match(r.output, /CAS: CONVENE/);
  assert.match(r.output, /saved ~/);
});

test("cli: run mode prints 4 sections + chip + minority report", async () => {
  const r = await runCouncilCli(["should we cache the vault?"], deps);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /🏛 council 4\.2s · \$0\.00 · saved ~100%/);
  assert.match(r.output, /① Consensus/);
  assert.match(r.output, /② Dissent/);
  assert.match(r.output, /③ Unique findings/);
  assert.match(r.output, /④ Recommendation/);
  assert.match(r.output, /use a worktree per member/);
  assert.match(r.output, /Minority report \(1\)/);
});

test("cli: --json run mode emits valid JSON verdict", async () => {
  const r = await runCouncilCli(["--json", "q"], deps);
  const parsed = JSON.parse(r.output);
  assert.equal(parsed.recommendation, "use a worktree per member");
  assert.equal(parsed.convergence, "CONFIRMED");
});

test("cli: --local-only and --category are passed to composeCouncil", async () => {
  let seenCategory = "";
  let seenOpts: any = null;
  const r = await runCouncilCli(["explain", "--local-only", "--category", "coding.security", "q"], {
    ...deps,
    composeCouncil: ((category: string, _cas: any, _budget: any, opts: any) => {
      seenCategory = category;
      seenOpts = opts;
      return fakeCouncil;
    }) as any,
  });
  assert.equal(r.exitCode, 0);
  assert.equal(seenCategory, "coding.security");
  assert.equal(seenOpts.localOnly, true);
});
