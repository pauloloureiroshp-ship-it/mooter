// Cascading fallback ADVISORY (Wave Mega 50-51 Phase 2.B).
//
// Pure functions, zero IO, ADVISORY ONLY. This module RECOMMENDS escalation
// when a route's quality floor is breached — it NEVER mutates routing.
// tools/router/classify.js is FROZEN (sha CI-enforced) and remains the only
// thing that picks tiers. The real ladder is T0 (local Ollama) → T1 (Haiku) →
// T2 (Sonnet) → T3 (Opus). There is NO T4. T5 (Fable 5) exists but is
// user-opt-in ONLY ("@fable") — this advisory never suggests crossing into the
// paid frontier on its own.

export type Tier = "T0" | "T1" | "T2" | "T3";

// Quality-floor thresholds — named constants, not magic numbers.
/** Confidence strictly below this is a floor breach. */
export const CONFIDENCE_FLOOR = 0.6;
/** This many tool failures (or more) is a floor breach. */
export const TOOL_FAILURES_FLOOR = 2;
/** Refusal phrasings that signal the chosen tier could not do the work. */
export const REFUSAL_PATTERNS: RegExp[] = [
  /\bI can(?:'|no|n')?t help with\b/i,
  /\bI cannot help with\b/i,
  /\bI(?:'m| am) unable to\b/i,
  /\bI can(?:'|no|n')?t assist\b/i,
  /\bI must decline\b/i,
  /\bnão (?:posso|consigo) ajudar\b/i,
];

/** The doctrine note shown whenever the ladder tops out at T3. */
export const T5_OPT_IN_NOTE =
  "T3 (Opus) is the top of the automatic ladder. T5 (Fable 5) exists but is " +
  "user-opt-in ONLY — type @fable yourself; the advisory never auto-suggests " +
  "crossing into the paid frontier tier.";

export interface QualityFloorSignal {
  refusal_text?: string;
  confidence?: number;
  tool_failures?: number;
}

export interface QualityFloorResult {
  floor_breached: boolean;
  reasons: string[];
}

/** Detect whether a route's quality floor was breached. Pure; missing fields
 *  are simply not evaluated (defensive — signals come from heterogeneous logs). */
export function detectQualityFloor(signal: QualityFloorSignal): QualityFloorResult {
  const reasons: string[] = [];

  const text = typeof signal.refusal_text === "string" ? signal.refusal_text : "";
  if (text && REFUSAL_PATTERNS.some((re) => re.test(text))) {
    reasons.push("refusal pattern detected in the model's response");
  }

  if (typeof signal.confidence === "number" && Number.isFinite(signal.confidence) && signal.confidence < CONFIDENCE_FLOOR) {
    reasons.push(`confidence ${signal.confidence.toFixed(2)} below floor ${CONFIDENCE_FLOOR}`);
  }

  if (typeof signal.tool_failures === "number" && Number.isFinite(signal.tool_failures) && signal.tool_failures >= TOOL_FAILURES_FLOOR) {
    reasons.push(`${signal.tool_failures} tool failure(s) ≥ threshold ${TOOL_FAILURES_FLOOR}`);
  }

  return { floor_breached: reasons.length > 0, reasons };
}

export interface NextTierResult {
  /** The next rung up the ladder, or null at/above T3 (or for unknown input). */
  next: Tier | null;
  /** Doctrine note when the ladder tops out (or input was not a real tier). */
  note: string | null;
}

const LADDER: Record<string, Tier> = { T0: "T1", T1: "T2", T2: "T3" };

/** One rung up the real ladder: T0→T1→T2→T3. T3→null + the T5 opt-in note
 *  (there is NO T4, and T5/Fable is never auto-suggested). */
export function nextTier(current: string): NextTierResult {
  const c = String(current ?? "").toUpperCase().trim();
  if (LADDER[c]) return { next: LADDER[c], note: null };
  if (c === "T3") return { next: null, note: T5_OPT_IN_NOTE };
  if (c === "T5") return { next: null, note: "T5 (Fable 5) is already the frontier — nothing above it." };
  return { next: null, note: `unknown tier "${current}" — only T0/T1/T2/T3 are on the automatic ladder.` };
}

export interface CascadeAdvice {
  /** Whether escalation is ADVISED (never enacted by this module). */
  escalate: boolean;
  from: string | null;
  to: Tier | null;
  rationale: string;
}

const ADVISORY_SUFFIX = " (advisory only — classify.js routing is unchanged)";

/** Combine quality-floor detection with the ladder into one piece of advice.
 *  `entry` is a decisions.log entry (its `tier` field is the route taken). */
export function adviseCascade(entry: Record<string, unknown>, signal: QualityFloorSignal): CascadeAdvice {
  const from = typeof entry?.tier === "string" ? entry.tier : null;
  const floor = detectQualityFloor(signal);

  if (!floor.floor_breached) {
    return {
      escalate: false,
      from,
      to: null,
      rationale: "quality floor holds — no escalation advised" + ADVISORY_SUFFIX,
    };
  }

  if (from === null) {
    return {
      escalate: false,
      from,
      to: null,
      rationale: `quality floor breached (${floor.reasons.join("; ")}) but the entry has no tier — cannot advise a ladder step` + ADVISORY_SUFFIX,
    };
  }

  const rung = nextTier(from);
  if (rung.next === null) {
    return {
      escalate: false,
      from,
      to: null,
      rationale: `quality floor breached (${floor.reasons.join("; ")}); ${rung.note}` + ADVISORY_SUFFIX,
    };
  }

  return {
    escalate: true,
    from,
    to: rung.next,
    rationale: `quality floor breached (${floor.reasons.join("; ")}) — consider re-running at ${rung.next}` + ADVISORY_SUFFIX,
  };
}
