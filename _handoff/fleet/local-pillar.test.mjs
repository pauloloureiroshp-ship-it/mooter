// local-pillar.test.mjs — offline unit tests (no Ollama, no GPU).
// Run: node --test _handoff/fleet/local-pillar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { assembleContext, buildProposal, buildIdleProposal, computeGenSlots, makeGenGate } from "./local-pillar.mjs";
import { gateProposal } from "../../packages/fleet-commander/src/proof-gate.mjs";

const LOOP = { id: "matriz", pillar: { id: "matriz", workdir: "_handoff/fleet/matriz" } };

test("assembleContext hard-caps the assembled prompt", () => {
  const parts = {
    charter: "Tune the specialization matrix vs the local oracle.",
    criteria: "delta acc measured · est_cloud_tokens_avoided/round",
    state: JSON.stringify({ round: 3, measuredWins: 2, measuredTotal: 3 }),
    ledgerTail: "L".repeat(50_000), // absurdly long → must be truncated
    outbox: "O".repeat(50_000),
  };
  const cap = 6000;
  const out = assembleContext(parts, cap);
  assert.ok(out.length <= cap + 40, `expected <= ${cap + 40}, got ${out.length}`);
  assert.match(out, /# CHARTER/); // head is preserved intact
  assert.match(out, /truncated/); // tail was cut
});

test("buildProposal with measured tokens passes the Proof Gate (grounded claim)", () => {
  const { proposal, events } = buildProposal(LOOP, { artifact: "Route commit-msg tasks to a local moo.", estCloudTokens: 812, round: 4, model: "qwen3:30b" });
  const gate = gateProposal(proposal, { events });
  assert.equal(gate.ok, true, `gate should pass: ${JSON.stringify(gate.reasons)}`);
  // the quantitative claim is grounded in a typed before/after measure event
  assert.equal(events[0].kind, "measure");
  assert.equal(events[0].output.after, 0);
});

test("buildProposal without measured tokens still passes (honesty section only)", () => {
  const { proposal, events } = buildProposal(LOOP, { artifact: "Investigate oracle drift.", estCloudTokens: null, round: 1, model: "qwen3:30b" });
  assert.equal(events.length, 0);
  assert.deepEqual(proposal.claims, []);
  const gate = gateProposal(proposal, { events });
  assert.equal(gate.ok, true, `gate should pass with no quantitative claims: ${JSON.stringify(gate.reasons)}`);
});

test("buildProposal always carries the mandatory honesty section", () => {
  const { proposal } = buildProposal(LOOP, { artifact: "x", estCloudTokens: 1, round: 1, model: "m" });
  assert.match(proposal.body, /pode falhar se/i);
});

test("computeGenSlots: a 24GB 4090 fits exactly ONE qwen3:30b generation", () => {
  assert.equal(computeGenSlots({ totalMb: 24564 }), 1);      // 24GB / 19GB → 1
  assert.equal(computeGenSlots({ totalMb: 49152 }), 2);      // 48GB → clamped to 2
  assert.equal(computeGenSlots({ totalMb: null }), 1);       // no GPU reading → safe 1
  assert.equal(computeGenSlots({ totalMb: 24564, envSlots: 2 }), 2); // env override wins
});

test("makeGenGate NEVER exceeds its slot cap under concurrent load", async () => {
  const gate = makeGenGate(1);
  let live = 0, peak = 0;
  const job = async () => {
    await gate.acquire();
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--; gate.release();
  };
  await Promise.all(Array.from({ length: 8 }, job)); // 8 pillars, 1 slot
  assert.equal(peak, 1, `peak concurrency must stay at the slot cap, got ${peak}`);
  assert.equal(gate.inFlight, 0, "all slots released");
});

test("buildIdleProposal passes the gate, makes ZERO claims, is documented", () => {
  const { proposal, events } = buildIdleProposal({ id: "site" }, 2);
  assert.deepEqual(proposal.claims, []);
  assert.equal(events.length, 0);
  assert.match(proposal.body, /DOCUMENTED IDLE/);
  assert.match(proposal.body, /pode falhar se/i);
  const gate = gateProposal(proposal, { events });
  assert.equal(gate.ok, true, `idle proposal should pass the gate: ${JSON.stringify(gate.reasons)}`);
});
