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

import { createHash } from "node:crypto";
import { hostname, platform, release } from "node:os";
import { classifyComplexity } from "../classify_complexity.ts";
import {
  classifyDomainCombined,
  loadPacks,
  type CombinedDomainClassification,
  type CompiledPack,
  type DomainClassification,
} from "../classify_domain.ts";
import type { EmbeddingStore } from "../embedding_store.ts";
import { eventWriter } from "../event_writer.ts";
import {
  detectEnv,
  loadPackManifest,
  packResolve,
  type ResolveEnv,
} from "../pack_resolve.ts";
import { generateUUIDv7, makeEnvelope, type MooterEvent, type Tier } from "../mooter_event.ts";
import { applyAmbiguousScaffold, applyGeneralFallback, applyTierEscalation } from "../policy.ts";
import {
  applyExecutionFields,
  type LlmResponseObservation,
} from "../execution_fields.ts";

/**
 * Wave 2 Day 6 post-call entry point. Given the routing draft built pre-call by
 * buildRoutingEvent and the turn's observed usage, return the completed event
 * ready for eventWriter.write(). Thin re-export so callers import one module.
 */
export function finalizeRoutingEvent(
  draft: MooterEvent,
  observation: LlmResponseObservation,
): MooterEvent {
  return applyExecutionFields(draft, observation);
}

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

/** Routing-side classifications shared by hint rendering and event writing. */
export interface HintClassifications {
  complexity: Awaited<ReturnType<typeof classifyComplexity>>;
  domain: CombinedDomainClassification;
}

/**
 * Compute axis-1 + axis-2 classifications. Pure + injectable: packs/store are
 * parameters so tests can pin behaviour. Wave 2 Day 4 extracts this from
 * buildHints so main() can reuse the result for the event_writer payload
 * without classifying twice.
 */
export async function classifyForHints(
  prompt: string,
  packs: CompiledPack[] = loadPacks(),
  store?: EmbeddingStore,
): Promise<HintClassifications> {
  // Wave 2 Day 3: classify_domain is now v1 (regex) + v2 (embedding). v2
  // helps via embedding_store but never silently overrides confident v1; if
  // Ollama is unreachable, classifyDomainCombined returns v1 with
  // source="regex_fallback" — the hook keeps emitting hints, unaware.
  const [complexity, domain] = await Promise.all([
    classifyComplexity(prompt),
    classifyDomainCombined(prompt, packs, store),
  ]);
  return { complexity, domain };
}

/** Render the two hint blocks from pre-computed classifications. */
export function renderHints(
  c: HintClassifications,
  env: ResolveEnv,
  prompt: string,
): string {
  const routerHint = renderRouterHint(c.complexity);
  const packHint = renderPackHint(c.domain, c.complexity, env, prompt);
  return `${routerHint}\n\n${packHint}`;
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
  const c = await classifyForHints(prompt, packs, store);
  return renderHints(c, env, prompt);
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

// --- Wave 2 Day 4: routing-decision event capture -----------------------------
//
// One MooterEvent per hook invocation, written best-effort to ~/.mooter/sessions.
// Day 4 fills routing fields only (axis1, axis2, model_floor/ceiling, escalation);
// the event still satisfies the schema with nulls in the execution slots.
//
// Wave 2 Day 6: the execution fields (tokens_in/out, cost_micros, latency,
// error_type) are now filled by applyExecutionFields() in execution_fields.ts.
// It is re-exported here as finalizeRoutingEvent so the Stop/post-call path has
// a single entry point: capture the routing draft pre-call, then call
// finalizeRoutingEvent(draft, observation) once the turn's usage is known. The
// harness Stop-hook trigger that supplies that observation is not yet plumbed
// in this repo; the capture itself is complete and covered by
// execution-fields.test.ts.

/** sha256 → 16 hex chars. NEVER store raw prompt text in events. */
function promptHash16(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

/** Rough token estimator — char/4 is a well-known proxy good enough for budgets. */
function estimateTokens(prompt: string): number {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function readPastorVersion(): string {
  // package.json version pin overridable via env when the harness wants to
  // tag a custom build (e.g. nightly). Tests don't exercise main(), so they
  // never see this branch.
  return process.env.PASTOR_VERSION ?? "0.1.0";
}

function readPricingVersion(): string {
  return process.env.PRICING_VERSION ?? "0.0.0";
}

/**
 * Stable per-machine pseudonymous user id. sha256 over host fingerprint —
 * never any of the prompt content. Salted with a local file so the same
 * machine yields the same id across runs but a different one if the user
 * recreates ~/.mooter (e.g. wipes for privacy).
 */
function anonUserId(): string {
  const fp = [hostname(), platform(), release(), process.arch].join("|");
  return "anon:" + createHash("sha256").update(fp, "utf8").digest("hex").slice(0, 16);
}

function envHash(): string {
  const parts = [platform(), release(), process.version];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 16);
}

function sessionId(): string {
  // Harness-supplied session id when available; otherwise generate one per hook
  // invocation. Wave 2 Day 6 may surface a longer-lived session id when the
  // post-LLM-call hook lands.
  const fromEnv =
    process.env.CLAUDE_SESSION_ID ??
    process.env.MOOTER_SESSION_ID ??
    null;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  return generateUUIDv7();
}

function tierOrDefault(t: string | undefined | null, fallback: Tier): Tier {
  return t === "T0" || t === "T1" || t === "T2" || t === "T3" ? t : fallback;
}

/**
 * Build a routing-only event from the prompt + classifications + manifest.
 * Execution + quality fields stay null until Wave 2 Day 6 wires the post-hook.
 */
export function buildRoutingEvent(
  prompt: string,
  c: HintClassifications,
): MooterEvent {
  const recommendedTier = tierOrDefault(c.complexity.tier, "T2");

  // Look up the (optional) per-pack manifest so floor/ceiling/escalation are
  // captured the same way the pack-hint emits them.
  const manifest =
    c.domain.pack_id !== "GENERAL" && c.domain.pack_id !== "AMBIGUOUS"
      ? loadPackManifest(c.domain.pack_id)
      : null;

  const flooredTier: Tier = manifest
    ? (tierIdx(recommendedTier) >= tierIdx(manifest.model_floor)
        ? recommendedTier
        : (manifest.model_floor as Tier))
    : recommendedTier;

  const escalation = manifest
    ? applyTierEscalation({
        prompt,
        pack: {
          escalation_keywords: manifest.escalation_keywords,
          model_ceiling: manifest.model_ceiling,
        },
        suggested_tier: flooredTier,
      })
    : null;

  const escalationApplied = escalation?.applied === true;
  const escalationReason = escalationApplied ? escalation?.reason ?? null : null;

  const ceiling: Tier = manifest ? (manifest.model_ceiling as Tier) : "T3";
  const floor: Tier = manifest ? (manifest.model_floor as Tier) : "T0";

  const envelope = makeEnvelope({
    event_type: "prod",
    user_id_anon: anonUserId(),
    session_id: sessionId(),
    pastor_version: readPastorVersion(),
    pricing_version: readPricingVersion(),
    env_hash: envHash(),
  });

  return {
    ...envelope,
    prompt_hash: promptHash16(prompt),
    prompt_tokens_est: estimateTokens(prompt),
    axis1_tier_recommended: recommendedTier,
    axis1_confidence: c.complexity.confidence ?? 0,
    axis2_pack_id:
      c.domain.pack_id === "GENERAL" || c.domain.pack_id === "AMBIGUOUS"
        ? null
        : c.domain.pack_id,
    axis2_confidence: c.domain.confidence,
    axis3_adapter_id: null,
    axis3_adapter_version: null,
    model_floor_applied: floor,
    model_ceiling_applied: ceiling,
    escalation_triggered: escalationApplied,
    escalation_reason: escalationReason,

    // Execution fields — wire-in target is Wave 2 Day 6 post-LLM hook.
    model_actual: null,
    provider: null,
    tokens_in: null,
    tokens_out: null,
    tokens_cache_hit: null,
    cost_micros: null,
    latency_ms_total: null,
    latency_ms_ttft: null,
    latency_ms_per_tok: null,
    error_type: null,
    retries: null,

    // Quality fields — wire-in target is next-turn detection (Wave 3 D1+).
    user_continued: null,
    user_edited_output: null,
    user_aborted: null,
    session_outcome: null,
    rating_thumb: null,
    rating_comment_anon: null,
  };
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
    const packs = loadPacks();
    const env = detectEnv();
    const c = await classifyForHints(prompt, packs);
    process.stdout.write(renderHints(c, env, prompt) + "\n");

    // Fire-and-forget event capture — never block the hook on telemetry. The
    // writer already swallows I/O failures internally; awaiting only ensures
    // ordering inside this process.
    try {
      await eventWriter.write(buildRoutingEvent(prompt, c));
    } catch {
      // best-effort
    }
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
