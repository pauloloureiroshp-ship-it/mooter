// arm-pastor.ts — arm A: the real Pastor stack, end to end.
//
// Pipeline (§2): classify_complexity (tier) + classify_domain (pack) → apply the
// pack's model_floor (the floor raises the tier, mirroring inject_context's
// "raised" logic) → load the pack scaffold as the system prompt + note skills →
// invoke the tier's model (T0 Ollama / T1 Haiku / T2 Sonnet / T3 Opus).
// AMBIGUOUS / GENERAL → no scaffold, route by the bare complexity tier (§9.7/§9.8).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { classifyComplexity } from "../../../src/classify_complexity.ts";
import {
  classifyDomain,
  loadPacks,
  defaultPacksDir,
  type CompiledPack,
} from "../../../src/classify_domain.ts";
import {
  detectEnv,
  loadPackManifest,
  packResolve,
  type ResolveEnv,
} from "../../../src/pack_resolve.ts";
import { applyGeneralFallback, applyTierEscalation } from "../../../src/policy.ts";
import { invokeModel } from "./invoke.ts";
import { TIER_TO_MODEL, maxTier } from "./models.ts";
import type { ArmInvocation, Tier } from "./types.ts";

// Pack regexes + env are stable for the run; compile/detect once (mirrors the hook).
let _packs: CompiledPack[] | null = null;
let _env: ResolveEnv | null = null;
const packs = (): CompiledPack[] => (_packs ??= loadPacks());
const env = (): ResolveEnv => (_env ??= detectEnv());

const round4 = (x: number): number => Number(x.toFixed(4));

function readScaffold(packId: string): string {
  const p = join(defaultPacksDir(), packId, "scaffold.md");
  try {
    return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
  } catch {
    return "";
  }
}

function buildSystemPrompt(scaffold: string, skills: string[]): string {
  const parts: string[] = [];
  if (scaffold) parts.push(scaffold);
  if (skills.length) {
    parts.push(`Skills recomendadas para esta tarefa: ${skills.join(", ")}.`);
  }
  return parts.join("\n\n");
}

export async function runPastor(prompt: string): Promise<ArmInvocation> {
  // --- classification (axis 1 + axis 2), timed together (the hint cost) ---
  const t0 = process.hrtime.bigint();
  const complexity = await classifyComplexity(prompt);
  const domain = classifyDomain(prompt, packs());
  const classifierMs = Number(process.hrtime.bigint() - t0) / 1e6;

  let packRouted = domain.pack_id;
  const packConfidence = round4(domain.confidence);
  let effectiveTier: Tier = (complexity.tier as Tier) ?? "T2";
  let system = "";
  let skills: string[] = [];

  const isRealPack = packRouted !== "AMBIGUOUS" && packRouted !== "GENERAL";
  if (isRealPack) {
    const manifest = loadPackManifest(packRouted);
    if (manifest) {
      effectiveTier = maxTier(effectiveTier, manifest.model_floor);
      // Wave 2 fix #2: per-pack keyword escalation (e.g. code-audit T2 floor
      // promoted to T3 ceiling when the user types "audit completo").
      effectiveTier = applyTierEscalation({
        prompt,
        pack: {
          escalation_keywords: manifest.escalation_keywords,
          model_ceiling: manifest.model_ceiling,
        },
        suggested_tier: effectiveTier,
      }).tier;
      const resolved = packResolve(manifest, env());
      skills = resolved.skills_invoke;
      system = buildSystemPrompt(readScaffold(packRouted), skills);
    } else {
      packRouted = "GENERAL"; // matched by signals but no manifest on disk
    }
  }

  // Wave 2 fix #1: GENERAL fallback. Apply AFTER the real-pack branch so a
  // missing-manifest fallthrough also benefits. AMBIGUOUS keeps its own path
  // (Wave 2 Day 2 ships a separate scaffold for it).
  if (packRouted === "GENERAL") {
    const fb = applyGeneralFallback({
      pack_id: packRouted,
      recommended_tier: effectiveTier,
    });
    effectiveTier = fb.tier;
    if (fb.applied && fb.scaffold) {
      system = fb.scaffold;
    }
  }

  const model = TIER_TO_MODEL[effectiveTier];
  const r = await invokeModel(model, system, prompt);

  return {
    model_used: model,
    tier_routed: effectiveTier,
    pack_routed: packRouted,
    pack_confidence: packConfidence,
    latency_classifier_ms: round4(classifierMs),
    latency_llm_ms: r.latency_ms,
    latency_total_ms: Math.round(classifierMs) + r.latency_ms,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    response: r.text,
    status: r.status,
    error: r.error,
    system_prompt_used: system || null,
    skills_invoke: skills,
  };
}
