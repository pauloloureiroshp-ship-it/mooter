// fsm.test.mjs — Fleet Commander FSM + transition-guard. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import {
  guardTransition, transition, canTransition, verifyApproval, approvalPayload,
  TERMINAL, STATES, STATE_KIND,
} from "../src/fsm.mjs";

// A human keypair (in real life the private key never touches the fleet).
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
function humanSign(proposal) {
  return edSign(null, Buffer.from(approvalPayload(proposal), "utf8"), privateKey).toString("base64");
}

test("graph: terminal states have no exit; every edge target is a known state", () => {
  for (const t of TERMINAL) assert.equal(canTransition(t, "applied"), false, `${t} is terminal`);
  assert.ok(STATES.includes("measured") && STATES.includes("reverted"));
});

test("happy path: drafted→proven→gated→approved(reversible)→applied→measured", () => {
  let p = { id: "p1", state: "drafted", reversible: true, baseline_hash: "b0", diff_hash: "d0" };
  for (const to of ["proven", "gated", "approved", "applied", "measured"]) {
    const r = transition(p, to, { currentBaselineHash: "b0" });
    assert.equal(r.ok, true, `${p.state}→${to} should be legal: ${r.reason || ""}`);
    p = r.proposal;
  }
  assert.equal(p.state, "measured");
});

test("guard: cannot apply without a prior approved", () => {
  const p = { id: "p", state: "gated" };
  assert.equal(guardTransition(p, "applied").ok, false);
  assert.match(guardTransition({ ...p, state: "proven" }, "applied").reason || "", /illegal transition/);
});

test("guard: an irreversible proposal can NEVER be batch-approved from gated", () => {
  const p = { id: "p", state: "gated", reversible: false };
  const r = guardTransition(p, "approved");
  assert.equal(r.ok, false);
  assert.match(r.reason, /awaiting_human|never batch/);
});

test("guard: irreversible approval FAILS CLOSED without a provisioned key", () => {
  const p = { id: "p", state: "awaiting_human", baseline_hash: "b", diff_hash: "d", signature: "x" };
  const r = guardTransition(p, "approved", { /* no publicKey */ });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no human public key|fail-closed/);
});

test("guard: irreversible approval needs a VALID signature bound to (id|baseline|diff)", () => {
  const p = { id: "p", state: "awaiting_human", baseline_hash: "b", diff_hash: "d" };
  // no signature → deny
  assert.equal(guardTransition(p, "approved", { publicKey }).ok, false);
  // wrong signature → deny
  assert.equal(guardTransition({ ...p, signature: "AAAA" }, "approved", { publicKey }).ok, false);
  // correct signature → allow
  const signed = { ...p, signature: humanSign(p) };
  assert.equal(guardTransition(signed, "approved", { publicKey }).ok, true);
});

test("guard: a signature cannot be SPLICED onto a different diff", () => {
  const p = { id: "p", state: "awaiting_human", baseline_hash: "b", diff_hash: "d" };
  const sig = humanSign(p);
  const tampered = { ...p, diff_hash: "d-EVIL", signature: sig };
  assert.equal(verifyApproval(tampered, publicKey), false, "sig bound to the original diff must not verify");
  assert.equal(guardTransition(tampered, "approved", { publicKey }).ok, false);
});

test("guard: apply is invalidated when the baseline moved (H6)", () => {
  const p = { id: "p", state: "approved", baseline_hash: "b0" };
  assert.equal(guardTransition(p, "applied", { currentBaselineHash: "b0" }).ok, true);
  const r = guardTransition(p, "applied", { currentBaselineHash: "b1-moved" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /baseline moved|rebase/);
});

test("guard: a confirmed regression MUST be revertible; reverted only from regressed", () => {
  assert.equal(canTransition("measured", "regressed"), true);
  assert.equal(canTransition("regressed", "reverted"), true);
  assert.equal(guardTransition({ id: "p", state: "applied" }, "reverted").ok, false, "no reverted straight from applied");
  assert.equal(guardTransition({ id: "p", state: "regressed" }, "reverted").ok, true);
});

test("guard: human can decline at awaiting_human (recorded, terminal)", () => {
  assert.equal(guardTransition({ id: "p", state: "awaiting_human" }, "declined").ok, true);
  assert.equal(TERMINAL.has("declined"), true);
});

test("transition: emits the right Ledger kind per target state", () => {
  const p = { id: "p", state: "drafted", reversible: true };
  const r = transition(p, "proven");
  assert.equal(r.event.kind, STATE_KIND.proven);
  assert.equal(r.event.proposal_id, "p");
  const appliedEv = transition({ id: "p", state: "approved", baseline_hash: "b" }, "applied", { currentBaselineHash: "b" });
  assert.equal(appliedEv.event.kind, "apply");
});
