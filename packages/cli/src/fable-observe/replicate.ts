// `mooter fable-replicate <task_hash> [--with-ollama]` — can a local model
// replicate a Fable 5 orchestration decision? (Wave Mega 50-51 Phase 5,
// validation half.)
//
// HONESTY FIRST: by default observations store NO prompt_text (features-only
// privacy default). Without the prompt, full replication is IMPOSSIBLE — we say
// so and fall back to a FEATURE comparison (fable_decision vs router_baseline).
// When prompt_text IS stored (store_prompts opt-in) and --with-ollama is passed,
// we ask local qwen2.5-coder:32b (127.0.0.1:11434) which approach it would take
// and print a 3-row comparison + an honest verdict. Ollama down → graceful
// fallback to the feature comparison.
//
// This file reads observation JSON defensively against schema v1 and does not
// depend on the (concurrently-built) store module's exports.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

const TASK_HASH_RE = /^[0-9a-f]{16}$/;
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5-coder:32b";
const OLLAMA_TIMEOUT_MS = 60_000;

export function observationsDir(home: string = homedir()): string {
  return join(home, ".mooter", "fable-observations");
}

// --- defensive observation shape (schema v1) ---------------------------------

export interface ObservationV1 {
  schema?: number;
  ts?: string;
  ts_ms?: number;
  session_id?: string;
  orchestrator_model?: string;
  task_hash?: string;
  task_type?: string;
  prompt_len?: number;
  prompt_text?: string; // only present when store_prompts opt-in
  fable_decision?: {
    action?: string;
    subagent_type?: string;
    model_chosen?: string;
    parallel_count?: number;
    rationale?: string;
  };
  router_baseline?: {
    tier?: string;
    model?: string;
    confidence?: number;
    task_category?: string;
  } | null;
  pattern_gap?: string | boolean;
  outcome?: { completed?: boolean; tests_pass?: boolean | null };
  pastor_training_value?: string;
}

/** Load the observation with this task_hash (latest ts_ms wins on collision). */
export function loadObservationByHash(taskHash: string, home?: string): ObservationV1 | null {
  const dir = observationsDir(home);
  if (!existsSync(dir)) return null;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  let best: ObservationV1 | null = null;
  for (const f of files) {
    // Fast path: filename is <ts_ms>_<task_hash>.json — but verify the content too.
    if (!f.includes(taskHash) && best !== null) continue;
    try {
      const obs = JSON.parse(readFileSync(join(dir, f), "utf8")) as ObservationV1;
      if (obs?.task_hash !== taskHash) continue;
      if (!best || (obs.ts_ms ?? 0) > (best.ts_ms ?? 0)) best = obs;
    } catch {
      /* skip corrupt file */
    }
  }
  return best;
}

// --- model class / effective tier mapping ------------------------------------

export type ModelClass = "local" | "haiku" | "sonnet" | "opus" | "fable" | "unknown";

export function modelClassOf(model: string | undefined | null): ModelClass {
  const m = (model ?? "").toLowerCase();
  if (!m) return "unknown";
  if (/fable/.test(m)) return "fable";
  if (/opus/.test(m)) return "opus";
  if (/sonnet/.test(m)) return "sonnet";
  if (/haiku/.test(m)) return "haiku";
  if (/qwen|llama|mistral|gemma|deepseek|phi|coder|ollama|local/.test(m)) return "local";
  return "unknown";
}

export function effectiveTier(cls: ModelClass): string {
  switch (cls) {
    case "local": return "T0";
    case "haiku": return "T1";
    case "sonnet": return "T2";
    case "opus": return "T3";
    case "fable": return "T5";
    default: return "?";
  }
}

// --- feature comparison (the always-available fallback) -----------------------

export interface FeatureComparison {
  fable_action: string;
  fable_model: string;
  fable_class: ModelClass;
  fable_tier: string;
  baseline_tier: string | null;
  baseline_model: string | null;
  baseline_class: ModelClass | null;
  tier_agreement: boolean | null; // null = no baseline recorded
  model_agreement: boolean | null;
  pattern_gap: string;
}

export function compareFeatures(obs: ObservationV1): FeatureComparison {
  const fableModel = obs.fable_decision?.model_chosen ?? "";
  const fableClass = modelClassOf(fableModel);
  const rb = obs.router_baseline ?? null;
  const baselineClass = rb ? modelClassOf(rb.model) : null;
  const gap = obs.pattern_gap;
  return {
    fable_action: obs.fable_decision?.action ?? "?",
    fable_model: fableModel || "?",
    fable_class: fableClass,
    fable_tier: effectiveTier(fableClass),
    baseline_tier: rb?.tier ?? null,
    baseline_model: rb?.model ?? null,
    baseline_class: baselineClass,
    tier_agreement: rb?.tier ? rb.tier === effectiveTier(fableClass) : null,
    model_agreement: baselineClass !== null && baselineClass !== "unknown" && fableClass !== "unknown"
      ? baselineClass === fableClass
      : null,
    pattern_gap: typeof gap === "string" && gap ? gap : gap === true ? "yes (unspecified)" : "none recorded",
  };
}

function featureComparisonLines(obs: ObservationV1, c: FeatureComparison): string[] {
  const agree = (v: boolean | null) => (v === null ? "n/a (no baseline)" : v ? "agree" : "DISAGREE");
  return [
    `  fable decision:   ${c.fable_action}${obs.fable_decision?.subagent_type ? ` → ${obs.fable_decision.subagent_type}` : ""} · model ${c.fable_model} (class ${c.fable_class} ≈ ${c.fable_tier})${obs.fable_decision?.parallel_count ? ` · ×${obs.fable_decision.parallel_count} parallel` : ""}`,
    `  router baseline:  ${c.baseline_tier ?? "—"} · ${c.baseline_model ?? "no baseline recorded"}${c.baseline_class ? ` (class ${c.baseline_class})` : ""}`,
    `  tier agreement:   ${agree(c.tier_agreement)} · model class: ${agree(c.model_agreement)}`,
    `  pattern gap:      ${c.pattern_gap}`,
    `  local routing would have done: ${c.baseline_tier ? `${c.baseline_tier} via ${c.baseline_model}` : "unknown — no router baseline was captured for this task"}`,
  ];
}

// --- Ollama replication (opt-in prompts + --with-ollama only) ------------------

export interface OllamaVerdict {
  ok: boolean;
  action?: string;
  model_class?: string;
  reasoning_1line?: string;
  error?: string;
}

export async function askOllama(promptText: string, baseUrl: string): Promise<OllamaVerdict> {
  const instruction =
    `You are a routing agent. For the task below, answer in STRICT JSON only ` +
    `(no markdown, no prose): {"action": "inline|spawn_subagent|workflow|parallel_spawn", ` +
    `"model_class": "local|haiku|sonnet|opus", "reasoning_1line": "<one line>"}.\n\nTASK:\n${promptText}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: instruction,
        stream: false,
        format: "json",
        options: { temperature: 0 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `Ollama HTTP ${res.status}` };
    const body = (await res.json()) as { response?: string };
    const parsed = JSON.parse(body.response ?? "{}") as {
      action?: string;
      model_class?: string;
      reasoning_1line?: string;
    };
    if (!parsed.action || !parsed.model_class) return { ok: false, error: "Ollama returned JSON without action/model_class" };
    return { ok: true, action: parsed.action, model_class: parsed.model_class, reasoning_1line: parsed.reasoning_1line };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? `timeout after ${OLLAMA_TIMEOUT_MS / 1000}s` : e.message) : String(e);
    return { ok: false, error: `Ollama unreachable (${msg})` };
  } finally {
    clearTimeout(timer);
  }
}

function verdictLine(c: FeatureComparison, local: OllamaVerdict): string {
  const localClass = modelClassOf(local.model_class);
  const actionMatch = local.action === c.fable_action;
  const classMatch = localClass !== "unknown" && localClass === c.fable_class;
  if (actionMatch && classMatch) {
    return `verdict: replicable — local qwen agreed with Fable on both action (${c.fable_action}) and model class (${c.fable_class}).`;
  }
  if (actionMatch || classMatch) {
    return `verdict: partially — local qwen matched ${actionMatch ? `action (${c.fable_action})` : `model class (${c.fable_class})`} but not ${actionMatch ? `model class (${local.model_class} vs ${c.fable_class})` : `action (${local.action} vs ${c.fable_action})`}.`;
  }
  return `verdict: not-replicable — local qwen chose ${local.action}/${local.model_class}, Fable chose ${c.fable_action}/${c.fable_class}. One sample; says nothing about quality parity.`;
}

// --- the command ----------------------------------------------------------------

export interface ReplicateOptions {
  home?: string;
  ollamaUrl?: string;
}

export const REPLICATE_USAGE = `mooter fable-replicate <task_hash> [--with-ollama] [--ollama-url <url>]

Compares a recorded Fable 5 decision against the router baseline, and (when
prompt_text was stored via the store_prompts opt-in AND --with-ollama is passed)
asks local ${OLLAMA_MODEL} which approach IT would take. Local-only; the only
network call is to local Ollama.`;

export async function runFableReplicate(args: string[], opts: ReplicateOptions = {}): Promise<CmdResult> {
  const taskHash = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase() ?? "";
  if (!taskHash || args.includes("--help") || args.includes("-h")) {
    return { exitCode: taskHash ? 0 : 1, output: REPLICATE_USAGE };
  }
  if (!TASK_HASH_RE.test(taskHash)) {
    return { exitCode: 1, output: `✗ "${taskHash}" is not a task_hash (16 hex chars). Observations live in ${observationsDir(opts.home)}.` };
  }

  const obs = loadObservationByHash(taskHash, opts.home);
  if (!obs) {
    return { exitCode: 1, output: `✗ no observation found for task_hash ${taskHash} in ${observationsDir(opts.home)}.` };
  }

  const c = compareFeatures(obs);
  const head = [
    `🐮 fable-replicate · ${taskHash} · ${obs.task_type ?? "?"} · prompt_len ${obs.prompt_len ?? "?"} · orchestrator ${obs.orchestrator_model ?? "?"}`,
  ];

  const withOllama = args.includes("--with-ollama");
  const hasPrompt = typeof obs.prompt_text === "string" && obs.prompt_text.length > 0;

  if (!hasPrompt) {
    // Privacy default: no prompt stored → full replication is impossible. Say so.
    return {
      exitCode: 0,
      output: [
        ...head,
        `ℹ prompt_text was NOT stored (privacy default — store_prompts is opt-in).`,
        `  Full replication is impossible without the prompt; falling back to FEATURE comparison:`,
        ...featureComparisonLines(obs, c),
        withOllama ? `  (--with-ollama ignored: nothing to send to the local model without the prompt)` : ``,
        `verdict: not-replayable (features-only observation) — no claim about quality parity is possible from this record.`,
      ].filter(Boolean).join("\n"),
    };
  }

  if (!withOllama) {
    return {
      exitCode: 0,
      output: [
        ...head,
        `ℹ prompt_text IS stored for this observation — rerun with --with-ollama to ask local ${OLLAMA_MODEL}.`,
        `  Feature comparison:`,
        ...featureComparisonLines(obs, c),
      ].join("\n"),
    };
  }

  const baseUrl = opts.ollamaUrl ?? process.env.MOOTER_OLLAMA_URL ?? args.find((a) => a.startsWith("--ollama-url="))?.split("=")[1]
    ?? (args.includes("--ollama-url") ? args[args.indexOf("--ollama-url") + 1] : undefined) ?? DEFAULT_OLLAMA_URL;
  const local = await askOllama(obs.prompt_text!, baseUrl);

  if (!local.ok) {
    return {
      exitCode: 0,
      output: [
        ...head,
        `⚠ ${local.error} — cannot run the local replication. Falling back to FEATURE comparison:`,
        ...featureComparisonLines(obs, c),
        `verdict: inconclusive — local model not reachable; no replication data was produced.`,
      ].join("\n"),
    };
  }

  const rows = [
    ["source", "action", "model / class", "≈tier"],
    ["fable", c.fable_action, `${c.fable_model} (${c.fable_class})`, c.fable_tier],
    ["router-baseline", "—", `${c.baseline_model ?? "none recorded"}${c.baseline_class ? ` (${c.baseline_class})` : ""}`, c.baseline_tier ?? "—"],
    ["local-qwen", local.action ?? "?", `${OLLAMA_MODEL} → ${local.model_class}`, effectiveTier(modelClassOf(local.model_class))],
  ];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  const table = rows.map((r) => "  " + r.map((cell, i) => cell.padEnd(widths[i])).join("  "));

  return {
    exitCode: 0,
    output: [
      ...head,
      ...table,
      local.reasoning_1line ? `  local reasoning: ${local.reasoning_1line.slice(0, 200)}` : "",
      verdictLine(c, local),
      `ℹ one-sample comparison of ROUTING CHOICE only — this says nothing about output quality parity.`,
    ].filter(Boolean).join("\n"),
  };
}
