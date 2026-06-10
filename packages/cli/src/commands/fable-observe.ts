// `mooter fable-observe` — Wave Mega 50-51 Phase 5: Fable 5 observation loop.
//
// Claude Fable 5 acts as a frontier "teacher" orchestrator. Every orchestration
// decision it makes (delegate vs inline, which subagent, which model,
// parallelism) is logged as a FEATURE-LEVEL observation; the sha-frozen local
// router (classify.js) supplies the baseline for the same task; the gap is the
// learnable pattern Pastor trains on later.
//
//   mooter fable-observe status
//   mooter fable-observe enable [--store-prompts]   (--store-prompts prints a privacy warning)
//   mooter fable-observe disable
//   mooter fable-observe log --json '<observation json>'   primary ingestion path
//   mooter fable-observe last [N]
//   mooter fable-observe pattern <task_type>
//   mooter fable-observe stats
//
// Privacy doctrine: NO prompt text by default — a `prompt` field passed to
// `log` is sha256-hashed to a 16-hex task_hash and the text is DROPPED unless
// store_prompts is enabled. Honesty: outcome carries factual booleans
// (completed/tests_pass), not self-assessed quality floats.

import { createHash } from "node:crypto";
import { homedir } from "node:os";

import { readConfig, writeConfig, observationsDir, type FableObserveConfig } from "../fable-observe/config.ts";
import {
  validateObservation,
  TASK_TYPES,
  type FableObservation,
  type FableDecision,
} from "../fable-observe/schema.ts";
import { writeObservation, listObservations, statsObservations, patternsFor } from "../fable-observe/store.ts";
import { runRouterBaseline } from "../fable-observe/baseline.ts";
import { runFableReplicate } from "../fable-observe/replicate.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface FableObserveDeps {
  home?: string;
  classifyJs?: string; // explicit path to classify.js (tests / non-standard installs)
  now?: () => number;
}

const USAGE = `mooter fable-observe — Fable 5 orchestration observation loop (opt-in)

  mooter fable-observe status                     enabled? store_prompts? observation count
  mooter fable-observe enable [--store-prompts]   turn observation logging on
  mooter fable-observe disable                    turn it off
  mooter fable-observe log --json '<json>'        ingest one observation (schema v1)
  mooter fable-observe last [N]                   recent observations table (default 10)
  mooter fable-observe pattern <task_type>        learned-pattern aggregate (${TASK_TYPES.join("|")})
  mooter fable-observe stats                      totals · by-type · by-action · high-value share
  mooter fable-observe replicate-test <task_hash> [--with-ollama]   can local qwen replicate the decision? (honest feature-comparison fallback when no prompt stored)

Privacy: prompt text is NEVER stored by default — only a 16-hex sha256 hash.`;

function sha16(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function renderStatus(cfg: FableObserveConfig, count: number, dir: string): string {
  return [
    `🐮 fable-observe: ${cfg.enabled ? "enabled" : "disabled"}`,
    `  store_prompts ... ${cfg.store_prompts ? "ON (raw prompt text is written to disk)" : "off (hash-only, default)"}`,
    `  observations .... ${count}`,
    `  dir ............. ${dir}`,
    cfg.enabled
      ? `  ↳ ingest with \`mooter fable-observe log --json '<observation>'\` from the Fable session.`
      : `  ↳ run \`mooter fable-observe enable\` first; nothing is recorded while disabled.`,
  ].join("\n");
}

/**
 * Normalize a raw `log --json` payload into a schema-v1 observation:
 * - a `prompt` field is hashed → task_hash (+ prompt_len); text dropped unless store_prompts
 * - ts/ts_ms filled when missing
 * - router_baseline auto-filled from classify.js when a prompt is available
 * - nullable fields defaulted to null (action + task_type + training value stay caller-supplied)
 */
function normalize(
  raw: Record<string, unknown>,
  cfg: FableObserveConfig,
  deps: FableObserveDeps,
): Record<string, unknown> {
  const o: Record<string, unknown> = { ...raw };
  const nowMs = deps.now ? deps.now() : Date.now();

  let prompt: string | null = null;
  if (typeof o.prompt === "string") {
    prompt = o.prompt;
    delete o.prompt;
    o.task_hash = sha16(prompt);
    if (o.prompt_len === undefined) o.prompt_len = prompt.length;
    if (cfg.store_prompts) o.prompt_text = prompt;
    else delete o.prompt_text;
  }

  if (o.schema === undefined) o.schema = 1;
  if (typeof o.ts_ms !== "number") o.ts_ms = nowMs;
  if (typeof o.ts !== "string") o.ts = new Date(o.ts_ms as number).toISOString();
  if (o.session_id === undefined) o.session_id = null;
  if (o.orchestrator_model === undefined) o.orchestrator_model = "claude-fable-5";
  if (o.prompt_len === undefined) o.prompt_len = null;
  if (o.pattern_gap === undefined) o.pattern_gap = null;

  const fd = (o.fable_decision ?? {}) as Record<string, unknown>;
  o.fable_decision = {
    action: fd.action,
    subagent_type: fd.subagent_type ?? null,
    model_chosen: fd.model_chosen ?? null,
    parallel_count: fd.parallel_count ?? null,
    rationale: fd.rationale ?? null,
  };

  const oc = (o.outcome ?? {}) as Record<string, unknown>;
  o.outcome = { completed: oc.completed ?? null, tests_pass: oc.tests_pass ?? null };

  if (o.router_baseline === undefined) {
    o.router_baseline = prompt ? runRouterBaseline(prompt, deps.classifyJs) : null;
  }

  return o;
}

function renderLast(obs: FableObservation[]): string {
  if (obs.length === 0) {
    return "🐮 no Fable observations yet — enable, then `log` from a Fable session (or wire the PostToolUse hook).";
  }
  const header = `${pad("ts", 20)} ${pad("task_type", 13)} ${pad("decision", 32)} ${pad("baseline", 9)} ${pad("gap", 4)} value`;
  const rows = obs.map((o) => {
    const fd = o.fable_decision;
    const decision = fd.subagent_type ? `${fd.action}→${fd.subagent_type}` : fd.action;
    const baseline = o.router_baseline ? o.router_baseline.tier : "—";
    return `${pad(o.ts.replace("T", " ").slice(0, 19), 20)} ${pad(o.task_type, 13)} ${pad(decision, 32)} ${pad(baseline, 9)} ${pad(o.pattern_gap ? "yes" : "—", 4)} ${o.pastor_training_value}`;
  });
  return [`🐮 last ${obs.length} Fable observation(s)`, header, ...rows].join("\n");
}

function renderStats(obs: FableObservation[]): string {
  if (obs.length === 0) {
    return "🐮 no Fable observations yet — nothing to aggregate. Run `mooter fable-observe enable` and log from a Fable session.";
  }
  const s = statsObservations(obs);
  const fmtMap = (m: Record<string, number>): string =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  ");
  return [
    `🐮 fable-observe stats — ${s.total} observation(s)`,
    `  by task_type .... ${fmtMap(s.by_task_type)}`,
    `  by action ....... ${fmtMap(s.by_action)}`,
    `  training value .. ${fmtMap(s.by_training_value)} (high-value share ${(s.high_value_share * 100).toFixed(0)}%)`,
    `  pattern gaps .... ${s.with_pattern_gap}/${s.total} observation(s) diverged from the router baseline`,
    `  with baseline ... ${s.with_baseline}/${s.total} carry a classify.js baseline`,
  ].join("\n");
}

function renderPattern(taskType: string, obs: FableObservation[]): string {
  const entries = patternsFor(obs, taskType);
  if (entries.length === 0) {
    return `🐮 no observations for task_type "${taskType}" yet — no learned pattern to show.`;
  }
  const total = entries.reduce((acc, e) => acc + e.count, 0);
  const lines = entries.map((e) => {
    const who = e.subagent_type ? `${e.action} → ${e.subagent_type}` : e.action;
    const models = e.models.length ? ` [${e.models.join(", ")}]` : "";
    const why = e.example_rationales.length ? `\n      e.g. ${e.example_rationales.map((r) => `"${r}"`).join(" · ")}` : "";
    return `  ${pad(`${e.count}×`, 5)} ${who}${models}${why}`;
  });
  return [`🐮 Fable pattern for "${taskType}" (${total} observation(s))`, ...lines].join("\n");
}

export async function runFableObserve(args: string[], deps: FableObserveDeps = {}): Promise<CmdResult> {
  const home = deps.home ?? homedir();
  const sub = args[0];
  const cfg = readConfig(home);

  if (!sub || sub === "--help" || sub === "help") {
    return { exitCode: 0, output: USAGE };
  }

  if (sub === "status") {
    const count = listObservations(home).length;
    return { exitCode: 0, output: renderStatus(cfg, count, observationsDir(home)) };
  }

  if (sub === "enable") {
    const storePrompts = args.includes("--store-prompts");
    writeConfig({ enabled: true, store_prompts: storePrompts || cfg.store_prompts }, home);
    const lines = ["🐮 fable-observe enabled — Fable orchestration decisions can now be logged."];
    if (storePrompts) {
      lines.push(
        "⚠ privacy warning: --store-prompts is ON. RAW PROMPT TEXT will be written to",
        `  ${observationsDir(home)} in plaintext. Default doctrine is hash-only;`,
        "  disable with `mooter fable-observe enable` (without the flag) after editing the config,",
        "  or `mooter fable-observe disable` to stop logging entirely.",
      );
    } else {
      lines.push("  privacy: hash-only (prompt text is never stored).");
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "disable") {
    writeConfig({ ...cfg, enabled: false }, home);
    return { exitCode: 0, output: "🐮 fable-observe disabled — no observations will be recorded." };
  }

  if (sub === "log") {
    if (!cfg.enabled) {
      return { exitCode: 1, output: "🐮 fable-observe is disabled — run `mooter fable-observe enable` first." };
    }
    const jsonIdx = args.indexOf("--json");
    const rawJson = jsonIdx !== -1 ? args[jsonIdx + 1] : undefined;
    if (!rawJson) {
      return { exitCode: 1, output: "usage: mooter fable-observe log --json '<observation json>'" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      return { exitCode: 1, output: `🐮 invalid JSON: ${(e as Error).message}` };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { exitCode: 1, output: "🐮 observation must be a JSON object" };
    }
    const obs = normalize(parsed as Record<string, unknown>, cfg, deps);
    const errors = validateObservation(obs);
    if (errors.length > 0) {
      return { exitCode: 1, output: `🐮 observation rejected (schema v1):\n${errors.map((e) => `  - ${e}`).join("\n")}` };
    }
    const path = writeObservation(obs as unknown as FableObservation, home);
    const fd = obs.fable_decision as FableDecision;
    const baseline = obs.router_baseline as FableObservation["router_baseline"];
    return {
      exitCode: 0,
      output: [
        `🐮 observation recorded → ${path}`,
        `  decision ... ${fd.action}${fd.subagent_type ? `→${fd.subagent_type}` : ""}${fd.model_chosen ? ` (${fd.model_chosen})` : ""}`,
        `  baseline ... ${baseline ? `${baseline.tier} ${baseline.model} (conf ${baseline.confidence})` : "none (no prompt / classify.js unavailable)"}`,
        `  privacy .... ${(obs as Record<string, unknown>).prompt_text !== undefined ? "prompt text STORED (store_prompts opt-in)" : "hash-only"}`,
      ].join("\n"),
    };
  }

  if (sub === "last") {
    const n = args[1] ? Number.parseInt(args[1], 10) : 10;
    const limit = Number.isFinite(n) && n > 0 ? n : 10;
    return { exitCode: 0, output: renderLast(listObservations(home, { limit })) };
  }

  if (sub === "stats") {
    return { exitCode: 0, output: renderStats(listObservations(home)) };
  }

  if (sub === "pattern") {
    const taskType = args[1];
    if (!taskType) {
      return { exitCode: 1, output: `usage: mooter fable-observe pattern <task_type>  (${TASK_TYPES.join("|")})` };
    }
    return { exitCode: 0, output: renderPattern(taskType, listObservations(home)) };
  }

  if (sub === "replicate-test") {
    // Phase 5 validation half — feature comparison by default; full replication
    // only when prompt_text was stored (store_prompts opt-in) AND --with-ollama.
    return runFableReplicate(args.slice(1), { home: deps.home });
  }

  return { exitCode: 1, output: `unknown subcommand "${sub}"\n\n${USAGE}` };
}
