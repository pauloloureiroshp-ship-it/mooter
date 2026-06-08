// Mooter MCP tool registry (Wave 30 Phase K).
//
// Each tool is a self-contained handler reusing the existing Mooter packages
// (synthesis/cli) — the MCP server is a thin protocol adapter, not new logic.
// Handlers return a plain string (rendered as MCP text content).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { summarize, EXPECTED_CLASSIFY_SHA } from "../../synthesis/src/state/central-state.ts";
import { mooterPath, appendJsonl, readJsonSafe } from "../../synthesis/src/config.ts";
import { buildEntry, dogfoodPath, countToday } from "../../cli/src/commands/dogfood.ts";
import { loadCatalog, recommend, loadProfile, routeRequest, listTaskAdapters } from "../../synthesis/src/index.ts";
import { sync as obsidianSync, primaryVault as obsidianPrimaryVault } from "../../../packs/obsidian-vault-sync/pack.ts";

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
  ];
}

export const TOOL_NAMES = buildRegistry().map((t) => t.name);
