// MooterBench scoring + pricing library (pure functions, no I/O).
// Kept separate from run.ts so tests can exercise the math with stubbed
// classifier output and zero subprocess spawns.

export const TIERS = ["T0", "T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];

export const CATEGORIES = [
  "trivial-edit",
  "summarize",
  "commit-msg",
  "explain-error",
  "test-gen",
  "bug-investigation",
  "refactor-multi-file",
  "architecture",
  "pre-merge-review",
  "format-transform",
  "docs",
  "regex",
  "dependency",
  "ci-config",
  "security",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface WorkflowEntry {
  id: string;
  prompt: string;
  category: Category;
  expected_tier: Tier;
  rationale: string;
}

export interface Prediction {
  id: string;
  /** Tier returned by the classifier, or null if it failed / returned invalid JSON. */
  predicted_tier: string | null;
  /** Whether the classifier returned parseable JSON with a tier field. */
  completed: boolean;
  confidence?: number;
  recommended_model?: string;
}

// ---------------------------------------------------------------------------
// Pricing — 2026-06 Anthropic list prices, USD per million tokens.
// Sources: Anthropic published list pricing as of June 2026.
// These are LIST prices used for estimation, not measured billing.
// ---------------------------------------------------------------------------
export const PRICING_PER_MTOK: Record<Tier, { input: number; output: number; model: string }> = {
  T0: { input: 0, output: 0, model: "local (Ollama)" },
  T1: { input: 1, output: 5, model: "Haiku" },
  T2: { input: 3, output: 15, model: "Sonnet" },
  T3: { input: 5, output: 25, model: "Opus" },
};

// Assumed token profile per workflow request (stated assumption, see README).
export const ASSUMED_INPUT_TOKENS = 2000;
export const ASSUMED_OUTPUT_TOKENS = 600;

/** Estimated USD cost of running one workflow at a given tier. */
export function costForTier(
  tier: Tier,
  inputTokens = ASSUMED_INPUT_TOKENS,
  outputTokens = ASSUMED_OUTPUT_TOKENS,
): number {
  const p = PRICING_PER_MTOK[tier];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export interface SavingsEstimate {
  baseline_all_t3_usd: number;
  routed_usd: number;
  saved_usd: number;
  saved_pct: number;
  /** Predictions that were invalid/missing are costed as T3 (conservative). */
  invalid_costed_as_t3: number;
}

/**
 * Estimated cost savings of routed execution vs an all-T3 baseline.
 * Invalid / failed predictions are costed at T3 (the router would fall back
 * to the session model), which is the conservative choice.
 */
export function estimateSavings(predictions: Prediction[]): SavingsEstimate {
  const t3 = costForTier("T3");
  const baseline = t3 * predictions.length;
  let routed = 0;
  let invalid = 0;
  for (const p of predictions) {
    if (p.completed && isTier(p.predicted_tier)) {
      routed += costForTier(p.predicted_tier);
    } else {
      routed += t3;
      invalid++;
    }
  }
  const saved = baseline - routed;
  return {
    baseline_all_t3_usd: round6(baseline),
    routed_usd: round6(routed),
    saved_usd: round6(saved),
    saved_pct: baseline > 0 ? round4((saved / baseline) * 100) : 0,
    invalid_costed_as_t3: invalid,
  };
}

export function isTier(t: unknown): t is Tier {
  return typeof t === "string" && (TIERS as readonly string[]).includes(t);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export interface CategoryScore {
  total: number;
  correct: number;
  accuracy: number;
}

export interface ScoreReport {
  total: number;
  completed: number;
  completion_rate: number;
  correct: number;
  /** correct / total — invalid or missing predictions count as incorrect. */
  accuracy: number;
  per_category: Record<string, CategoryScore>;
  /** confusion[expected][predicted] — predicted includes "other" (a tier
   *  outside T0-T3, e.g. T4/T5) and "invalid" (no parseable decision). */
  confusion: Record<Tier, Record<string, number>>;
}

export function score(entries: WorkflowEntry[], predictions: Prediction[]): ScoreReport {
  const byId = new Map(predictions.map((p) => [p.id, p]));
  const confusion = {} as Record<Tier, Record<string, number>>;
  for (const t of TIERS) {
    confusion[t] = { T0: 0, T1: 0, T2: 0, T3: 0, other: 0, invalid: 0 };
  }
  const perCategory: Record<string, CategoryScore> = {};
  let correct = 0;
  let completed = 0;

  for (const e of entries) {
    const p = byId.get(e.id);
    const cat = (perCategory[e.category] ??= { total: 0, correct: 0, accuracy: 0 });
    cat.total++;
    if (!p || !p.completed) {
      confusion[e.expected_tier].invalid++;
      continue;
    }
    completed++;
    if (isTier(p.predicted_tier)) {
      confusion[e.expected_tier][p.predicted_tier]++;
      if (p.predicted_tier === e.expected_tier) {
        correct++;
        cat.correct++;
      }
    } else {
      confusion[e.expected_tier].other++;
    }
  }

  for (const cat of Object.values(perCategory)) {
    cat.accuracy = cat.total > 0 ? round4(cat.correct / cat.total) : 0;
  }

  const total = entries.length;
  return {
    total,
    completed,
    completion_rate: total > 0 ? round4(completed / total) : 0,
    correct,
    accuracy: total > 0 ? round4(correct / total) : 0,
    per_category: perCategory,
    confusion,
  };
}

// ---------------------------------------------------------------------------
// Dataset validation (also used by tests)
// ---------------------------------------------------------------------------
export function validateDataset(workflows: unknown): asserts workflows is WorkflowEntry[] {
  if (!Array.isArray(workflows)) throw new Error("dataset: workflows must be an array");
  const ids = new Set<string>();
  for (const [i, w] of workflows.entries()) {
    const at = `dataset entry #${i}`;
    if (typeof w !== "object" || w === null) throw new Error(`${at}: not an object`);
    const e = w as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) throw new Error(`${at}: missing id`);
    if (ids.has(e.id)) throw new Error(`${at}: duplicate id ${e.id}`);
    ids.add(e.id);
    if (typeof e.prompt !== "string" || e.prompt.trim().length < 10)
      throw new Error(`${at} (${e.id}): prompt missing or too short`);
    if (!(CATEGORIES as readonly string[]).includes(e.category as string))
      throw new Error(`${at} (${e.id}): invalid category ${String(e.category)}`);
    if (!isTier(e.expected_tier))
      throw new Error(`${at} (${e.id}): invalid expected_tier ${String(e.expected_tier)}`);
    if (typeof e.rationale !== "string" || !e.rationale.trim())
      throw new Error(`${at} (${e.id}): missing rationale`);
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
