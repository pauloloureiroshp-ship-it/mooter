// packages/cli/src/fable-observe/cca-f-export.ts — Wave 53 Phase I.
//
// `mooter cca-f export` — emit the Fable observation log as a structured CCA-F
// audit JSONL for the Wave 54 audit harness. Lives in fable-observe/ (Wave 53
// Decision 5: extend the REAL subsystem; do NOT fork a parallel cca-f/ tree) and
// reads the real FableObservation store — no fabricated fields.
//
// Honesty (refutes the original brief's CCAFExportRecord): the observation schema
// records NO per-decision tokens_in/out, cost_usd or duration_ms, so those are
// NOT emitted — a per-call token/cost is not measured here. Prompts are hash-only
// by default; a ≤50-char preview is emitted ONLY when fable-observe store_prompts
// was opted in, otherwise the 16-hex task_hash stands in (privacy doctrine).

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ccafDir } from "./config.ts";
import { listObservations } from "./store.ts";
import type { FableObservation } from "./schema.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface CcaFDeps {
  home?: string;
  now?: () => number;
}

export type CcaFDomain =
  | "agentic"
  | "cc_config"
  | "prompt_eng"
  | "mcp"
  | "context"
  | "coding"
  | "reasoning"
  | "docs"
  | "review"
  | "other";

export interface CcaFExportRecord {
  decision_id: string;
  timestamp: string;
  ts_ms: number;
  prompt_classification: string | null; // frozen classify.js tier (T0–T3)
  task_type: string;
  domain: CcaFDomain;
  prompt_ref: string; // ≤50 chars — preview (store_prompts) or 16-hex task_hash
  prompt_is_hash: boolean;
  orchestrator_model: string;
  action: string | null;
  subagent_type: string | null;
  model_chosen: string | null;
  confidence: number | null;
  completed: boolean | null;
  tests_pass: boolean | null;
  pastor_training_value: string;
  session_id: string | null;
}

const USAGE = `mooter cca-f — CCA-F audit data export (reads the Fable observation log)

  mooter cca-f export [--last <N>{d|h|w}] [--format jsonl|json]

  --last 7d     only decisions from the last 7 days (d=days · h=hours · w=weeks)
  --format      jsonl (default · one record per line) or json (a single array)

Privacy: prompt refs are truncated to 50 chars and present only when fable-observe
store_prompts was opted in; otherwise the 16-hex task_hash stands in. No tokens or
cost are emitted — the observation schema records no per-decision tokens.`;

const DOMAIN_BY_TASK_TYPE: Record<string, CcaFDomain> = {
  orchestration: "agentic",
  architecture: "agentic",
  coding: "coding",
  reasoning: "reasoning",
  docs: "docs",
  review: "review",
  other: "other",
};

/** Deterministic, non-LLM keyword refinement — only when prompt text is present. */
function refineDomainFromText(text: string): CcaFDomain | null {
  const t = text.toLowerCase();
  if (/subagent|spawn|delegate|orchestrat/.test(t)) return "agentic";
  if (/skill|\/mcp|\.claude\/|slash command|\bhook\b/.test(t)) return "cc_config";
  if (/structured|json schema|extract|classif/.test(t)) return "prompt_eng";
  if (/\bmcp\b|tool server/.test(t)) return "mcp";
  if (/\bcontext\b|memory|\/compact/.test(t)) return "context";
  return null;
}

/** Domain for a decision: keyword heuristic when prompt is stored, else task_type. */
export function classifyDomain(obs: FableObservation): CcaFDomain {
  if (typeof obs.prompt_text === "string") {
    const refined = refineDomainFromText(obs.prompt_text);
    if (refined) return refined;
  }
  return DOMAIN_BY_TASK_TYPE[obs.task_type] ?? "other";
}

/** Map a FableObservation → a privacy-safe CCA-F record (real fields only). */
export function toCcaFRecord(obs: FableObservation): CcaFExportRecord {
  const hasPrompt = typeof obs.prompt_text === "string";
  const raw = (hasPrompt ? (obs.prompt_text as string) : obs.task_hash).slice(0, 50);
  // Drop a trailing lone high-surrogate so a 50-unit cut never splits an emoji.
  const prompt_ref = /[\uD800-\uDBFF]$/.test(raw) ? raw.slice(0, -1) : raw;
  const fd = obs.fable_decision ?? null;
  const baseline = obs.router_baseline ?? null;
  const outcome = obs.outcome ?? null;
  return {
    decision_id: `${obs.task_hash}-${obs.ts_ms}`,
    timestamp: obs.ts,
    ts_ms: obs.ts_ms,
    prompt_classification: baseline ? baseline.tier : null,
    task_type: obs.task_type,
    domain: classifyDomain(obs),
    prompt_ref,
    prompt_is_hash: !hasPrompt,
    orchestrator_model: obs.orchestrator_model,
    action: fd ? fd.action : null,
    subagent_type: fd ? fd.subagent_type : null,
    model_chosen: fd ? fd.model_chosen : null,
    confidence: baseline ? baseline.confidence : null,
    completed: outcome ? outcome.completed : null,
    tests_pass: outcome ? outcome.tests_pass : null,
    pastor_training_value: obs.pastor_training_value,
    session_id: obs.session_id,
  };
}

const UNIT_MS: Record<string, number> = { h: 3600000, d: 86400000, w: 604800000 };

/** Parse `--last 7d` → a ts_ms lower bound, or undefined when absent/malformed. */
export function parseSince(args: string[], nowMs: number): number | undefined {
  const i = args.indexOf("--last");
  if (i === -1) return undefined;
  const spec = args[i + 1];
  const m = spec ? spec.match(/^(\d+)([hdw])$/) : null;
  if (!m) return undefined;
  return nowMs - Number(m[1]) * UNIT_MS[m[2]];
}

function parseFormat(args: string[]): "jsonl" | "json" {
  const i = args.indexOf("--format");
  const v = i !== -1 ? args[i + 1] : undefined;
  return v === "json" ? "json" : "jsonl";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** UTC YYYY-MM-DD for the export filename. */
function dateStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function runCcaFExport(args: string[], deps: CcaFDeps = {}): CmdResult {
  const home = deps.home ?? homedir();
  const nowMs = deps.now ? deps.now() : Date.now();
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "help") {
    return { exitCode: 0, output: USAGE };
  }
  if (sub !== "export") {
    return { exitCode: 1, output: `unknown subcommand "${sub}"\n\n${USAGE}` };
  }

  const since = parseSince(args, nowMs);
  const format = parseFormat(args);
  const observations = listObservations(home, since !== undefined ? { since } : {});
  const records = observations.map(toCcaFRecord);

  const dir = ccafDir(home);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `export-${dateStamp(nowMs)}.${format === "json" ? "json" : "jsonl"}`);
  const body =
    format === "json"
      ? JSON.stringify(records, null, 2) + "\n"
      : records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  writeFileSync(file, body, "utf8");

  const byDomain: Record<string, number> = {};
  for (const r of records) byDomain[r.domain] = (byDomain[r.domain] ?? 0) + 1;
  const breakdown = Object.entries(byDomain)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `      - ${k}: ${v} (${Math.round((v / records.length) * 100)}%)`)
    .join("\n");
  const windowLabel = since !== undefined ? `since ${new Date(since).toISOString().slice(0, 10)}` : "all time";

  const lines = [
    "🐮 Exporting CCA-F audit data",
    `   ✅ ${records.length} decision(s) (${windowLabel})`,
    `   📁 ${file}`,
  ];
  if (records.length > 0) {
    lines.push("   📊 Domain breakdown:", breakdown);
  } else {
    lines.push("   (no observations yet — enable `mooter fable-observe` and log from a Fable session)");
  }
  lines.push(
    "   ⚠️  Privacy: prompt refs ≤ 50 chars; hash-only unless store_prompts opted in",
    "   📜 Wave 54 ready: feed this file to the CCA-F audit harness",
  );
  return { exitCode: 0, output: lines.join("\n") };
}
