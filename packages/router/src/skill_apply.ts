// skill_apply.ts — Cockpit v2 Wave 1: confidence-gated auto-skill decision.
//
// PURE + ADDITIVE. This module does NOT touch pack_resolve.ts (frozen engine);
// it consumes its output (skills_invoke) and the routing confidence to decide
// HOW the hook should surface those skills:
//
//   'directive' — emit a strong IMPERATIVE instruction to the agent: invoke the
//                 skill now. Fired ONLY when the session opted in (autoMode),
//                 the domain match is confident (>= THRESHOLDS.single), and the
//                 prompt is NOT high-risk.
//   'suggest'   — keep the existing advisory `skills_invoke=[…]` line.
//   'off'       — no skills present in the env → nothing to invoke.
//
// HONESTY (Mooter identity): 'directive' means "the hook emits an imperative
// instruction to the agent", NOT "the router executed the skill". The DECISION
// is deterministic (classify_domain regex, zero-cloud); the APPLICATION is a
// directive the agent is free to honour. Copy must never claim the skill was
// "applied deterministically".
//
// INVARIANT (doctrine, test-enforced): HIGH_RISK is NEVER 'directive'. A
// high-risk prompt (push/deploy/secret/migration/architect) keeps its high tier,
// the human stays in the loop, and skills are merely suggested.

import { THRESHOLDS } from "./classify_domain.ts"; // single = 0.6 — do NOT duplicate the value

export type SkillApplyMode = "directive" | "suggest" | "off";

export interface SkillApplyDecision {
  mode: SkillApplyMode;
  skills: string[];
}

export interface SkillApplyOpts {
  /** Domain-match confidence (classify_domain). */
  confidence: number;
  /** Skills resolved as PRESENT in the env (packResolve.skills_invoke). */
  skillsInvoke: string[];
  /** True when the router flagged HIGH_RISK (push/deploy/secret/migration/architect). */
  highRisk: boolean;
  /** Session opt-in. DEFAULT = OFF: a directive is only ever emitted when on. */
  autoMode: boolean;
}

/**
 * Decide whether to emit an imperative auto-skill directive, a soft suggestion,
 * or nothing. Pure: no I/O, no side effects. See module header for the contract.
 */
export function decideSkillApply(opts: SkillApplyOpts): SkillApplyDecision {
  const skills = opts.skillsInvoke ?? [];
  if (!skills.length) return { mode: "off", skills: [] };

  // Doctrine floor: HIGH_RISK never becomes a directive — suggest + high tier +
  // human. Checked BEFORE the autoMode/confidence gate so it can never be
  // overridden by an opted-in session.
  if (opts.highRisk) return { mode: "suggest", skills };

  if (opts.autoMode && opts.confidence >= THRESHOLDS.single) {
    return { mode: "directive", skills };
  }

  return { mode: "suggest", skills };
}
