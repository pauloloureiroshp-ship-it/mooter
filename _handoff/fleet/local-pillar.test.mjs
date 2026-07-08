// local-pillar.test.mjs — offline unit tests (no Ollama, no GPU).
// Run: node --test _handoff/fleet/local-pillar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { assembleContext, buildProposal } from "./local-pillar.mjs";
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
