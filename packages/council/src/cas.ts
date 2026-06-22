// Council Activation Score (CAS) — the deterministic, host-side, ZERO-LLM trigger.
//
// The literature is unanimous: multi-agent deliberation only helps on complex,
// high-variance, high-stakes tasks; on easy tasks it is pure waste. So the Council
// fires ONLY when signals the Mooter already computes cross a threshold. CAS is
// deterministic and free — faithful to the spirit of classify.js.
//
// CAS reads (it never recomputes): classify.js `confidence`, the high-risk T3 floor,
// a TES tie from decideAgent, the task category, and explicit user intent. It does
// NOT call any model. Conservative by default — over-firing is the worst product
// failure (cost + latency with no gain). The threshold is auto-tuned by the Pastor
// in Bloco D.

export interface CasSignals {
  /** classify.js confidence (0..1). Lower → more classifier uncertainty → higher CAS. */
  confidence?: number;
  /** High-risk T3 floor reached (deploy / secrets / migrations). */
  highRiskFloor?: boolean;
  /** decideAgent top-2 candidates within ε (genuine ambiguity over best model). */
  tesTie?: boolean;
  /** task_category is in the high-variance set (explicit flag). */
  highVarianceCategory?: boolean;
  /** Raw task category (used for reasons + future per-category thresholds). */
  category?: string;
  /** Explicit user intent: @council / /moo-council / effort:beast → always convene. */
  explicit?: boolean;
}

export interface CasWeights {
  highRiskFloor: number;
  /** Max contribution as confidence → 0. */
  lowConfidence: number;
  tesTie: number;
  highVarianceCategory: number;
}

/** Conservative defaults. Tuned only via the Pastor loop (Bloco D), never ad-hoc. */
export const DEFAULT_CAS_WEIGHTS: CasWeights = {
  highRiskFloor: 0.45,
  lowConfidence: 0.5,
  tesTie: 0.3,
  highVarianceCategory: 0.3,
};

/** convene when score ≥ threshold (or explicit). */
export const DEFAULT_CAS_THRESHOLD = 0.5;

/** confidence ≥ pivot contributes nothing (classifier is sure enough). */
export const DEFAULT_CONFIDENCE_PIVOT = 0.6;

/**
 * High-variance task categories (real TASK_CATEGORIES names). These map the design's
 * {architecture, security-audit, hard-debugging, large-refactor} onto the 24-category
 * roster. Configurable so the Pastor can adjust membership with data.
 */
export const HIGH_VARIANCE_CATEGORIES: ReadonlySet<string> = new Set([
  "coding.security",
  "coding.refactor",
  "coding.debug",
  "coding.competitive",
  "coding.infra",
  "reasoning.math",
  "reasoning.science",
  "agents.coordinator",
]);

export interface CasConfig {
  weights?: Partial<CasWeights>;
  threshold?: number;
  confidencePivot?: number;
  highVarianceCategories?: ReadonlySet<string>;
}

export interface CasResult {
  /** 0..1 (rounded to 3 dp). */
  score: number;
  reasons: string[];
  convene: boolean;
  threshold: number;
}

/**
 * Compute the Council Activation Score. Pure function — no I/O, no model calls.
 */
export function computeCAS(signals: CasSignals, config: CasConfig = {}): CasResult {
  const w: CasWeights = { ...DEFAULT_CAS_WEIGHTS, ...config.weights };
  const threshold = config.threshold ?? DEFAULT_CAS_THRESHOLD;
  const pivot = config.confidencePivot ?? DEFAULT_CONFIDENCE_PIVOT;
  const highVar = config.highVarianceCategories ?? HIGH_VARIANCE_CATEGORIES;

  // Explicit user intent overrides everything → always convene (override signal).
  if (signals.explicit) {
    return {
      score: 1,
      reasons: ["explicit @council / /moo-council / effort:beast"],
      convene: true,
      threshold,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (signals.highRiskFloor) {
    score += w.highRiskFloor;
    reasons.push("high-risk T3 floor (deploy/secrets/migrations)");
  }

  if (typeof signals.confidence === "number" && signals.confidence < pivot) {
    // Linear ramp: confidence == pivot → 0, confidence == 0 → full weight.
    const contrib = (1 - signals.confidence / pivot) * w.lowConfidence;
    score += contrib;
    reasons.push(`low classifier confidence (${signals.confidence.toFixed(2)})`);
  }

  if (signals.tesTie) {
    score += w.tesTie;
    reasons.push("TES tie (top-2 models within ε)");
  }

  const isHighVar =
    signals.highVarianceCategory === true ||
    (signals.category !== undefined && highVar.has(signals.category));
  if (isHighVar) {
    score += w.highVarianceCategory;
    reasons.push(
      `high-variance category${signals.category ? ` (${signals.category})` : ""}`,
    );
  }

  score = Math.min(1, score);
  const convene = score >= threshold;
  if (reasons.length === 0) {
    reasons.push("no convene signals — single model suffices");
  }

  return {
    score: Math.round(score * 1000) / 1000,
    reasons,
    convene,
    threshold,
  };
}

/**
 * Detect a TES tie from a chosen vs runner-up score. Returns false when either is
 * null (no fabrication — an unmeasured cell is not a tie). ε defaults to 0.05.
 */
export function detectTesTie(
  chosenTes: number | null,
  runnerUpTes: number | null,
  epsilon = 0.05,
): boolean {
  if (chosenTes === null || runnerUpTes === null) return false;
  return Math.abs(chosenTes - runnerUpTes) <= epsilon;
}
