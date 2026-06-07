// L15 B.2 — Per-user recommendations (`mooter ecosystem recommend`).
//
// Ranking (reconciles the two source docs):
//   score = compatibility × roi_value × pastor_signal
// The vision doc specifies a 3-factor formula (… × pastor_signal_strength); the
// kickoff gate specifies the 2-factor compatibility × roi_estimate. We implement
// the 3-factor form with pastor_signal defaulting to 1.0 — which reduces exactly
// to the kickoff's 2-factor ranking when no Pastor signal is present, satisfying
// both. trust_score breaks ties.

import type { SetupProfile } from "../setup/detect.ts";
import type { CatalogItem } from "./catalog.ts";

export interface RankedRecommendation {
  item: CatalogItem;
  score: number;
  compatibility: number;
  roi_value: number;
  reason: string;
}

function wildcardMatch(list: string[], value: string): boolean {
  if (!list || list.length === 0) return true;
  if (list.includes("any")) return true;
  return list.includes(value);
}

/** Map a profile to the catalog hardware vocabulary. */
function hardwareTokens(profile: SetupProfile): string[] {
  const t = new Set<string>(["any"]);
  const hw = profile.hardware;
  if (hw.hardware_class === "apple-silicon") t.add("apple-silicon");
  if (hw.has_npu) t.add("npu");
  if (hw.hw_tier) t.add(hw.hw_tier); // gpu-high/mid/low/cpu-only
  if (hw.gpu_vendor === "cpu") t.add("cpu-only");
  return [...t];
}

function subscriptionTokens(profile: SetupProfile): string[] {
  const t = new Set<string>(["any", profile.subscriptions.subscription_tier]);
  // A subscriber can use BYOK and "none"-tier tools too.
  t.add("byok");
  if (profile.subscriptions.subscription_tier !== "none") t.add("none");
  return [...t];
}

/** Continuous-ish compatibility in [0,1]: hard gate on each dim, soft NPU/VRAM. */
export function compatibilityScore(item: CatalogItem, profile: SetupProfile): number {
  const c = item.compatibility;
  const hwTokens = hardwareTokens(profile);
  const hwOk = !c.hardware || c.hardware.length === 0 || c.hardware.includes("any") || c.hardware.some((h) => hwTokens.includes(h));
  const osOk = wildcardMatch(c.os, profile.hardware.os_class);
  const subOk = c.subscription.some((s) => subscriptionTokens(profile).includes(s)) || wildcardMatch(c.subscription, profile.subscriptions.subscription_tier);
  if (!hwOk || !osOk || !subOk) return 0;
  if (c.requires_npu && !profile.hardware.has_npu) return 0;
  if (c.min_vram_gb && (profile.hardware.vram_total_gb ?? 0) < c.min_vram_gb) return 0;
  return 1;
}

/** Normalise roi_estimate into [0.1, 1] (baseline 0.1 when no data). */
export function roiValue(item: CatalogItem): number {
  const r = item.roi_estimate ?? {};
  const sum = (r.token_savings_pct ?? 0) / 100 + (r.latency_gain_pct ?? 0) / 100 + (r.quality_uplift_pp ?? 0) / 100;
  if (sum <= 0) return 0.1;
  return Math.min(1, 0.1 + sum);
}

export interface RecommendOptions {
  limit?: number;
  pastorSignal?: number; // default 1.0 → reduces to compatibility × roi
  categories?: CatalogItem["category"][];
}

export function recommend(profile: SetupProfile, items: CatalogItem[], opts: RecommendOptions = {}): RankedRecommendation[] {
  const pastor = opts.pastorSignal ?? 1.0;
  const limit = opts.limit ?? 5;
  const ranked = items
    .filter((it) => !opts.categories || opts.categories.includes(it.category))
    .map((it) => {
      const compatibility = compatibilityScore(it, profile);
      const roi = roiValue(it);
      const score = compatibility * roi * pastor;
      const bits: string[] = [];
      if (it.roi_estimate?.token_savings_pct) bits.push(`${it.roi_estimate.token_savings_pct}% token savings`);
      if (it.roi_estimate?.latency_gain_pct) bits.push(`${it.roi_estimate.latency_gain_pct}% faster`);
      if (it.roi_estimate?.quality_uplift_pp) bits.push(`+${it.roi_estimate.quality_uplift_pp}pp quality`);
      const reason = bits.length ? bits.join(", ") : `${it.category} matched to your ${profile.hardware.hardware_class}/${profile.subscriptions.subscription_tier} setup`;
      return { item: it, score, compatibility, roi_value: roi, reason };
    })
    .filter((r) => r.compatibility > 0)
    .sort((a, b) => b.score - a.score || b.item.trust_score - a.item.trust_score);
  return ranked.slice(0, limit);
}
