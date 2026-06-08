// Pastor v2 feedback incorporation (Wave 31). The bandit/acceptance loop
// (Wave 30 L16.2) tells us whether a per-task adapter's choices get *accepted*.
// We fold that into routing as a per-task-type bias multiplier so the router
// leans toward adapters that the user keeps and away from ones they revert.
//
// DETERMINISTIC + honest: the default bias is 1.0 (no-op) until real signals
// accumulate. Bias is clamped to a tight band so feedback can nudge — never
// override — the LORAUTER score (doctrine: feedback biases *within* the tier).

import { mooterPath, readJsonSafe, writeJson } from "../config.ts";
import type { TaskType } from "../lora/adapter-registry.ts";
import type { AdapterScore } from "../lora/routing-lorauter.ts";

export const BIAS_MIN = 0.75;
export const BIAS_MAX = 1.25;

export interface FeedbackState {
  version: number;
  /** Per-task-type acceptance tally. */
  signals: Partial<Record<TaskType, { accepted: number; rejected: number }>>;
  updated_at: string;
}

export function feedbackStatePath(): string {
  return mooterPath("pastor", "feedback.json");
}

export function loadFeedback(): FeedbackState {
  const s = readJsonSafe<FeedbackState>(feedbackStatePath(), { version: 1, signals: {}, updated_at: new Date(0).toISOString() });
  if (!s.signals || typeof s.signals !== "object") s.signals = {};
  return s;
}

/** Record an accept/reject signal for a task type (from the bandit/acceptance loop). */
export function recordFeedback(type: TaskType, accepted: boolean, now: Date = new Date()): FeedbackState {
  const s = loadFeedback();
  const cur = s.signals[type] ?? { accepted: 0, rejected: 0 };
  if (accepted) cur.accepted += 1;
  else cur.rejected += 1;
  s.signals[type] = cur;
  s.updated_at = now.toISOString();
  writeJson(feedbackStatePath(), s);
  return s;
}

/**
 * Bias multiplier for a task type ∈ [BIAS_MIN, BIAS_MAX]. Laplace-smoothed
 * acceptance rate mapped onto the band; 1.0 when there is no signal. Needs a
 * minimum sample (≥3) before it deviates from neutral, so one revert can't swing it.
 */
export function adapterBias(type: TaskType, state: FeedbackState = loadFeedback()): number {
  const sig = state.signals[type];
  if (!sig) return 1.0;
  const n = sig.accepted + sig.rejected;
  if (n < 3) return 1.0;
  const rate = (sig.accepted + 1) / (n + 2); // Laplace smoothing → (0,1)
  // Map rate 0..1 onto [BIAS_MIN, BIAS_MAX] centred at 0.5 → 1.0.
  const bias = BIAS_MIN + rate * (BIAS_MAX - BIAS_MIN);
  return Math.round(bias * 1000) / 1000;
}

/**
 * Re-weight LORAUTER scores by per-type acceptance bias and re-sort. Confidence is
 * NOT renormalised (the threshold still applies to the biased value), so feedback
 * can only nudge an already-close call — never manufacture a match from nothing.
 */
export function applyFeedbackBias(scores: AdapterScore[], state: FeedbackState = loadFeedback()): AdapterScore[] {
  return scores
    .map((s) => ({ ...s, confidence: Math.min(1, s.confidence * adapterBias(s.task_type, state)) }))
    .sort((a, b) => b.confidence - a.confidence);
}
