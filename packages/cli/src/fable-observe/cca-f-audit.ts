// packages/cli/src/fable-observe/cca-f-audit.ts — Wave 54 Phase B.1 + B.3.
//
// The CCA-F audit orchestrator. For each synthetic question it:
//   1. asks classify.js for the tier  (classify.js OWNS the tier — refutes the
//      brief's "Pastor classifies tier"; Pastor only routes per-task adapters)
//   2. queries Pastor for a per-task adapter signal (deterministic, dry-run)
//   3. resolves the answer with a tier-appropriate LOCAL model (Ollama)
//   4. self-judges the answer with Sonnet via the `claude` CLI (Day-0 R3)
//   5. logs a decision record to ~/.mooter/cca-f/audit/<session_id>/ (R1)
//   6. writes a heartbeat after each question
//
// All LLM transports + classify + Pastor are injectable so the loop is fully
// testable offline; the CLI path wires the real ones. No metric is fabricated:
// a failed resolve or judge is logged as such and never counts as a pass.

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { ollamaHostFromEnv } from "../ollama-host.ts";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

import { ccafAuditDir } from "./config.ts";
import { generateQuestions, TOTAL_QUESTIONS, type CCAFQuestion, type Tier } from "./cca-f-questions.ts";
import { selfJudge, claudeCliTransport, type Judgment, type JudgeTransport } from "./cca-f-judge.ts";

// ---------------------------------------------------------------------------
// Injectable surfaces
// ---------------------------------------------------------------------------
export interface ClassifyResult {
  tier: string;
  recommended_model?: string;
  confidence?: number;
  task_category?: string;
}
export type ClassifyFn = (prompt: string) => ClassifyResult;

export interface PastorSignal {
  adapter: string | null;
  task_type: string | null;
  matched: boolean;
  confidence: number;
}
export type PastorRouteFn = (prompt: string) => PastorSignal | null;

export interface ResolveResult {
  text: string;
  model: string;
  tokens: number;
  duration_ms: number;
  ok: boolean;
  error?: string;
  downgraded?: boolean;
}
export type ResolveFn = (tier: string, prompt: string) => Promise<ResolveResult>;

export interface Heartbeat {
  session_id: string;
  cca_f_progress: string; // "12/60"
  current_domain: string;
  updated_at: string;
}

export interface AuditDeps {
  home?: string;
  now?: () => number;
  classify?: ClassifyFn;
  pastorRoute?: PastorRouteFn;
  resolve?: ResolveFn;
  judge?: JudgeTransport;
  classifyIntegrity?: () => ClassifyIntegrity;
  heartbeat?: (h: Heartbeat) => void;
  log?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Logged record + report
// ---------------------------------------------------------------------------
export interface DecisionRecord {
  question_id: string;
  domain: string;
  difficulty: string;
  tier_expected: Tier;
  tier_chosen: string; // classify.js — the tier owner
  tier_match: boolean;
  classify_confidence: number | null;
  pastor_adapter: string | null;
  pastor_task_type: string | null;
  pastor_matched: boolean;
  pastor_confidence: number | null;
  resolve_model: string;
  resolve_downgraded: boolean;
  response_summary: string; // ≤ 600 chars
  response_tokens: number;
  resolve_ms: number;
  judgment_score: number; // 0-100
  judgment_notes: string;
  judge_failure: boolean;
  pass: boolean;
  cost_usd: number; // 0 for local resolve + Claude Max judge (quota, not USD)
  duration_ms: number;
  error: string | null;
}

export interface DomainStat {
  total: number;
  passed: number;
  pass_rate: number;
  tier_matches: number;
  routing_accuracy: number;
  avg_score: number;
}

export interface AuditReport {
  session_id: string;
  seed: number;
  algorithm_version: string | null;
  classify_sha: string | null; // measured sha256 of the frozen classify.js (null if not found)
  classify_intact: boolean | null; // measured == frozen (null if not found)
  classify_sha_note: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
    routing_accuracy: number;
    total_cost_usd: number;
    judge_failures: number;
  };
  by_domain: Record<string, DomainStat>;
  failure_patterns: string[];
  learning: { high_confidence_count: number };
  disclaimer: string;
}

export const DISCLAIMER =
  "Internal audit using public CCA-F rubric. NOT the official Anthropic exam. " +
  "Single-cohort (Paulo's machine, N=1). LLM self-judge (Sonnet) — bias present. " +
  "Methodology: packages/mooter-bench/README.md.";

// The CI-frozen sha256 of tools/router/classify.js (the tier owner). The audit
// MEASURES the live file against this constant — it never asserts intactness.
export const FROZEN_CLASSIFY_SHA = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f";

// ---------------------------------------------------------------------------
// Default transports (used by the CLI path; tests inject fakes)
// ---------------------------------------------------------------------------

/** Walk up from cwd to find the frozen classify.js. Returns null if not found. */
function findClassifyPath(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "tools", "router", "classify.js");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export interface ClassifyIntegrity {
  sha: string | null;
  intact: boolean | null;
}

/** MEASURE the live classify.js sha256 vs the frozen constant (no assertion). */
export function measureClassifyIntegrity(): ClassifyIntegrity {
  const path = findClassifyPath();
  if (!path) return { sha: null, intact: null };
  try {
    const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
    return { sha, intact: sha === FROZEN_CLASSIFY_SHA };
  } catch {
    return { sha: null, intact: null };
  }
}

/** Walk up from cwd to find the frozen classify.js, then call it. */
function defaultClassify(): ClassifyFn {
  const req = createRequire(import.meta.url);
  const resolved = findClassifyPath();
  if (!resolved) throw new Error("classify.js not found (run from the repo root)");
  const mod = req(resolved) as { classify: (p: string) => ClassifyResult };
  return (prompt: string) => mod.classify(prompt);
}

/** Pastor per-task adapter signal (deterministic, dry-run). Best-effort. */
async function defaultPastorRoute(prompt: string): Promise<PastorSignal | null> {
  try {
    const mod = (await import("../../../synthesis/src/index.ts")) as {
      routeRequest: (o: { prompt: string; dryRun: boolean }) => {
        adapter: string;
        task_type: string;
        matched: boolean;
        confidence: number;
      };
    };
    const d = mod.routeRequest({ prompt, dryRun: true });
    return { adapter: d.adapter, task_type: d.task_type, matched: d.matched, confidence: d.confidence };
  } catch {
    return null; // Pastor unavailable → audit still runs (signal omitted, honest)
  }
}

// Tier → local Ollama model. Local-first: resolve stays free; the tier label
// (from classify.js) is what the routing-accuracy metric measures.
const TIER_MODEL: Record<string, string> = {
  T0: "qwen2.5:3b",
  T1: "qwen3:30b",
  T2: "qwen3:30b",
  T3: "qwen2.5-coder:32b",
};
const OOM_FALLBACK = "qwen2.5:7b";

function ollamaHost(): string {
  return ollamaHostFromEnv("http://localhost:11434");
}

async function ollamaGenerate(model: string, prompt: string, timeoutMs = 180_000): Promise<ResolveResult> {
  const t0 = performance.now();
  const ms = (): number => Math.max(0, Math.round(performance.now() - t0));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ollamaHost()}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0 } }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = (await res.json()) as { response?: string; eval_count?: number };
    return { text: data.response ?? "", model, tokens: data.eval_count ?? 0, duration_ms: ms(), ok: true };
  } catch (e) {
    clearTimeout(timer);
    return { text: "", model, tokens: 0, duration_ms: ms(), ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Default resolve: local Ollama by tier, with one OOM/transport downgrade (B.3). */
const defaultResolve: ResolveFn = async (tier, prompt) => {
  const primary = TIER_MODEL[tier] ?? TIER_MODEL.T1;
  const first = await ollamaGenerate(primary, prompt);
  if (first.ok) return first;
  // B.3 — VRAM OOM / transport failure → downgrade to the small model, retry once.
  const second = await ollamaGenerate(OOM_FALLBACK, prompt);
  return { ...second, downgraded: true, error: second.ok ? undefined : second.error };
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function sessionId(seed: number, ms: number): string {
  const d = new Date(ms);
  const stamp = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
  return `wave54-${seed}-${stamp}`;
}

function summarise(text: string, n = 600): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

export interface RunAuditOpts {
  seed: number;
  count?: number;
}

/**
 * Run the full audit loop. Writes decisions.jsonl + heartbeat.json + report.json
 * + report.md under ~/.mooter/cca-f/audit/<session_id>/ and returns the report.
 */
export async function runAudit(opts: RunAuditOpts, deps: AuditDeps = {}): Promise<AuditReport> {
  const home = deps.home ?? homedir();
  const nowFn = deps.now ?? Date.now;
  const startedMs = nowFn();
  const sid = sessionId(opts.seed, startedMs);
  const dir = ccafAuditDir(home, sid);
  mkdirSync(dir, { recursive: true });

  const classify = deps.classify ?? defaultClassify();
  const pastorRoute: PastorRouteFn = deps.pastorRoute ?? ((p) => null); // sync default; async wrapper below
  const usePastorAsync = !deps.pastorRoute; // use the async default unless overridden
  const resolve = deps.resolve ?? defaultResolve;
  const judge = deps.judge ?? claudeCliTransport;
  const log = deps.log ?? (() => {});

  const decisionsPath = join(dir, "decisions.jsonl");
  const questions = generateQuestions(opts.seed, opts.count ?? TOTAL_QUESTIONS);
  const records: DecisionRecord[] = [];

  let algorithmVersion: string | null = null;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qStart = nowFn();

    // 1. classify.js owns the tier.
    let cls: ClassifyResult;
    try {
      cls = classify(q.prompt);
    } catch (e) {
      cls = { tier: "T?", confidence: undefined };
    }
    const tierChosen = cls.tier;
    if (algorithmVersion === null && (cls as Record<string, unknown>).algorithm_version) {
      algorithmVersion = String((cls as Record<string, unknown>).algorithm_version);
    }

    // 2. Pastor per-task adapter signal (secondary; never decides tier).
    let pastor: PastorSignal | null = null;
    try {
      pastor = usePastorAsync ? await defaultPastorRoute(q.prompt) : pastorRoute(q.prompt);
    } catch {
      pastor = null;
    }

    // 3. Resolve with a tier-appropriate local model.
    let resolved: ResolveResult;
    try {
      resolved = await resolve(tierChosen, q.prompt);
    } catch (e) {
      resolved = { text: "", model: "unknown", tokens: 0, duration_ms: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // 4. Self-judge (skip a judge call when resolve produced nothing — that is a
    //    RESOLVE failure, recorded via `error`, NOT a judge_failure).
    let judgment: Judgment;
    if (!resolved.ok || !resolved.text.trim()) {
      judgment = { scores: { factual_accuracy: 0, completeness: 0, code_quality: 0, reasoning: 0 }, total: 0, notes: `resolve_failure: ${resolved.error ?? "empty"}`, pass: false, parse_ok: false, judge_failure: false, raw: "" };
    } else {
      judgment = await selfJudge(q, resolved.text, judge);
    }

    const rec: DecisionRecord = {
      question_id: q.id,
      domain: q.domain,
      difficulty: q.difficulty,
      tier_expected: q.expected_tier,
      tier_chosen: tierChosen,
      tier_match: tierChosen === q.expected_tier,
      classify_confidence: typeof cls.confidence === "number" ? cls.confidence : null,
      pastor_adapter: pastor ? pastor.adapter : null,
      pastor_task_type: pastor ? pastor.task_type : null,
      pastor_matched: pastor ? pastor.matched : false,
      pastor_confidence: pastor ? pastor.confidence : null,
      resolve_model: resolved.model,
      resolve_downgraded: resolved.downgraded === true,
      response_summary: summarise(resolved.text),
      response_tokens: resolved.tokens,
      resolve_ms: resolved.duration_ms,
      judgment_score: judgment.total,
      judgment_notes: judgment.notes,
      judge_failure: judgment.judge_failure,
      pass: judgment.pass && !judgment.judge_failure,
      cost_usd: 0, // local resolve + Claude Max judge → $0 USD (Max quota, not USD)
      duration_ms: Math.max(0, nowFn() - qStart),
      error: resolved.ok ? null : resolved.error ?? null,
    };
    records.push(rec);
    appendFileSync(decisionsPath, JSON.stringify(rec) + "\n", "utf8");

    const hb: Heartbeat = {
      session_id: sid,
      cca_f_progress: `${i + 1}/${questions.length}`,
      current_domain: q.domain,
      updated_at: new Date(nowFn()).toISOString(),
    };
    writeFileSync(join(dir, "heartbeat.json"), JSON.stringify(hb, null, 2) + "\n", "utf8");
    if (deps.heartbeat) deps.heartbeat(hb);
    log(`${hb.cca_f_progress} ${q.id} [${q.domain}] tier=${tierChosen} score=${judgment.total} ${rec.pass ? "PASS" : "fail"}`);
  }

  const finishedMs = nowFn();
  const integrity = (deps.classifyIntegrity ?? measureClassifyIntegrity)();
  const report = buildReport(records, {
    session_id: sid,
    seed: opts.seed,
    algorithm_version: algorithmVersion,
    integrity,
    started_at: new Date(startedMs).toISOString(),
    finished_at: new Date(finishedMs).toISOString(),
    duration_ms: Math.max(0, finishedMs - startedMs),
  });
  writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  return report;
}

export interface ReportMeta {
  session_id: string;
  seed: number;
  algorithm_version: string | null;
  integrity?: ClassifyIntegrity;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

/** Pure: aggregate decision records → an AuditReport (no I/O). */
export function buildReport(records: DecisionRecord[], meta: ReportMeta): AuditReport {
  const total = records.length;
  const passed = records.filter((r) => r.pass).length;
  const tierMatches = records.filter((r) => r.tier_match).length;
  const judgeFailures = records.filter((r) => r.judge_failure).length;
  const totalCost = records.reduce((s, r) => s + (r.cost_usd || 0), 0);

  const byDomain: Record<string, DomainStat> = {};
  for (const r of records) {
    const d = (byDomain[r.domain] ??= { total: 0, passed: 0, pass_rate: 0, tier_matches: 0, routing_accuracy: 0, avg_score: 0 });
    d.total += 1;
    if (r.pass) d.passed += 1;
    if (r.tier_match) d.tier_matches += 1;
    d.avg_score += r.judgment_score;
  }
  for (const d of Object.values(byDomain)) {
    d.pass_rate = d.total ? d.passed / d.total : 0;
    d.routing_accuracy = d.total ? d.tier_matches / d.total : 0;
    d.avg_score = d.total ? Math.round((d.avg_score / d.total) * 10) / 10 : 0;
  }

  // Failure patterns: domains with sub-70% pass, + judge/resolve failures.
  const patterns: string[] = [];
  for (const [dom, st] of Object.entries(byDomain)) {
    if (st.total >= 3 && st.pass_rate < 0.7) {
      patterns.push(`${dom}: ${st.passed}/${st.total} pass (${Math.round(st.pass_rate * 100)}%) — below 70% floor`);
    }
  }
  const resolveFails = records.filter((r) => r.error && !r.judge_failure).length;
  if (judgeFailures > 0) patterns.push(`${judgeFailures} judge failure(s) (transport or malformed JSON) — scored 0, excluded from pass`);
  if (resolveFails > 0) patterns.push(`${resolveFails} resolve failure(s) (Ollama transport/OOM)`);
  const downgrades = records.filter((r) => r.resolve_downgraded).length;
  if (downgrades > 0) patterns.push(`${downgrades} resolve downgrade(s) to ${OOM_FALLBACK} (VRAM/transport)`);

  const integrity = meta.integrity ?? { sha: null, intact: null };
  const shaNote =
    integrity.intact === true
      ? `classify.js sha ${integrity.sha!.slice(0, 16)}… MEASURED INTACT vs frozen (tier owner; never modified by the audit)`
      : integrity.intact === false
        ? `⚠️ classify.js sha ${(integrity.sha ?? "?").slice(0, 16)}… DOES NOT MATCH the frozen sha — classifier may have drifted`
        : "classify.js sha not measured (file not found from cwd)";

  return {
    session_id: meta.session_id,
    seed: meta.seed,
    algorithm_version: meta.algorithm_version,
    classify_sha: integrity.sha,
    classify_intact: integrity.intact,
    classify_sha_note: shaNote,
    started_at: meta.started_at,
    finished_at: meta.finished_at,
    duration_ms: meta.duration_ms,
    summary: {
      total,
      passed,
      failed: total - passed,
      pass_rate: total ? Math.round((passed / total) * 1000) / 1000 : 0,
      routing_accuracy: total ? Math.round((tierMatches / total) * 1000) / 1000 : 0,
      total_cost_usd: Math.round(totalCost * 100) / 100,
      judge_failures: judgeFailures,
    },
    by_domain: byDomain,
    failure_patterns: patterns,
    learning: { high_confidence_count: 0 }, // filled by Phase C
    disclaimer: DISCLAIMER,
  };
}
