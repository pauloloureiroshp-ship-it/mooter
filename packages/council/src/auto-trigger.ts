// High-risk auto-trigger — wire CAS to the classifier's T3 high-risk floors.
//
// The classifier (classify.js, FROZEN) already forces T3 with risk="high" for
// deploy/secrets/migrations. This module READS that output (never recomputes, never
// imports classify.js) and auto-convenes a council BEFORE the dangerous action runs —
// defense in depth. A migration reviewed by a diverse council with dissent exposed,
// then gated by decideActOrEscalate, is a genuinely safer agent.

import { computeCAS, type CasConfig, type CasResult, type CasSignals } from "./cas.ts";

/** The subset of classify.js output the Council reads. No content, just features. */
export interface ClassifyLike {
  confidence?: number;
  /** "T0".."T3" */
  tier?: string;
  /** "high" | "medium" | "low" — the high-risk floor sets "high". */
  risk?: string;
  /** alias some callers use */
  risk_level?: string;
  task_category?: string;
  /** optional, for explicit @council detection */
  prompt?: string;
}

export function isExplicitCouncil(prompt?: string): boolean {
  return !!prompt && /(@council|\/moo-council|effort:\s*beast)/i.test(prompt);
}

/** Map a classify decision onto CAS signals. high-risk floor = risk === "high". */
export function casSignalsFromClassify(c: ClassifyLike): CasSignals {
  const risk = c.risk ?? c.risk_level;
  return {
    confidence: c.confidence,
    highRiskFloor: risk === "high",
    category: c.task_category,
    explicit: isExplicitCouncil(c.prompt),
  };
}

export interface AutoTriggerConfig extends CasConfig {
  /** Auto-convene before any high-risk action, regardless of CAS score. Default true. */
  highRiskAutoConvene?: boolean;
}

export interface AutoTriggerResult extends CasResult {
  /** True when a high-risk floor forced the council (the safety auto-path). */
  autoConvened: boolean;
}

/**
 * Decide whether to convene a council for a classify decision. High-risk floors
 * auto-convene (regardless of score); everything else uses the CAS threshold.
 */
export function autoTrigger(c: ClassifyLike, config: AutoTriggerConfig = {}): AutoTriggerResult {
  const signals = casSignalsFromClassify(c);
  const cas = computeCAS(signals, config);
  const highRiskAuto = config.highRiskAutoConvene ?? true;

  if (highRiskAuto && signals.highRiskFloor) {
    const base = cas.reasons.filter((r) => !/no convene/.test(r));
    const reasons = base.some((r) => /auto-convene/.test(r))
      ? base
      : [...base, "high-risk floor → auto-convene before dangerous action"];
    return { ...cas, convene: true, autoConvened: true, reasons };
  }
  return { ...cas, autoConvened: false };
}
