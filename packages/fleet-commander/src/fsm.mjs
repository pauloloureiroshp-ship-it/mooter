// fsm.mjs — Fleet Commander · the proposal lifecycle FSM + transition-guard.
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §5. The Ledger's appendEvent only
// RECORDS events — it validates nothing. This module is the missing piece: the
// transition-guard that FORCES the §5 invariants, so an illegal transition
// (kind:apply with no preceding approve, an unsigned irreversible approval, a
// stale baseline) is impossible, not merely discouraged.
//
// Pure + dependency-free (Node crypto only). The Commander wires appendEvent
// around it; the FSM itself never does I/O — so it is trivially testable.

"use strict";

import { createVerify, verify as edVerify } from "node:crypto";

// ── The state graph (§5). Terminal states have no outgoing edge. ──
export const TRANSITIONS = Object.freeze({
  drafted: ["proven", "rejected"],
  proven: ["gated"],
  gated: ["approved", "awaiting_human", "rejected"], // reversible→approved · irreversible→awaiting_human
  awaiting_human: ["approved", "declined"],
  approved: ["applied"],
  applied: ["measured", "regressed"],
  measured: ["regressed"],   // gain can still invert inside the observation window
  regressed: ["reverted"],   // a confirmed regression MUST be rolled back (principle #4, H8)
  // terminal:
  rejected: [],
  declined: [],
  reverted: [],
});

export const TERMINAL = Object.freeze(new Set(["rejected", "declined", "reverted"]));
export const STATES = Object.freeze(Object.keys(TRANSITIONS));

// State → the Ledger `kind` emitted on entering it (the appendEvent kind).
export const STATE_KIND = Object.freeze({
  drafted: "proposal", proven: "gate", gated: "gate",
  awaiting_human: "gate", approved: "decision", declined: "decision",
  rejected: "decision", applied: "apply", measured: "measure",
  regressed: "incident", reverted: "outcome",
});

export function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

// The canonical payload an irreversible approval signs. Binding the signature to
// (id + baseline_hash + diff_hash) is what stops a valid token being SPLICED onto
// a different change (§5, H6).
export function approvalPayload(proposal) {
  return `${proposal.id}|${proposal.baseline_hash || ""}|${proposal.diff_hash || ""}`;
}

/**
 * Verify a human's asymmetric signature over approvalPayload(proposal).
 * ed25519: the human holds the PRIVATE key; the fleet only ever VERIFIES with the
 * public one — so a corrupted Commander that can verify still cannot forge (why
 * HMAC is the wrong primitive, §5). Returns false on any malformation — never throws.
 * ⚠️ Key provisioning is the human's, out of band (Open Decision #5) — without a
 * publicKey this returns false and the guard fails CLOSED.
 */
export function verifyApproval(proposal, publicKey) {
  try {
    if (!publicKey || !proposal || !proposal.signature) return false;
    const payload = Buffer.from(approvalPayload(proposal), "utf8");
    const sig = Buffer.from(String(proposal.signature), "base64");
    if (!sig.length) return false;
    // ed25519 (one-shot verify; algorithm null for Ed25519).
    return edVerify(null, payload, publicKey, sig);
  } catch {
    return false;
  }
}

/**
 * The guard. Returns { ok:true } iff moving `proposal` to `to` is legal AND all
 * §5 invariants hold. Otherwise { ok:false, reason }. Never throws.
 *
 * ctx: { publicKey?, currentBaselineHash?, reversible? }
 */
export function guardTransition(proposal, to, ctx = {}) {
  if (!proposal || typeof proposal.state !== "string") return { ok: false, reason: "proposal has no state" };
  const from = proposal.state;
  if (TERMINAL.has(from)) return { ok: false, reason: `'${from}' is terminal` };
  if (!STATES.includes(to)) return { ok: false, reason: `unknown target state '${to}'` };
  if (!canTransition(from, to)) return { ok: false, reason: `illegal transition ${from} → ${to}` };

  // ── Approval: reversible may batch; irreversible needs a bound signature ──
  if (to === "approved") {
    if (from === "gated") {
      // The reversible fast-path: only proposals explicitly marked reversible.
      if (proposal.reversible !== true) {
        return { ok: false, reason: "irreversible proposal must pass through awaiting_human (never batch-approved)" };
      }
      return { ok: true };
    }
    if (from === "awaiting_human") {
      // Irreversible: a valid asymmetric signature bound to this exact diff.
      if (!ctx.publicKey) return { ok: false, reason: "fail-closed: no human public key provisioned (Decision #5)" };
      if (!verifyApproval(proposal, ctx.publicKey)) {
        return { ok: false, reason: "invalid/absent signature over (id|baseline_hash|diff_hash)" };
      }
      return { ok: true };
    }
  }

  // ── Apply: only from approved, and only if the baseline is still current ──
  if (to === "applied") {
    if (from !== "approved") return { ok: false, reason: "applied requires a prior approved" };
    if (ctx.currentBaselineHash != null && proposal.baseline_hash != null &&
        ctx.currentBaselineHash !== proposal.baseline_hash) {
      return { ok: false, reason: "baseline moved since proof — invalidated, rebase + re-prove (H6)" };
    }
    return { ok: true };
  }

  // measured/regressed require the change to have been applied (from is applied|measured).
  // (canTransition already enforces the from-set; this is the semantic double-check.)
  if ((to === "measured" || to === "regressed") && !(from === "applied" || from === "measured")) {
    return { ok: false, reason: "cannot measure a change that was never applied" };
  }

  return { ok: true };
}

/**
 * Apply a guarded transition. Returns { ok, proposal, event } where `event` is the
 * Ledger event to appendEvent (kind per STATE_KIND) — the caller does the I/O.
 * On a guard failure returns { ok:false, reason } and does NOT mutate.
 */
export function transition(proposal, to, ctx = {}) {
  const g = guardTransition(proposal, to, ctx);
  if (!g.ok) return { ok: false, reason: g.reason };
  const next = { ...proposal, state: to };
  const event = {
    kind: STATE_KIND[to] || "proposal",
    proposal_id: proposal.id,
    gate: to === "approved" ? (proposal.reversible ? "reversible" : "irreversible") : undefined,
    output: { from: proposal.state, to },
  };
  return { ok: true, proposal: next, event };
}
