// models.ts — canonical tier→model map + arm/judge model pins (verified 2026-05-27).
//
// Pastor (arm A) routes by tier: T0 local (Ollama, free), T1 Haiku, T2 Sonnet,
// T3 Opus. Baseline (B) is Sonnet-always, Gold (C) is Opus-always. Judge is Sonnet
// (pre-registered §3.2). Exact API ids confirmed via GET /v1/models.

import type { Tier } from "./types.ts";

export const TIER_TO_MODEL: Record<Tier, string> = {
  T0: "qwen2.5-coder:7b", // Wave 2 Day 1 swap — see ADR 017 / REPORT §4 #3
  T1: "claude-haiku-4-5-20251001",
  T2: "claude-sonnet-4-6",
  T3: "claude-opus-4-7",
};

export const BASELINE_MODEL = "claude-sonnet-4-6"; // arm B
export const GOLD_MODEL = "claude-opus-4-7"; // arm C
export const JUDGE_MODEL = "claude-sonnet-4-6"; // §3.2

const TIER_ORDER: Tier[] = ["T0", "T1", "T2", "T3"];

export function tierIdx(t: string): number {
  const i = TIER_ORDER.indexOf(t as Tier);
  return i < 0 ? TIER_ORDER.indexOf("T2") : i;
}

/** The higher (more capable) of two tiers — used to apply a pack's model_floor. */
export function maxTier(a: string, b: string): Tier {
  return TIER_ORDER[Math.max(tierIdx(a), tierIdx(b))];
}
