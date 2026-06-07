// L12 budget controller — decides WHETHER to compress, before deciding HOW.
//
// Compression is opt-in (default off). Even when enabled, tiny prompts are not
// worth compressing, and a hard floor guarantees we never strip a prompt below a
// usable size. This keeps L12 a pure cost optimisation that never degrades a
// short, already-cheap prompt.

import { compressPrompt, estimateTokens, type CompressionOptions, type CompressionResult } from "./compressor.ts";
import { readPreferences } from "../config.ts";

export interface BudgetConfig {
  /** Master switch. Default false → L12 is passive (no compression). */
  enabled: boolean;
  /** Target compression factor when we do compress. */
  target_ratio: number;
  /** Don't bother compressing prompts at/under this token count. */
  min_tokens_to_compress: number;
  /** Never compress below this many tokens (hard floor). */
  budget_min_tokens: number;
  /** Keep entities (names/paths/code/errors) intact. */
  preserve_entities: boolean;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  enabled: false,
  target_ratio: 4,
  min_tokens_to_compress: 200,
  budget_min_tokens: 64,
  preserve_entities: true,
};

export interface BudgetPlan {
  compress: boolean;
  reason: string;
  prompt_tokens: number;
  target_ratio: number;
}

/**
 * Load the budget config from ~/.mooter/preferences.json (`compression` block)
 * merged over the defaults. Absent/corrupt prefs → defaults (passive/off).
 */
export function loadBudgetConfig(): BudgetConfig {
  const prefs = readPreferences();
  const block = (prefs.compression && typeof prefs.compression === "object" ? prefs.compression : {}) as Partial<BudgetConfig>;
  return { ...DEFAULT_BUDGET, ...block };
}

/** Pure decision: should this prompt be compressed under this config? */
export function planCompression(prompt: string, config: BudgetConfig = DEFAULT_BUDGET): BudgetPlan {
  const promptTokens = estimateTokens(prompt);
  if (!config.enabled) {
    return { compress: false, reason: "disabled", prompt_tokens: promptTokens, target_ratio: config.target_ratio };
  }
  if (promptTokens <= config.min_tokens_to_compress) {
    return { compress: false, reason: "below_min_tokens", prompt_tokens: promptTokens, target_ratio: config.target_ratio };
  }
  return { compress: true, reason: "eligible", prompt_tokens: promptTokens, target_ratio: config.target_ratio };
}

export interface ManagedCompression {
  plan: BudgetPlan;
  result: CompressionResult;
  saved_tokens: number;
}

/**
 * Plan + (conditionally) compress in one call. When the plan says no, returns
 * the prompt unchanged with backend "none" — callers can always read
 * `result.compressed` safely.
 */
export function compressWithinBudget(
  prompt: string,
  config: BudgetConfig = DEFAULT_BUDGET,
  spawn?: CompressionOptions["spawn"],
): ManagedCompression {
  const plan = planCompression(prompt, config);
  if (!plan.compress) {
    const tokens = plan.prompt_tokens;
    return {
      plan,
      result: {
        compressed: prompt,
        original_tokens: tokens,
        compressed_tokens: tokens,
        ratio: 1,
        backend: "none",
        preserved_entities: 0,
      },
      saved_tokens: 0,
    };
  }
  const result = compressPrompt(prompt, {
    target_ratio: config.target_ratio,
    preserve_entities: config.preserve_entities,
    budget_min_tokens: config.budget_min_tokens,
    backend: "auto",
    spawn,
  });
  return { plan, result, saved_tokens: Math.max(0, result.original_tokens - result.compressed_tokens) };
}
