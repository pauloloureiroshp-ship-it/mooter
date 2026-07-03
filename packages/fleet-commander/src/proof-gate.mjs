// proof-gate.mjs — Fleet Commander · the Proof Gate (③) parser.
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §4③ + H7. Honesty is enforced by a
// PARSER, not by judgment: a proposal with no "o que NÃO verifiquei / pode falhar
// se" section is rejected MECHANICALLY, and every quantitative claim must point to
// a TYPED before/after event pair in the Ledger — the parser checks the event's
// TYPE, not just its existence. Auto-citation (an event from the proposal's own run
// cited as evidence of the run's own efficacy) is forbidden.
//
// Pure + dependency-free. Returns a verdict; never throws.

"use strict";

// The honesty section is mandatory. Accept the PT and EN phrasings the fleet uses.
const HONESTY_SECTION =
  /(o que\s+n[ãa]o\s+verifiquei|pode\s+falhar\s+se|what\s+i\s+did\s*n[o']?t\s+verify|could\s+fail\s+if|limita[çc][õo]es\s+conhecidas)/i;

// A claim is "quantitative" (needs evidence) if it asserts a measurable delta.
const QUANTITATIVE =
  /(\d+(\.\d+)?\s*%|\d+(\.\d+)?\s*×|\b\d+x\b|\bfaster\b|\bslower\b|\bcheaper\b|\breduz|\baumenta|\bpoupa|\bmais\s+r[áa]pido|\b\d+\s*(ms|s|tokens?|\$|usd)\b)/i;

export function hasHonestySection(body) {
  return HONESTY_SECTION.test(String(body || ""));
}

export function isQuantitative(text) {
  return QUANTITATIVE.test(String(text || ""));
}

// A valid piece of evidence is a TYPED before/after measurement: kind:'measure'
// carrying an output with both `before` and `after`. Existence alone is not enough
// (that would be groundedness theatre, H7).
export function isBeforeAfter(ev) {
  return !!ev && ev.kind === "measure" && ev.output && typeof ev.output === "object" &&
    ev.output.before !== undefined && ev.output.after !== undefined;
}

function findEvent(events, id) {
  return (Array.isArray(events) ? events : []).find((e) => e && (e.id === id || e.event_id === id)) || null;
}

/**
 * Gate a proposal. Returns { ok, reasons[] } — ok iff reasons is empty.
 *
 * proposal: {
 *   id, body,                       // body MUST contain the honesty section
 *   run_event_id?,                  // this proposal's own run event (auto-citation guard)
 *   claims?: [{ text, evidence?: string[] }]   // evidence = Ledger event ids
 * }
 * ctx: { events: [ledger events] }
 */
export function gateProposal(proposal, ctx = {}) {
  const reasons = [];
  const events = ctx.events || [];
  const p = proposal || {};

  // 1 · The honesty section is mandatory — no exceptions, no judgment.
  if (!hasHonestySection(p.body)) {
    reasons.push('missing mandatory "o que NÃO verifiquei / pode falhar se" section');
  }

  // 2 · Every quantitative claim must be grounded in a typed before/after pair.
  for (const claim of Array.isArray(p.claims) ? p.claims : []) {
    if (!isQuantitative(claim && claim.text)) continue; // qualitative claims need no metric
    const ev = Array.isArray(claim.evidence) ? claim.evidence : [];
    if (ev.length === 0) {
      reasons.push(`quantitative claim has no evidence: "${short(claim.text)}"`);
      continue;
    }
    for (const evId of ev) {
      if (p.run_event_id != null && evId === p.run_event_id) {
        reasons.push(`auto-citation forbidden: claim cites its own run event (${evId})`);
        continue;
      }
      const found = findEvent(events, evId);
      if (!found) {
        reasons.push(`evidence event not in Ledger: ${evId}`);
      } else if (!isBeforeAfter(found)) {
        reasons.push(`evidence ${evId} is not a typed before/after measure (kind='${found.kind}')`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function short(s) {
  s = String(s || "");
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}
