// proof-gate.test.mjs — the honesty parser + typed groundedness. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { gateProposal, hasHonestySection, isQuantitative, isBeforeAfter } from "../src/proof-gate.mjs";

const HONEST = "Fixes the router misroute for cross_file_change.\n\n## O que NÃO verifiquei / pode falhar se\n- Não testei em Windows.";
const measureEv = { id: "m1", kind: "measure", output: { before: 12, after: 3 } };

test("honesty section: mandatory, PT + EN phrasings accepted", () => {
  assert.equal(hasHonestySection(HONEST), true);
  assert.equal(hasHonestySection("What I did not verify: the edge case"), true);
  assert.equal(hasHonestySection("all done, ships clean"), false);
});

test("reject: a proposal with no honesty section is mechanically rejected", () => {
  const r = gateProposal({ id: "p", body: "Ship it, works great.", claims: [] });
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /pode falhar se|NÃO verifiquei/);
});

test("pass: honest body, no quantitative claims → ok", () => {
  const r = gateProposal({ id: "p", body: HONEST, claims: [{ text: "makes the code clearer" }] });
  assert.deepEqual(r, { ok: true, reasons: [] });
});

test("isQuantitative: catches deltas, ignores prose", () => {
  assert.equal(isQuantitative("cuts cost by 40%"), true);
  assert.equal(isQuantitative("2.3× faster"), true);
  assert.equal(isQuantitative("saves 1200 tokens"), true);
  assert.equal(isQuantitative("it reads better"), false);
});

test("reject: a quantitative claim with no evidence", () => {
  const r = gateProposal({ id: "p", body: HONEST, claims: [{ text: "40% cheaper" }] });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /no evidence/);
});

test("reject: evidence event not in the Ledger", () => {
  const r = gateProposal({ id: "p", body: HONEST, claims: [{ text: "40% cheaper", evidence: ["ghost"] }] }, { events: [measureEv] });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /not in Ledger/);
});

test("reject: evidence exists but is NOT a typed before/after (groundedness theatre, H7)", () => {
  const turnEv = { id: "t1", kind: "turn", output: { note: "did a thing" } };
  const r = gateProposal({ id: "p", body: HONEST, claims: [{ text: "40% cheaper", evidence: ["t1"] }] }, { events: [turnEv] });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /not a typed before\/after/);
});

test("reject: auto-citation — a claim citing its own run event", () => {
  const r = gateProposal(
    { id: "p", run_event_id: "self", body: HONEST, claims: [{ text: "40% cheaper", evidence: ["self"] }] },
    { events: [{ id: "self", kind: "measure", output: { before: 1, after: 1 } }] },
  );
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /auto-citation/);
});

test("pass: quantitative claim grounded in a real typed before/after measure", () => {
  const r = gateProposal(
    { id: "p", run_event_id: "runX", body: HONEST, claims: [{ text: "cuts misroutes 75% (12→3)", evidence: ["m1"] }] },
    { events: [measureEv] },
  );
  assert.deepEqual(r, { ok: true, reasons: [] });
});

test("isBeforeAfter: needs kind:measure with both before and after", () => {
  assert.equal(isBeforeAfter(measureEv), true);
  assert.equal(isBeforeAfter({ kind: "measure", output: { after: 3 } }), false);
  assert.equal(isBeforeAfter({ kind: "turn", output: { before: 1, after: 2 } }), false);
});
