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
  classifyDomainCombined,
  loadPacks,
  type CompiledPack,
  type DomainClassification,
} from "../classify_domain.ts";
import type { EmbeddingStore } from "../embedding_store.ts";
import {
  detectEnv,
  loadPackManifest,
  packResolve,
  type ResolveEnv,
} from "../pack_resolve.ts";
import { applyAmbiguousScaffold, applyGeneralFallback, applyTierEscalation } from "../policy.ts";

// --- NIT 2 (Wave 2 Day 3): single inline_scaffold slot ----------------------
// resolveInlineScaffold returns AT MOST ONE scaffold so the render code emits
// a single `inline_scaffold=` line — never two. AMBIGUOUS is tried first; if
// it does not apply, GENERAL fallback is tried; otherwise nothing is emitted.
type InlineScaffold =
  | { kind: "ambiguous"; scaffold: string }
  | { kind: "fallback"; scaffold: string; tier: string; reason: string }
  | null;

export function resolveInlineScaffold(args: {
  pack_id: string;
  candidates: string[];
  recommended_tier: string;
}): InlineScaffold {
  const ambig = applyAmbiguousScaffold({ pack_id: args.pack_id, candidates: args.candidates });
  if (ambig.applied) return { kind: "ambiguous", scaffold: ambig.scaffold };

  const fallback = applyGeneralFallback({
    pack_id: args.pack_id,
    recommended_tier: args.recommended_tier,
  });
  if (fallback.applied) {
    return {
      kind: "fallback",
      scaffold: fallback.scaffold,
      tier: fallback.tier,
      reason: fallback.reason,
    };
  }
  return null;
}

const TIER_ORDER = ["T0", "T1", "T2", "T3"];
const tierIdx = (t: string): number => {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? TIER_ORDER.indexOf("T2") : i;
};

/** Render an array the way the pack-hint spec shows it: [a, b] or []. */
const arr = (xs: string[]): string => `[${xs.join(", ")}]`;

/**
 * Render suggest_install as a tree (PASTOR §6.1 / §10.6): the one-shot pack
 * installer sits on the `suggest_install=` line, per-item commands hang below
 * with `└─`. Empty → `suggest_install=[]`. The first element stays on the key
 * line so single-line parsers still read the primary command.
 *
 *   suggest_install=mooter pack install code-audit
 *     └─ npx -y snyk@latest mcp -t stdio --experimental
 */
function renderSuggestInstall(cmds: string[]): string {
  if (cmds.length === 0) return "suggest_install=[]";
  const [head, ...rest] = cmds;
  return [`suggest_install=${head}`, ...rest.map((c) => `  └─ ${c}`)].join("\n");
}

/**
 * Build both hint blocks for a prompt. Pure + injectable: packs and env are
 * parameters so tests never touch the real disk. Returns the full context
 * string (the two XML blocks separated by a blank line).
 */
export async function buildHints(
  prompt: string,
  packs: CompiledPack[] = loadPacks(),
  env: ResolveEnv = detectEnv(),
  store?: EmbeddingStore,
): Promise<string> {
  // Wave 2 Day 3: classify_domain is now v1 (regex) + v2 (embedding). v2
  // helps via embedding_store but never silently overrides confident v1; if
  // Ollama is unreachable, classifyDomainCombined returns v1 with
  // source="regex_fallback" — the hook keeps emitting hints, unaware. `store`
  // is injectable so tests can pin v1-only behaviour with a dead store.
  const [complexity, domain] = await Promise.all([
    classifyComplexity(prompt),
    classifyDomainCombined(prompt, packs, store),
  ]);

  const routerHint = renderRouterHint(complexity);
  const packHint = renderPackHint(domain, complexity, env, prompt);
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
  prompt: string,
): string {
  const conf = domain.confidence.toFixed(2);

  // GENERAL / AMBIGUOUS — no pack scaffold, no skills/MCPs (spec §6.1).
  if (domain.pack_id === "GENERAL" || domain.pack_id === "AMBIGUOUS") {
    const isAmbiguous = domain.pack_id === "AMBIGUOUS";
    const reason = isAmbiguous ? candidateReason(domain) : "no domain signals above threshold";

    // Wave 2 Day 3 NIT 2: a single inline_scaffold slot. resolveInlineScaffold
    // picks AT MOST ONE scaffold (ambiguous OR fallback) and never both, so the
    // pack-hint cannot leak two inline_scaffold lines even if the underlying
    // policy fns ever disagreed.
    const scaffold = resolveInlineScaffold({
      pack_id: domain.pack_id,
      candidates: domain.candidates.map((c) => c.pack_id),
      recommended_tier: complexity.tier,
    });

    return [
      "<pack-hint>",
      `pack=${domain.pack_id} confidence=${conf} reason="${reason}"`,
      scaffold?.kind === "fallback"
        ? `final_tier=${scaffold.tier} (general-fallback: ${scaffold.reason})`
        : null,
      scaffold ? `inline_scaffold="${scaffold.scaffold}"` : null,
      "skills_invoke=[]",
      "mcps_recommended=[]",
      "mcps_missing=[]",
      "suggest_install=[]",
      // GENERAL nudges toward hub discovery (§7 cenário E); AMBIGUOUS already
      // lists candidates (§7 cenário D), so no search nudge there. `mooter pack
      // search` itself lands in Wave 2 — this is the forward-looking hint.
      isAmbiguous ? null : "suggest_search=mooter pack search <keyword>",
      "</pack-hint>",
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
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
  const flooredTier = tierIdx(complexity.tier) >= tierIdx(manifest.model_floor)
    ? complexity.tier
    : manifest.model_floor;
  const floorRespected = flooredTier === complexity.tier;

  // Wave 2 fix #2: per-pack keyword escalation. When the prompt contains any of
  // the pack's escalation_keywords, promote to model_ceiling (typically Opus).
  // Lets a pack hold a low floor for trivial variants while still routing deep
  // audits / production-grade reviews to the heavy model.
  const escalation = applyTierEscalation({
    prompt,
    pack: { escalation_keywords: manifest.escalation_keywords, model_ceiling: manifest.model_ceiling },
    suggested_tier: flooredTier,
  });

  // Wave 2 Day 2 — enforce model_ceiling as a true upper bound. Previously the
  // ceiling only served as the escalation target; the YAML semantic ("ceiling")
  // means "no model above this for this pack" even when axis-1 complexity asks
  // for it. Concrete effect: animation-web (ceiling T2) caps T3 tasks to T2,
  // i.e. Sonnet instead of Opus. Packs that want Opus on heavy work keep
  // ceiling=T3 (e.g. code-audit).
  const ceilingApplied = tierIdx(escalation.tier) > tierIdx(manifest.model_ceiling);
  const finalTier = ceilingApplied ? manifest.model_ceiling : escalation.tier;

  const subagentPrimary = manifest.subagent_primary || complexity.suggested_subagent;

  // classify_domain's reason is "<pack>: <signals> (score, conf)"; the
  // pack-hint already states the pack on the line above, so drop the prefix.
  const signals = domain.reason.startsWith(`${manifest.pack_id}: `)
    ? domain.reason.slice(manifest.pack_id.length + 2)
    : domain.reason;

  const finalTierReason = (() => {
    const parts: string[] = [];
    if (escalation.applied) parts.push(`escalation: ${escalation.reason}`);
    if (ceilingApplied) parts.push(`ceiling-cap: ${escalation.tier}→${manifest.model_ceiling}`);
    return parts.length ? parts.join("; ") : null;
  })();

  const lines = [
    "<pack-hint>",
    `pack=${manifest.pack_id} confidence=${conf} reason="signals: ${signals}"`,
    `model_floor=${manifest.model_floor} (${floorRespected ? "respected" : "raised"})`,
    finalTierReason ? `final_tier=${finalTier} (${finalTierReason})` : null,
    `skills_invoke=${arr(r.skills_invoke)}`,
    `mcps_recommended=${arr(r.available_mcps)}`,
    `mcps_missing=${arr(r.missing_mcps)}`,
    `subagent_primary=${subagentPrimary}`,
    manifest.scaffold_url ? `scaffold_url=${manifest.scaffold_url}` : null,
    renderSuggestInstall(r.suggest_install),
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
