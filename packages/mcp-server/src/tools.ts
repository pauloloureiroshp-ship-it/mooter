// Mooter MCP tool registry (Wave 30 Phase K).
//
// Each tool is a self-contained handler reusing the existing Mooter packages
// (synthesis/cli) — the MCP server is a thin protocol adapter, not new logic.
// Handlers return a plain string (rendered as MCP text content).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { summarize, EXPECTED_CLASSIFY_SHA } from "../../synthesis/src/state/central-state.ts";
import { mooterPath, appendJsonl, readJsonSafe } from "../../synthesis/src/config.ts";
import { buildEntry, dogfoodPath, countToday } from "../../cli/src/commands/dogfood.ts";
import { loadCatalog, recommend, loadProfile, routeRequest, listTaskAdapters } from "../../synthesis/src/index.ts";
import { sync as obsidianSync, primaryVault as obsidianPrimaryVault } from "../../../packs/obsidian-vault-sync/pack.ts";
// Wave 32 — new tool deps (pure TS, no native deps → safe in the stdio bundle).
import { getEffort, setEffort, isEffortMode, MODE_NAMES } from "../../effort/src/index.ts";
import { readControl, setRunControl, setAgentControl } from "../../transparency/src/index.ts";
import { buildExport } from "../../data-rights/src/index.ts";
// Wave 33.5 Block A.4 — sessions orchestrator (pure TS, local-first).
import {
  buildState,
  forecastQuota,
  aggregateCrossSession,
} from "../../sessions-orchestrator/src/index.ts";

export interface ToolContext {
  fetchImpl?: typeof fetch;
  notionToken?: string;
  notionHqId?: string;
  /** When true, notion_write builds the request but does not send it. */
  dryRun?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

function findRepoFile(rel: string): string | null {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, rel);
      if (existsSync(cand)) return cand;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function classifyShaInfo(): { sha: string | null; ok: boolean } {
  const p = findRepoFile("tools/router/classify.js");
  if (!p) return { sha: null, ok: false };
  try {
    const sha = createHash("sha256").update(readFileSync(p)).digest("hex");
    return { sha, ok: sha === EXPECTED_CLASSIFY_SHA };
  } catch {
    return { sha: null, ok: false };
  }
}

// ─── tools ──────────────────────────────────────────────────────────────────

const statusTool: McpTool = {
  name: "mooter_status",
  description: "Current Mooter wave/phase progress and classify.js doctrine-gate sha status.",
  inputSchema: { type: "object", properties: {} },
  async handler() {
    const sum = summarize();
    const { sha, ok } = classifyShaInfo();
    return JSON.stringify(
      {
        activeWave: sum.number,
        branch: sum.branch,
        phase: sum.phase,
        done: sum.done,
        total: sum.total,
        historyCount: sum.historyCount,
        classifySha: sha,
        classifyShaOk: ok,
      },
      null,
      2,
    );
  },
};

const dogfoodTool: McpTool = {
  name: "mooter_dogfood_log",
  description: "Log a friction observation to ~/.mooter/dogfood.jsonl (local-first).",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "the friction description (use #tags)" },
      severity: { type: "string", enum: ["low", "med", "high"], description: "default low" },
    },
    required: ["text"],
  },
  async handler(args) {
    const text = String(args.text ?? "").trim();
    if (!text) return "error: text is required";
    const entry = buildEntry(text, { severity: args.severity ? String(args.severity) : undefined });
    appendJsonl(dogfoodPath(), entry);
    return `logged [${entry.severity}] · ${countToday()} today`;
  },
};

const workflowTool: McpTool = {
  name: "mooter_workflow_create",
  description: "Queue a local-first workflow request from a natural-language prompt (records intent; the engine runs it).",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string" } },
    required: ["prompt"],
  },
  async handler(args) {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) return "error: prompt is required";
    const id = `wf_${createHash("sha1").update(prompt + Date.now()).digest("hex").slice(0, 10)}`;
    const record = { id, prompt, status: "queued", source: "mcp" };
    appendJsonl(mooterPath("workflows", "requests.jsonl"), record);
    return JSON.stringify({ id, status: "queued", run: `mooter workflow run ${id}` }, null, 2);
  },
};

const ecosystemTool: McpTool = {
  name: "mooter_ecosystem_recommend",
  description: "Top ecosystem (L15) recommendations for this machine's detected setup.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "default 5" } },
  },
  async handler(args) {
    const limit = Number(args.limit) > 0 ? Number(args.limit) : 5;
    const profile = loadProfile();
    if (!profile) return "no setup profile yet — run `mooter setup detect` first";
    const catalog = loadCatalog();
    const recs = recommend(profile, catalog.items, { limit });
    return JSON.stringify(
      recs.map((r) => ({
        id: r.item.id,
        name: r.item.name,
        score: Math.round(r.score * 100) / 100,
        reason: r.reason,
      })),
      null,
      2,
    );
  },
};

const pastorTool: McpTool = {
  name: "mooter_pastor_hint",
  description: "The latest Pastor routing hint for this machine (if any).",
  inputSchema: { type: "object", properties: {} },
  async handler() {
    const hint = readJsonSafe<{ hint?: string; tier?: string; updatedAt?: string } | null>(
      mooterPath("pastor-hint.json"),
      null,
    );
    if (!hint) return "no Pastor hint available yet";
    return JSON.stringify(hint, null, 2);
  },
};

export interface NotionWriteArgs {
  title?: string;
  body?: string;
  parentId?: string;
}

const notionTool: McpTool = {
  name: "mooter_notion_write",
  description: "Create a Wave-log sub-page in the Mooter Notion HQ (needs NOTION_TOKEN).",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string", description: "markdown-ish body (one paragraph)" },
      parentId: { type: "string", description: "override HQ parent page id" },
    },
    required: ["title"],
  },
  async handler(args, ctx) {
    const title = String(args.title ?? "").trim();
    if (!title) return "error: title is required";
    const body = String(args.body ?? "");
    const parent = String(args.parentId ?? ctx.notionHqId ?? "33d6f6e4-2bc4-816b-977a-fe84bbe912c9");
    const token = ctx.notionToken ?? process.env.NOTION_TOKEN;

    const payload = {
      parent: { page_id: parent },
      properties: { title: [{ type: "text", text: { content: title } }] },
      children: body
        ? [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: body.slice(0, 1900) } }] },
            },
          ]
        : [],
    };

    if (ctx.dryRun || !token) {
      return JSON.stringify({ dryRun: true, reason: token ? "dryRun" : "no NOTION_TOKEN", payload }, null, 2);
    }
    const doFetch = ctx.fetchImpl ?? fetch;
    const res = await doFetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { url?: string; id?: string; message?: string };
    if (!res.ok) return JSON.stringify({ ok: false, status: res.status, message: json.message }, null, 2);
    return JSON.stringify({ ok: true, url: json.url, id: json.id }, null, 2);
  },
};

// ── Wave 31 — Pastor v2 adapter suggestion + Obsidian sync ───────────────────

const pastorAdapterSuggestTool: McpTool = {
  name: "mooter_pastor_adapter_suggest",
  description:
    "Deterministically suggest which per-task LoRA adapter (LORAUTER) fits a prompt. No LLM, no side effects (dry-run). The classifier tier is never changed.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "the task prompt to route" },
      tier: { type: "string", description: "optional classifier tier (T0..T3); passed through unchanged" },
    },
    required: ["prompt"],
  },
  async handler(args) {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) return "error: prompt is required";
    const tier = args.tier ? String(args.tier) : undefined;
    const d = routeRequest({ prompt, classify: tier ? { tier } : undefined, dryRun: true });
    return JSON.stringify(
      {
        adapter: d.adapter,
        task_type: d.task_type,
        matched: d.matched,
        confidence: Math.round(d.confidence * 1000) / 1000,
        threshold: d.threshold,
        tier: d.tier,
        detected_lang: d.detected_lang,
        top_scores: d.scores.slice(0, 3).map((s) => ({ task_type: s.task_type, confidence: Math.round(s.confidence * 1000) / 1000 })),
        reason: d.reason,
      },
      null,
      2,
    );
  },
};

const obsidianSyncTool: McpTool = {
  name: "mooter_obsidian_sync",
  description:
    "Sync the obsidian-vault-sync pack: write Pastor learnings to <vault>/Mooter/ and import <vault>/Mooter/preferences.md. Local-only, features-only.",
  inputSchema: {
    type: "object",
    properties: {
      dry_run: { type: "boolean", description: "when true, only report the detected vault without writing" },
    },
  },
  async handler(args) {
    const vault = obsidianPrimaryVault();
    if (!vault) return "no Obsidian vault detected — set MOOTER_VAULT or open a vault in Obsidian first";
    if (args.dry_run === true) {
      return JSON.stringify({ dryRun: true, vault: vault.path, johnny_decimal: vault.johnny_decimal }, null, 2);
    }
    const date = new Date().toISOString().slice(0, 10);
    const res = obsidianSync({ date, vault });
    return JSON.stringify(
      {
        ok: res.ok,
        vault: res.vault,
        wrote: res.write?.path,
        imported: res.read?.written_to ?? null,
        read_reason: res.read?.ok ? undefined : res.read?.reason,
      },
      null,
      2,
    );
  },
};

// ─── Wave 32 tools ────────────────────────────────────────────────────────────

const effortSetTool: McpTool = {
  name: "mooter_effort_set",
  description: "Set the session-wide effort mode (low/default/high/ultramoo) or read the current one. ultramoo flips 8 frugality sub-systems; classify.js tier floors always win.",
  inputSchema: { type: "object", properties: { mode: { type: "string", enum: [...MODE_NAMES] } } },
  async handler(args) {
    const mode = typeof args.mode === "string" ? args.mode : "";
    if (!mode) return JSON.stringify(getEffort(), null, 2);
    if (!isEffortMode(mode)) return JSON.stringify({ error: `unknown mode '${mode}'`, valid: MODE_NAMES });
    return JSON.stringify(setEffort(mode), null, 2);
  },
};

const ultramooToggleTool: McpTool = {
  name: "mooter_ultramoo_toggle",
  description: "Toggle Ultramoo mode: ON sets effort=ultramoo (max frugality), OFF reverts to default. Returns the resulting config.",
  inputSchema: { type: "object", properties: { on: { type: "boolean" } } },
  async handler(args) {
    const target = args.on === undefined ? getEffort().mode !== "ultramoo" : !!args.on;
    return JSON.stringify(setEffort(target ? "ultramoo" : "default"), null, 2);
  },
};

const workflowWatchTool: McpTool = {
  name: "mooter_workflow_watch",
  description: "Read or set a workflow's control intent (pause/resume/kill, or kill one agent). The cooperating runner enforces it on its next poll. Returns the current control state.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      control: { type: "string", enum: ["running", "paused", "kill"] },
      kill_agent: { type: "string" },
    },
    required: ["run_id"],
  },
  async handler(args) {
    const runId = String(args.run_id || "");
    if (!runId) return JSON.stringify({ error: "run_id required" });
    if (typeof args.kill_agent === "string" && args.kill_agent) {
      return JSON.stringify(setAgentControl(runId, args.kill_agent, "kill"), null, 2);
    }
    if (typeof args.control === "string") {
      return JSON.stringify(setRunControl(runId, args.control as "running" | "paused" | "kill"), null, 2);
    }
    return JSON.stringify(readControl(runId), null, 2);
  },
};

const dataExportTool: McpTool = {
  name: "mooter_data_export",
  description: "GDPR: produce a portable JSON export of this machine's local Mooter data, with credentials/secrets redacted. Refuses (returns an error) if the privacy audit detects a leak.",
  inputSchema: { type: "object", properties: {} },
  async handler() {
    let knownSecrets: string[] = [];
    try {
      knownSecrets = [readFileSync(mooterPath(".telemetry_secret"), "utf8").trim()].filter(Boolean);
    } catch { /* no secret */ }
    const r = buildExport({ knownSecrets });
    if (!r.clean) return JSON.stringify({ error: "export blocked by privacy audit", violations: r.audit });
    return r.json;
  },
};

// ─── Wave 33.5 Block A.4 — sessions orchestrator tools ───────────────────────

const sessionsListTool: McpTool = {
  name: "mooter_sessions_list",
  description:
    "List Claude Code sessions across ALL local projects: age, prompts, tier mix, ~saved (estimated), branch/worktree, active workflow. Read-only, local-first.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "max sessions (default 12)" } },
  },
  async handler(args) {
    const limit = Number.isFinite(args.limit as number) ? Math.max(1, Number(args.limit)) : 12;
    const state = buildState();
    return JSON.stringify(
      {
        generatedAtMs: state.generatedAtMs,
        count: state.sessions.length,
        sessions: state.sessions.slice(0, limit).map((s) => ({
          sessionId: s.sessionId,
          live: s.live,
          ageMs: s.ageMs,
          prompts: s.prompts,
          tiers: s.tiers,
          estSavedUsd: Math.round(s.estSavedUsd * 100) / 100,
          branch: s.branch,
          workflow: s.workflow,
        })),
      },
      null,
      2,
    );
  },
};

const sessionsQuotaTool: McpTool = {
  name: "mooter_sessions_quota_forecast",
  description:
    "Estimate the trailing 5h cloud-call usage from the local decisions.log (rate projection, NOT a server quota). Returns cloud calls in window, observed rate, projection, and window reset.",
  inputSchema: {
    type: "object",
    properties: { windowHours: { type: "number", description: "window size (default 5)" } },
  },
  async handler(args) {
    const windowHours = Number.isFinite(args.windowHours as number) ? Number(args.windowHours) : 5;
    return JSON.stringify(forecastQuota({ windowHours }), null, 2);
  },
};

const sessionsHandoffTool: McpTool = {
  name: "mooter_sessions_handoff",
  description:
    "Produce a handoff summary for a session id (prefix ok): branch, prompts, tier mix, ~saved, transcript path — so another session/agent can pick up its context. No prompt text leaves the machine.",
  inputSchema: {
    type: "object",
    properties: { sessionId: { type: "string", description: "session id or unique prefix" } },
    required: ["sessionId"],
  },
  async handler(args) {
    const id = String(args.sessionId ?? "").trim();
    if (!id) return "error: sessionId is required";
    const state = buildState();
    const exact = state.sessions.find((s) => s.sessionId === id);
    const pref = exact ? [exact] : state.sessions.filter((s) => s.sessionId.startsWith(id));
    if (pref.length !== 1) return `error: ${pref.length === 0 ? "not found" : "ambiguous prefix"}: ${id}`;
    const s = pref[0];
    return JSON.stringify(
      {
        sessionId: s.sessionId,
        branch: s.branch,
        worktreePath: s.worktreePath,
        prompts: s.prompts,
        tiers: s.tiers,
        estSavedUsd: Math.round(s.estSavedUsd * 100) / 100,
        workflow: s.workflow,
        transcriptPath: s.transcriptPath,
      },
      null,
      2,
    );
  },
};

const sessionsPastorAggregateTool: McpTool = {
  name: "mooter_sessions_pastor_aggregate",
  description:
    "Aggregate classified decisions across ALL local sessions into a per-task-category modal-tier signal (ADVISORY — never overrides classify.js or a tier floor). Returns category histograms with cross-session support.",
  inputSchema: {
    type: "object",
    properties: { minSupport: { type: "number", description: "drop categories below N decisions (default 3)" } },
  },
  async handler(args) {
    const minSupport = Number.isFinite(args.minSupport as number) ? Number(args.minSupport) : 3;
    return JSON.stringify(aggregateCrossSession({ minSupport }), null, 2);
  },
};

// ─── Wave 50-51 Phase 1.C — router/savings/tier/session tools ────────────────

/** Same decisions.log resolution as packages/cli digest/trail (routerDir()). */
function decisionsLogPath(): string {
  const claudeDir =
    process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router", "decisions.log");
}

interface ClassifiedEvent {
  event?: string;
  source?: string;
  session_id?: string;
  ts_ms?: number;
  tier?: string;
  recommended_model?: string;
}

/** Parse decisions.log "classified" events (skips mooter-tester, same as digest). */
function readClassifiedEvents(): ClassifiedEvent[] {
  let lines: string[];
  try {
    lines = readFileSync(decisionsLogPath(), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const out: ClassifiedEvent[] = [];
  for (const line of lines) {
    let e: ClassifiedEvent;
    try {
      e = JSON.parse(line) as ClassifiedEvent;
    } catch {
      continue;
    }
    if (!e || e.event !== "classified" || e.source === "mooter-tester") continue;
    out.push(e);
  }
  return out;
}

function countByTier(events: ClassifiedEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const t = typeof e.tier === "string" && /^T\d$/.test(e.tier) ? e.tier : null;
    if (t) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

interface TrackerMetricsLike {
  saved?: number;
  saved_pct?: number;
  alltime_cost_usd?: number;
  saved_7d?: number;
  saved_7d_pct?: number;
  cost_7d?: number;
  prompts_7d?: number;
}

/** Fetch the local savings-tracker /metrics (same source as `mooter digest`).
 *  Best-effort: null when the tracker is offline — figures are never invented. */
async function fetchTrackerMetrics(ctx: ToolContext): Promise<TrackerMetricsLike | null> {
  const doFetch = ctx.fetchImpl ?? fetch;
  try {
    const res = await doFetch("http://127.0.0.1:7821/metrics", { signal: AbortSignal.timeout(400) });
    if (!res.ok) return null;
    return (await res.json()) as TrackerMetricsLike;
  } catch {
    return null;
  }
}

const routeQueryTool: McpTool = {
  name: "mooter_route_query",
  description:
    "Run the REAL frozen classifier (tools/router/classify.js, spawned read-only) on a prompt. Returns tier, recommended model/backend, confidence, and a one-line rationale. Never modifies the classifier.",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string", description: "the prompt to classify" } },
    required: ["prompt"],
  },
  async handler(args) {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) return JSON.stringify({ error: "invalid_input", detail: "prompt is required" });
    const classifyPath = findRepoFile("tools/router/classify.js");
    if (!classifyPath) {
      return JSON.stringify({
        error: "classifier_unavailable",
        detail: "tools/router/classify.js not found from this working directory",
      });
    }
    let raw: string;
    try {
      raw = execFileSync(process.execPath, [classifyPath, prompt], {
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
    } catch (e) {
      return JSON.stringify({
        error: "classifier_spawn_failed",
        detail: String((e as Error).message || e).slice(0, 300),
      });
    }
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: "classifier_output_unparseable", detail: raw.slice(0, 300) });
    }
    return JSON.stringify(
      {
        tier: d.tier ?? null,
        recommended_model: d.recommended_model ?? null,
        recommended_backend: d.recommended_backend ?? null,
        suggested_subagent: d.suggested_subagent ?? null,
        confidence: typeof d.confidence === "number" ? d.confidence : null,
        rationale: `${d.tier} → ${d.recommended_model} via ${d.recommended_backend} (confidence ${d.confidence}); ${d.reasoning || "no reasoning emitted"}`,
      },
      null,
      2,
    );
  },
};

const getSavingsTool: McpTool = {
  name: "mooter_get_savings",
  description:
    "Honest savings figures from the SAME sources as `mooter digest`: decision counts from decisions.log + dollar totals from the local savings-tracker /metrics. Returns an explicit empty-state when there is no data — numbers are never invented.",
  inputSchema: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["today", "all"], description: "default all" },
    },
  },
  async handler(args, ctx) {
    const period = args.period === "today" ? "today" : "all";
    let events = readClassifiedEvents();
    if (period === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      events = events.filter((e) => typeof e.ts_ms === "number" && e.ts_ms >= start.getTime());
    }
    const metrics = await fetchTrackerMetrics(ctx);
    if (events.length === 0 && !metrics) {
      return JSON.stringify(
        {
          period,
          prompts: 0,
          tiers: {},
          tracker: null,
          note: "no data yet — no classified decisions in decisions.log and the savings-tracker is offline",
        },
        null,
        2,
      );
    }
    return JSON.stringify(
      {
        period,
        prompts: events.length,
        tiers: countByTier(events),
        tracker: metrics
          ? {
              savedUsd: typeof metrics.saved === "number" ? metrics.saved : null,
              savedPct: typeof metrics.saved_pct === "number" ? Math.round(metrics.saved_pct) : null,
              spentUsd: typeof metrics.alltime_cost_usd === "number" ? metrics.alltime_cost_usd : null,
              saved7dUsd: typeof metrics.saved_7d === "number" ? metrics.saved_7d : null,
            }
          : null,
        note: metrics
          ? "decision counts ← decisions.log · dollar figures ← savings-tracker aggregates (tracker has no per-day dollar split; 'today' filters counts only)"
          : "savings-tracker offline — dollar totals unavailable (counts above are real, from decisions.log)",
      },
      null,
      2,
    );
  },
};

/** 2026-06 list pricing, USD per million tokens (input / output). */
const TIER_INFO: Record<
  string,
  | {
      exists: true;
      model: string;
      pricingPerMTok: { input: number; output: number };
      description: string;
      typicalTasks: string[];
      optInOnly?: boolean;
    }
  | { exists: false; note: string }
> = {
  T0: {
    exists: true,
    model: "Ollama local (qwen2.5 family)",
    pricingPerMTok: { input: 0, output: 0 },
    description: "Local tier — free, runs on your own hardware via Ollama.",
    typicalTasks: ["file summaries", "format transforms", "data extraction", "translations"],
  },
  T1: {
    exists: true,
    model: "Haiku 4.5",
    pricingPerMTok: { input: 1, output: 5 },
    description: "Cheap cloud triage tier.",
    typicalTasks: ["commit messages", "docstrings", "regex", "error explanations", "trivial tests"],
  },
  T2: {
    exists: true,
    model: "Sonnet 4.6",
    pricingPerMTok: { input: 3, output: 15 },
    description: "Mid reasoning tier — the rarest in real usage (~7-8%).",
    typicalTasks: ["bug investigation", "root cause", "technical plans", "comparing approaches"],
  },
  T3: {
    exists: true,
    model: "Opus 4.6",
    pricingPerMTok: { input: 5, output: 25 },
    description: "Default heavy tier (Opus 4.8 shares T3 with 4.6).",
    typicalTasks: ["architecture", "multi-file refactors", "tradeoff decisions", "prod/CI/migrations", "pre-merge review"],
  },
  T4: {
    exists: false,
    note: "There is no T4 in Mooter — Opus 4.8 shares T3 with Opus 4.6. Valid tiers: T0, T1, T2, T3, and opt-in T5.",
  },
  T5: {
    exists: true,
    model: "Fable 5",
    pricingPerMTok: { input: 10, output: 50 },
    description:
      "Frontier tier — OPT-IN ONLY (explicit '@fable' override). The classifier NEVER auto-routes to T5 because it is the most expensive tier; you reach it deliberately.",
    typicalTasks: ["frontier reasoning on explicit request", "vision tasks ('@fable read this chart')"],
    optInOnly: true,
  },
};

const explainTierTool: McpTool = {
  name: "mooter_explain_tier",
  description:
    "Explain a Mooter routing tier (T0–T5): description, typical tasks, model, and 2026-06 list pricing per million tokens. T5 (Fable 5) is opt-in only and never auto-routed; T4 does not exist.",
  inputSchema: {
    type: "object",
    properties: { tier: { type: "string", enum: ["T0", "T1", "T2", "T3", "T4", "T5"] } },
    required: ["tier"],
  },
  async handler(args) {
    const tier = String(args.tier ?? "").toUpperCase();
    const info = TIER_INFO[tier];
    if (!info) {
      return JSON.stringify({ error: "unknown_tier", detail: `'${args.tier}' — valid: T0..T5`, validTiers: Object.keys(TIER_INFO) });
    }
    return JSON.stringify(
      { tier, pricingNote: "2026-06 list pricing, USD per million tokens (input/output)", ...info },
      null,
      2,
    );
  },
};

const sessionSummaryTool: McpTool = {
  name: "mooter_session_summary",
  description:
    "Summary of the current Mooter session state: effort mode, recent decision counts by tier (tail of decisions.log), and savings figures from the local tracker. Self-contained, local-first, read-only.",
  inputSchema: {
    type: "object",
    properties: { window: { type: "number", description: "tail size of decisions.log to count (default 50)" } },
  },
  async handler(args, ctx) {
    const window = Number.isFinite(args.window as number) && Number(args.window) > 0 ? Math.floor(Number(args.window)) : 50;
    const all = readClassifiedEvents();
    const tail = all.slice(-window);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = all.filter((e) => typeof e.ts_ms === "number" && e.ts_ms >= start.getTime());
    const metrics = await fetchTrackerMetrics(ctx);
    return JSON.stringify(
      {
        effortMode: getEffort().mode,
        sessionId: process.env.CLAUDE_SESSION_ID ?? null,
        recentDecisions: { window, total: tail.length, byTier: countByTier(tail) },
        decisionsToday: today.length,
        savings: metrics
          ? {
              savedUsd: typeof metrics.saved === "number" ? metrics.saved : null,
              savedPct: typeof metrics.saved_pct === "number" ? Math.round(metrics.saved_pct) : null,
              scope: "savings-tracker aggregate (no per-day dollar breakdown exists; decisionsToday is a count, not dollars)",
            }
          : null,
        note: metrics ? undefined : "savings-tracker offline — savings figures unavailable",
      },
      null,
      2,
    );
  },
};

export function buildRegistry(): McpTool[] {
  return [
    statusTool,
    dogfoodTool,
    workflowTool,
    ecosystemTool,
    pastorTool,
    notionTool,
    pastorAdapterSuggestTool,
    obsidianSyncTool,
    // Wave 32
    effortSetTool,
    ultramooToggleTool,
    workflowWatchTool,
    dataExportTool,
    // Wave 33.5 Block A.4
    sessionsListTool,
    sessionsQuotaTool,
    sessionsHandoffTool,
    sessionsPastorAggregateTool,
    // Wave 50-51 Phase 1.C
    routeQueryTool,
    getSavingsTool,
    explainTierTool,
    sessionSummaryTool,
  ];
}

export const TOOL_NAMES = buildRegistry().map((t) => t.name);
