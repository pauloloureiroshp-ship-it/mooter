// Pastor v2 per-task router (Wave 31). The bridge between classify.js features and
// the LORAUTER engine. Given a prompt + the classifier's decision, it:
//   1. maps classify fields → LORAUTER RoutingFeatures,
//   2. runs the deterministic LORAUTER route,
//   3. nudges the result with the bandit/acceptance bias (feedback-incorporator),
//   4. records the choice into pastor-state (drives the statusline chip),
//   5. logs FEATURES-ONLY telemetry (~/.mooter/pastor/routes.jsonl) — no prompt text.
//
// Doctrine: the classifier's TIER is passed through untouched. LORAUTER only picks
// the adapter to bias *within* that tier; it can never escalate or downgrade it.

import { appendJsonl, mooterPath } from "../config.ts";
import { routeAdapter, type RouteDecision, type RoutingFeatures } from "../lora/routing-lorauter.ts";
import { applyFeedbackBias, loadFeedback } from "./feedback-incorporator.ts";
import { recordRoute } from "./pastor-state.ts";
import type { TaskType } from "../lora/adapter-registry.ts";

/** The subset of a classify.js "classified" event the router consumes. */
export interface ClassifyDecision {
  tier?: string;
  task_category?: string;
  lang_detected?: "pt" | "en" | "other" | string;
  has_file_refs?: boolean;
  file_ref_count?: number;
}

export interface RouteRequestInput {
  prompt: string;
  classify?: ClassifyDecision;
  /** Pre-parsed file extensions (else parsed from the prompt). */
  file_exts?: string[];
  task_tags?: string[];
  /** Skip persistence + telemetry (pure preview). Default false. */
  dryRun?: boolean;
}

export interface RouteRequestResult extends RouteDecision {
  biased: boolean; // true when feedback bias changed the ranking
}

function toFeatures(input: RouteRequestInput): RoutingFeatures {
  const c = input.classify ?? {};
  const lang = c.lang_detected === "pt" || c.lang_detected === "en" ? c.lang_detected : undefined;
  return {
    prompt: input.prompt,
    prompt_class: c.tier,
    task_category: c.task_category,
    lang,
    file_exts: input.file_exts,
    task_tags: input.task_tags,
  };
}

/**
 * Route a request to a per-task adapter (or baseline). Honours the classifier tier,
 * applies feedback bias, persists state + features-only telemetry unless dryRun.
 */
export function routeRequest(input: RouteRequestInput): RouteRequestResult {
  const base = routeAdapter(toFeatures(input));

  // Fold in the acceptance bias and re-decide the winner under the threshold.
  const fb = loadFeedback();
  const biasedScores = applyFeedbackBias(base.scores, fb);
  const top = biasedScores[0];
  let decision: RouteDecision = { ...base, scores: biasedScores };
  let biased = false;

  if (top && top.confidence >= base.threshold) {
    biased = top.adapter !== base.adapter;
    // Build an accurate reason: don't prepend base.reason (which says "…→ baseline")
    // when feedback ELEVATED a previously-unmatched decision over the threshold.
    const reason = !base.matched
      ? `feedback bias elevated ${top.task_type} above threshold (${top.confidence.toFixed(2)})`
      : biased
        ? `${base.reason}; feedback bias re-routed to ${top.task_type} (${top.confidence.toFixed(2)})`
        : base.reason;
    decision = {
      ...base,
      scores: biasedScores,
      adapter: top.adapter,
      task_type: top.task_type,
      confidence: top.confidence,
      matched: true,
      reason,
    };
  } else if (base.matched && (!top || top.confidence < base.threshold)) {
    // Feedback pulled the previous winner below threshold → fall back to baseline.
    biased = true;
    decision = {
      ...base,
      scores: biasedScores,
      adapter: baselineName(base),
      task_type: "baseline" as TaskType,
      matched: false,
      reason: `${base.reason}; feedback bias dropped it below ${base.threshold} → baseline`,
    };
  }

  if (!input.dryRun) {
    if (decision.matched) {
      recordRoute(decision.adapter, decision.task_type, decision.confidence);
    }
    // FEATURES ONLY — never the prompt. The hub aggregate enforces k-anonymity ≥ 50.
    appendJsonl(mooterPath("pastor", "routes.jsonl"), {
      ts: new Date().toISOString(),
      tier: decision.tier,
      task_type: decision.task_type,
      adapter: decision.adapter,
      confidence: Math.round(decision.confidence * 1000) / 1000,
      matched: decision.matched,
      detected_lang: decision.detected_lang,
      biased,
    });
  }

  return { ...decision, biased };
}

function baselineName(d: RouteDecision): string {
  // routeAdapter already names baseline in d.adapter when unmatched; reuse if present.
  return d.matched ? "pastor-baseline" : d.adapter;
}
