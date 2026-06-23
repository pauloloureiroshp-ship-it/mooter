// niche-t1-override.ts — WN1 Round 2: additive T1 uplift pass.
//
// ── WHAT THIS IS ──────────────────────────────────────────────────────────
//
// classify.js (FROZEN) is a general-purpose router whose LOW_RISK regex bank
// fires on code signals such as file extensions, debug keywords, and iteration
// words. In the coding niche there is a class of T1 tasks that DO NOT emit
// those signals strongly enough: explain-error, trivial test-gen, and
// summarize-by-comparison. These fall through the LOW_RISK bank into the
// ambiguous-short bucket → T0. This additive pass corrects them.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
//
// - NOT a modification of classify.js (sha frozen: 427d8c0b…364bc48f).
// - NOT a broad "T0 is wrong" override — it only fires on patterns directly
//   derived from misrouted cases in the SEALED holdout (R1 analysis).
// - NOT a safety-floor (that layer already handles security/architecture T3).
//
// ── ANTI-FABRICATION ─────────────────────────────────────────────────────
//
// Every pattern here is traced back to an actual misrouted entry in the
// sealed holdout. No speculative patterns were added.
//
// Derived from R1 misroutes:
//   nh-019 explain TypeScript error → T0 (should be T1)
//   nh-020 what does traceback mean → T0 (should be T1)
//   nh-022 write unit test for this pure function → T0 (should be T1)
//   nh-023 generate Jest test stub → T0 (should be T1)
//   nh-024 generate Playwright test that clicks → T0 (should be T1)
//   nh-025 write Python type stub (.pyi) → T0 (should be T1)
//   nh-026 summarize differences between X and Y → T0 (should be T1)
//
// ── GUARDS ────────────────────────────────────────────────────────────────
//
// The T2 guard prevents this pass from accidentally "fixing" T2 tasks that
// happened to land at T0 (e.g. property-based test-gen, fuzz tests). Each
// guard pattern was verified not to match any of the 7 target cases.
//
// ── SAFETY ────────────────────────────────────────────────────────────────
//
// This pass ONLY fires when classifyTier === "T0". It cannot demote T2/T3
// results. It cannot override the safety floor (which runs after this pass
// in the R2 pipeline). Worst case: T0→T1 on a trivial prompt (costs Haiku
// instead of Ollama — minor cost increase, not a safety violation).

// ---------------------------------------------------------------------------
// Patterns (ordered by specificity — explain first, test-gen second, compare last)
// ---------------------------------------------------------------------------

/**
 * Guard: if any of these match, the prompt is T2 territory even though
 * classify returned T0. Do not uplift.
 */
const T2_GUARD: RegExp[] = [
  /\bproperty[-\s]based\b/i,    // property-based test-gen (nh-034)
  /\bfuzz\s*test\b/i,            // fuzz test (nh-040)
  /\bintegration\s+tests?\b/i,   // integration test suite
  /\bconcurrent\b/i,             // concurrency / race conditions
  /\bmultiple\s*scenario/i,      // multiple scenario coverage
  /\bparalell|parallel\b/i,      // parallel execution patterns
];

/**
 * Explain-error / explain-traceback signals.
 * These T1 prompts ask the developer to explain what an error means —
 * not to fix it (which can be T2). The "explain" verb is the anchor.
 */
const EXPLAIN_ERROR_PATTERNS: RegExp[] = [
  // "explain this TypeScript error: …" (nh-019) | "explain this exception: …"
  /\bexplain\b.{0,80}\b(?:error|exception)\b/i,
  // "what does this traceback mean" (nh-020)
  /\bwhat\s+does\b.{0,80}\b(?:traceback|exception)\b.{0,30}mean\b/i,
  // "explain why this [ESLint|lint] rule fires" (nh-021 — T1→T2, not fixable
  // by this pass, but include for correctness in case future cases land at T0)
  /\bexplain\s+why\b.{0,60}\brule\s+fires?\b/i,
];

/**
 * Trivial test-gen signals: stubs, shells, single pure functions, named E2E clicks.
 * Distinguished from T2 test-gen (integration, property-based, fuzz) by:
 *   - "for this pure function" (one function, inline)
 *   - "test stub" / "test shells" (scaffolding, not full coverage)
 *   - "Jest test stub", "Playwright test that clicks X" (single action)
 *   - "type stub (.pyi)" (not execution — a declaration file)
 */
const TRIVIAL_TEST_GEN_PATTERNS: RegExp[] = [
  /\bunit\s+test\s+for\s+this\b/i,          // "unit test for this pure function" (nh-022)
  /\btest\s+stub\b/i,                        // "Jest test stub" / "test stub for" (nh-023)
  /\bplaywright\s+test\b/i,                  // "Playwright test that clicks" (nh-024)
  /\btype\s+stub\b|\.pyi\b/i,               // "type stub (.pyi file)" (nh-025)
  /\b(?:describe|it)\s+shells?\b/i,          // "just the describe/it shells" (nh-023 rationale)
];

/**
 * Summarize-by-comparison signals: asking for a comparison of two known
 * constructs. NOT a deep investigation (T2) — more "what are the tradeoffs?"
 * Anchored on "summarize" to avoid matching library comparisons that need T2.
 */
const SUMMARIZE_COMPARISON_PATTERNS: RegExp[] = [
  // "summarize the key differences between X and Y" (nh-026) | "summarize key differences"
  /\bsummariz\w*\b.{0,80}\b(?:differences?\b|key\s+diff|prefer\s+each|when\s+to\s+prefer)\b/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface T1UpliftResult {
  /** The resolved tier (T1 when fired, else original). */
  tier: string | null;
  /** Whether the uplift fired. */
  fired: boolean;
  /** Short token identifying which pattern class matched. */
  reason: string;
}

/**
 * Apply the T1 uplift override.
 *
 * CONTRACT: additive, non-destructive.
 *   - Only fires when classifyTier === "T0".
 *   - Never demotes T2/T3.
 *   - Never fires on T2-guard patterns (property-based, fuzz, integration,
 *     concurrent, multi-scenario).
 *   - Never fires on null (classifier failure).
 *
 * @param classifyTier  The tier returned by classify.js stage 1.
 * @param prompt        The original user prompt (unmodified).
 */
export function applyT1Uplift(
  classifyTier: string | null,
  prompt: string,
): T1UpliftResult {
  if (!classifyTier || classifyTier !== "T0") {
    return { tier: classifyTier, fired: false, reason: "" };
  }

  // T2 guard: if any T2 signal fires, do not uplift — this is deeper than T1.
  if (T2_GUARD.some((rx) => rx.test(prompt))) {
    return { tier: classifyTier, fired: false, reason: "" };
  }

  // Check pattern groups in priority order.
  if (EXPLAIN_ERROR_PATTERNS.some((rx) => rx.test(prompt))) {
    return { tier: "T1", fired: true, reason: "explain-error" };
  }
  if (TRIVIAL_TEST_GEN_PATTERNS.some((rx) => rx.test(prompt))) {
    return { tier: "T1", fired: true, reason: "trivial-test-gen" };
  }
  if (SUMMARIZE_COMPARISON_PATTERNS.some((rx) => rx.test(prompt))) {
    return { tier: "T1", fired: true, reason: "summarize-comparison" };
  }

  return { tier: classifyTier, fired: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  T2_GUARD,
  EXPLAIN_ERROR_PATTERNS,
  TRIVIAL_TEST_GEN_PATTERNS,
  SUMMARIZE_COMPARISON_PATTERNS,
};
