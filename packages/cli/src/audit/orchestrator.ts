// Wave 34 — fan-out orchestrator for `mooter audit`.
//
// Runs the facet probes in parallel onto FREE local Ollama workers, with at most
// ONE cloud synthesis call (only when --max-cost > 0). It is deliberately
// SELF-CONTAINED — it does NOT import @mooter/workflow. That package carries
// native deps (isolated-vm/better-sqlite3/ink) and the relative createRequire
// paths in its pricing/pool helpers break once esbuild bundles them into the
// zero-runtime-deps CLI (see CI #128). A ~30-line Ollama caller keeps the CLI
// bundle clean, load-safe, and testable (inject `worker` to avoid the network).

import pLimit from "p-limit";
import type { Facet, FacetIO } from "./facets.ts";
import { realIO, AUDIT_SYSTEM } from "./facets.ts";

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_LOCAL_MODEL = "qwen2.5-coder:7b";
const DEFAULT_SYNTH_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 120_000;

export type Backend = "ollama" | "claude-api";

export interface WorkerRequest {
  model: string;
  system: string;
  prompt: string;
  backend: Backend;
  host?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface WorkerResult {
  text: string;
  backend: Backend;
  model: string;
  cost_usd: number;
  ok: boolean;
  error?: string;
}

export type WorkerFn = (req: WorkerRequest) => Promise<WorkerResult>;

// ── Default worker: local Ollama (free) or Anthropic messages (cloud) ────────

async function callOllama(req: WorkerRequest): Promise<WorkerResult> {
  const host = (req.host ?? process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, "");
  try {
    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        system: req.system,
        stream: false,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { text: "", backend: "ollama", model: req.model, cost_usd: 0, ok: false, error: `ollama ${res.status}` };
    }
    const j = (await res.json()) as { response?: string };
    return { text: String(j.response ?? ""), backend: "ollama", model: req.model, cost_usd: 0, ok: true };
  } catch (e) {
    return { text: "", backend: "ollama", model: req.model, cost_usd: 0, ok: false, error: `ollama unreachable (${host}): ${(e as Error).message}` };
  }
}

// Minimal pricing for the single synthesis call only ($/M tokens in,out).
function estimateClaudeCost(model: string, tin: number, tout: number): number {
  const M = 1_000_000;
  const rates: Record<string, [number, number]> = {
    "claude-sonnet-4-6": [3, 15],
    "claude-opus-4-8": [5, 25],
    "claude-haiku-4-5-20251001": [1, 5],
  };
  const [ri, ro] = rates[model] ?? [3, 15];
  return (tin / M) * ri + (tout / M) * ro;
}

async function callClaude(req: WorkerRequest): Promise<WorkerResult> {
  const apiKey = req.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: "", backend: "claude-api", model: req.model, cost_usd: 0, ok: false, error: "no ANTHROPIC_API_KEY for synthesis" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: req.model, max_tokens: 2048, system: req.system, messages: [{ role: "user", content: req.prompt }] }),
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { text: "", backend: "claude-api", model: req.model, cost_usd: 0, ok: false, error: `anthropic ${res.status}` };
    }
    const j = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (j.content ?? []).map((c) => c.text ?? "").join("");
    const cost = estimateClaudeCost(req.model, j.usage?.input_tokens ?? 0, j.usage?.output_tokens ?? 0);
    return { text, backend: "claude-api", model: req.model, cost_usd: cost, ok: true };
  } catch (e) {
    return { text: "", backend: "claude-api", model: req.model, cost_usd: 0, ok: false, error: `anthropic error: ${(e as Error).message}` };
  }
}

export const defaultWorker: WorkerFn = (req) => (req.backend === "claude-api" ? callClaude(req) : callOllama(req));

// ── Fan-out ──────────────────────────────────────────────────────────────────

export interface Finding {
  facet: string;
  sources: number;
  backend: Backend;
  model: string;
  cost_usd: number;
  text: string;
  ok: boolean;
  error?: string;
}

export interface FanOutReport {
  startedAtMs: number;
  finishedAtMs: number;
  facets: Finding[];
  synthesis: string | null;
  totalCostUsd: number;
  localCount: number;
  cloudCount: number;
  concurrency: number;
}

export interface RunFanOutOptions {
  root: string;
  facets: Facet[];
  /** > 0 enables a single cloud synthesis call; default 0 (local-only, free). */
  maxCostUsd?: number;
  /** Local worker model (default qwen2.5-coder:7b). */
  model?: string;
  /** Cloud synthesis model (default claude-sonnet-4-6). */
  synthModel?: string;
  /** Parallel worker cap (default 4). */
  concurrency?: number;
  io?: FacetIO;
  worker?: WorkerFn;
  /** Wall-clock now (injected so the timing/filename is deterministic in tests). */
  nowMs: number;
}

export async function runFanOut(opts: RunFanOutOptions): Promise<FanOutReport> {
  const io = opts.io ?? realIO();
  const worker = opts.worker ?? defaultWorker;
  const model = opts.model ?? DEFAULT_LOCAL_MODEL;
  const maxCost = opts.maxCostUsd ?? 0;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const limit = pLimit(concurrency);
  const startedAtMs = opts.nowMs;

  const findings = await Promise.all(
    opts.facets.map((f) =>
      limit(async (): Promise<Finding> => {
        const input = f.gather(opts.root, io);
        const r = await worker({ model, system: AUDIT_SYSTEM, prompt: f.prompt(input), backend: "ollama" });
        return {
          facet: f.name,
          sources: input.sources,
          backend: r.backend,
          model: r.model,
          cost_usd: r.cost_usd,
          text: r.text,
          ok: r.ok,
          error: r.error,
        };
      }),
    ),
  );

  let synthesis: string | null = null;
  let synthCost = 0;
  let synthDidRun = false;
  if (maxCost > 0) {
    const synthModel = opts.synthModel ?? DEFAULT_SYNTH_MODEL;
    const joined = findings
      .map((f) => `## ${f.facet}\n${f.ok ? f.text : `(no finding — ${f.error})`}`)
      .join("\n\n");
    const r = await worker({
      model: synthModel,
      system: "Synthesize the per-facet audits into an executive summary: top risks ranked, cross-cutting themes, and a prioritized action list. Terse, no preamble.",
      prompt: joined,
      backend: "claude-api",
    });
    if (r.ok) {
      synthesis = r.text;
      synthCost = r.cost_usd;
      synthDidRun = true;
    } else {
      synthesis = `(synthesis skipped — ${r.error})`;
    }
  }

  const totalCostUsd = findings.reduce((s, f) => s + f.cost_usd, 0) + synthCost;
  return {
    startedAtMs,
    finishedAtMs: Date.now(),
    facets: findings,
    synthesis,
    totalCostUsd,
    localCount: findings.filter((f) => f.backend === "ollama").length,
    cloudCount: findings.filter((f) => f.backend === "claude-api").length + (synthDidRun ? 1 : 0),
    concurrency,
  };
}
