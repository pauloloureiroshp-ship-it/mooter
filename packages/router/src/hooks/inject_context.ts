#!/usr/bin/env -S npx tsx
// inject_context.ts — UserPromptSubmit hook (Pastor Wave 1, Day 4).
//
// Adapts the frugal hook (tools/router/inject_context.js) to the mooter
// monorepo and EXTENDS it with axis 2: it now emits a <pack-hint> alongside
// the <router-hint>, never replacing it (backward-compat — Principle P18).
//
// Flow:
//   stdin prompt
//     → Promise.all([ classifyComplexity (axis 1), classifyDomain (axis 2) ])
//     → packResolve(pack, env)  (skills/MCPs gap analysis)
//     → emit <router-hint> + <pack-hint>
//
// Constraints (Day 4): regex-only — no Ollama, no Haiku, no arbiter. Both
// classifiers are pure regex; the heavy frugal machinery (budget cap, arbiter,
// Option-A) is intentionally out of scope here. Never fails loudly: any error
// → silent exit 0 with no context. Performance budget: combined p99 ≤ 60ms
// (see hook-integration.test.ts). Source: PASTOR §6.1, §6.4, §10.4.

import { classifyComplexity } from "../classify_complexity.ts";
import {
  classifyDomain,
  loadPacks,
  type CompiledPack,
  type DomainClassification,
} from "../classify_domain.ts";
import {
  detectEnv,
  loadPackManifest,
  packResolve,
  type ResolveEnv,
} from "../pack_resolve.ts";

const TIER_ORDER = ["T0", "T1", "T2", "T3"];
const tierIdx = (t: string): number => {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? TIER_ORDER.indexOf("T2") : i;
};

/** Render an array the way the pack-hint spec shows it: [a, b] or []. */
const arr = (xs: string[]): string => `[${xs.join(", ")}]`;

/**
 * Build both hint blocks for a prompt. Pure + injectable: packs and env are
 * parameters so tests never touch the real disk. Returns the full context
 * string (the two XML blocks separated by a blank line).
 */
export async function buildHints(
  prompt: string,
  packs: CompiledPack[] = loadPacks(),
  env: ResolveEnv = detectEnv(),
): Promise<string> {
  const [complexity, domain] = await Promise.all([
    classifyComplexity(prompt),
    Promise.resolve(classifyDomain(prompt, packs)),
  ]);

  const routerHint = renderRouterHint(complexity);
  const packHint = renderPackHint(domain, complexity, env);
  return `${routerHint}\n\n${packHint}`;
}

function renderRouterHint(c: Awaited<ReturnType<typeof classifyComplexity>>): string {
  const lines = [
    "<router-hint>",
    `task_category: ${c.task_category}`,
    `risk_level: ${c.risk_level}`,
    `tier: ${c.tier}`,
    `recommended_backend: ${c.recommended_backend}`,
    `recommended_model: ${c.recommended_model}`,
    `suggested_subagent: ${c.suggested_subagent}`,
    `confidence: ${c.confidence}`,
    c.escalation_rule && c.escalation_rule !== "none" ? `escalation: ${c.escalation_rule}` : null,
    "</router-hint>",
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

/** Per-candidate confidence share (mirrors classify_domain's top-score / sum). */
function candidateReason(domain: DomainClassification): string {
  const sum = domain.candidates.reduce((s, c) => s + Math.max(0, c.score), 0) || 1;
  const parts = domain.candidates.map((c) => `${c.pack_id} (${(c.score / sum).toFixed(2)})`);
  return `candidates: ${parts.join(", ")}`;
}

function renderPackHint(
  domain: DomainClassification,
  complexity: Awaited<ReturnType<typeof classifyComplexity>>,
  env: ResolveEnv,
): string {
  const conf = domain.confidence.toFixed(2);

  // GENERAL / AMBIGUOUS — no pack scaffold, no skills/MCPs (spec §6.1).
  if (domain.pack_id === "GENERAL" || domain.pack_id === "AMBIGUOUS") {
    const reason =
      domain.pack_id === "AMBIGUOUS"
        ? candidateReason(domain)
        : "no domain signals above threshold";
    return [
      "<pack-hint>",
      `pack=${domain.pack_id} confidence=${conf} reason="${reason}"`,
      "skills_invoke=[]",
      "mcps_recommended=[]",
      "mcps_missing=[]",
      "suggest_install=[]",
      "</pack-hint>",
    ].join("\n");
  }

  // A confident pack match — resolve the env gap and emit the full hint.
  const manifest = loadPackManifest(domain.pack_id);
  if (!manifest) {
    // Pack resolved by signals but no manifest on disk → fall back to GENERAL.
    return [
      "<pack-hint>",
      `pack=GENERAL confidence=${conf} reason="pack ${domain.pack_id} matched but manifest missing"`,
      "skills_invoke=[]",
      "mcps_recommended=[]",
      "mcps_missing=[]",
      "suggest_install=[]",
      "</pack-hint>",
    ].join("\n");
  }

  const r = packResolve(manifest, env);
  const floorRespected = tierIdx(complexity.tier) >= tierIdx(manifest.model_floor);
  const subagentPrimary = manifest.subagent_primary || complexity.suggested_subagent;

  // classify_domain's reason is "<pack>: <signals> (score, conf)"; the
  // pack-hint already states the pack on the line above, so drop the prefix.
  const signals = domain.reason.startsWith(`${manifest.pack_id}: `)
    ? domain.reason.slice(manifest.pack_id.length + 2)
    : domain.reason;

  const lines = [
    "<pack-hint>",
    `pack=${manifest.pack_id} confidence=${conf} reason="signals: ${signals}"`,
    `model_floor=${manifest.model_floor} (${floorRespected ? "respected" : "raised"})`,
    `skills_invoke=${arr(r.skills_invoke)}`,
    `mcps_recommended=${arr(r.available_mcps)}`,
    `mcps_missing=${arr(r.missing_mcps)}`,
    `subagent_primary=${subagentPrimary}`,
    manifest.scaffold_url ? `scaffold_url=${manifest.scaffold_url}` : null,
    `suggest_install=${arr(r.suggest_install)}`,
    "</pack-hint>",
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

// --- stdin entry point --------------------------------------------------------
function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract the prompt from a hook payload, or treat raw stdin as the prompt. */
function extractPrompt(raw: string): string {
  const payload = safeJson(raw);
  if (!payload) return raw.trim(); // CLI usage: echo "text" | inject_context.ts
  const msgs = payload.messages as Array<{ content?: unknown }> | undefined;
  const last = msgs && msgs.length ? msgs[msgs.length - 1]?.content : undefined;
  const p = payload.prompt ?? payload.user_prompt ?? payload.message ?? last ?? "";
  return typeof p === "string" ? p : "";
}

async function main(): Promise<void> {
  let raw = "";
  try {
    raw = (await import("node:fs")).readFileSync(0, "utf8");
  } catch {
    process.exit(0); // no stdin
  }
  const prompt = extractPrompt(raw);
  if (!prompt || prompt.length < 4) process.exit(0);

  try {
    const hints = await buildHints(prompt);
    process.stdout.write(hints + "\n");
  } catch {
    // Never break the turn over a hint — emit nothing.
  }
  process.exit(0);
}

// Run only when invoked directly (not when imported by the test suite).
const invokedPath = process.argv[1] ? (await import("node:fs")).realpathSync(process.argv[1]) : "";
const selfPath = (await import("node:url")).fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === selfPath) {
  void main();
}
