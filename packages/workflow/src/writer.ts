// Script writer — Phase G (T2).
//
// Turns a natural-language prompt into an executable workflow.js with ONE Claude
// Opus (Anthropic API) call, behind a rigorous system prompt that constrains the
// output to the sandbox surface (agent/parallel/vote/converge/checkpoint/log) and
// the available local worker models. The model replies with strict JSON
// { phases, script }; we validate the script compiles, then derive an honest
// execution plan (agent counts split local/cloud, token + cost estimate) for the
// presenter to confirm.
//
// The cost discipline lives HERE, not in the sandbox: the system prompt pushes
// the bulk of the work onto free local Ollama workers and reserves the cloud for
// a single synthesis pass. classify.js is never touched — detection of "this is
// a workflow" is a CLI concern, and authoring is this one Opus call.

import { agent as defaultAgent } from "./agent.ts";
import type { AgentRequest, AgentResult } from "./agent.ts";
import { priceTurn } from "./pricing.ts";

export interface PhasePlan {
  title: string;
  detail?: string;
  agentCount: number;
  /** Which backend this phase's agents use. Drives the local/cloud split and
   *  cost estimate. Defaults to "ollama" (free local worker). */
  backend?: "ollama" | "claude-api";
  /** Cloud model for cost estimation when backend is "claude-api". */
  model?: string;
}

export interface WorkflowPlan {
  /** Generated, sandbox-ready workflow.js source. */
  script: string;
  phases: PhasePlan[];
  agentsTotal: number;
  agentsLocal: number;
  agentsCloud: number;
  tokenEstimate: number;
  estimatedCostUsd: number;
  /** What the authoring Opus call itself cost (separate from the run). Honest
   *  reporting for the demo-cost gate ("writer + synthesis < $0.50"). */
  writerCostUsd?: number;
}

export interface WriteOptions {
  /** Writer model. Default claude-opus-4-8 (the brief: ONE Opus call). */
  model?: string;
  /** Injectable agent fn (tests/mocks). Default the real agent(). */
  agentFn?: (req: AgentRequest) => Promise<AgentResult>;
  /** Base URL forwarded to agent() (tests/mocks point this at a fake server). */
  host?: string;
  /** Max tokens for the writer call. Default 4096. */
  maxTokens?: number;
}

export class WriterError extends Error {
  /** The raw model output, for debugging a bad generation. */
  readonly raw?: string;
  constructor(message: string, raw?: string) {
    super(message);
    this.name = "WriterError";
    this.raw = raw;
  }
}

export const DEFAULT_WRITER_MODEL = "claude-opus-4-8";

/** Rough per-agent token budget used only for the plan estimate (the real run
 *  reports actual tokens via the SQLite store). Conservative on the high side so
 *  a plan never under-promises cost. */
const EST_TOKENS_IN = 1500;
const EST_TOKENS_OUT = 800;
/** Default cloud model assumed when a cloud phase doesn't name one (upper-bound
 *  estimate — Opus is the priciest tier). */
const DEFAULT_CLOUD_MODEL = "claude-opus-4-8";

/** The writer's system prompt. Exported so the demo/skill can document it and so
 *  it can be reviewed in isolation — its quality IS the quality of generated
 *  workflows. Kept in sync with the sandbox BOOTSTRAP in runtime.ts. */
export const WRITER_SYSTEM_PROMPT = `You are the Mooter Workflow Writer. You convert a user's natural-language task into ONE self-contained JavaScript orchestration script that runs inside the Mooter sandbox.

# Execution model
The script is wrapped and run as the body of an async function: \`(async () => { <your script> })()\`. Use \`await\` freely at the top level. End the script with a \`return\` of the final result (a JSON-serialisable value).

# The ONLY APIs available (all are globals; do NOT import or require anything)
- agent(req) -> Promise<{ result, tokens_in, tokens_out, cost_usd, model, backend }>
    req = { model, prompt, system?, tools?, max_tokens?, temperature? }
    Runs ONE subtask on a worker. Returns the worker's text in \`result\`.
- parallel(items, async (item, index) => result, { concurrency? }) -> Promise<result[]>
    Maps over items with bounded concurrency (default 4), preserving order.
- vote(candidates, async (candidates) => survivors) -> Promise<survivors[]>
    Run an adversarial/voting pass; return the survivors you keep.
- converge(initial, async (item) => item | null, maxIterations=3) -> Promise<item[]>
    Iteratively refine: return the SAME reference when an item is done, a NEW
    value to keep refining, or null to drop it. Stops at fixpoint or maxIterations.
- checkpoint(name, data) -> Promise<void>
    Persist a named milestone. Call it after EACH phase so the run is resumable
    cross-session (kill mid-run, restart, continue from the last checkpoint).
- log(message, metadata?) -> Promise<void>   // progress line for the user
- console.log(...)                            // forwarded to log()

# FORBIDDEN (the sandbox has no Node globals — using these throws)
require, import, fetch, process, fs, child_process, eval of external code,
network of any kind, the filesystem. Reading the user's files happens INSIDE an
agent() call via its \`tools\` allow-list (e.g. tools: ["Read","Grep","Glob"]),
never directly.

# Available worker models
LOCAL (Ollama, FREE — use these for the BULK of the work):
- "qwen2.5-coder:7b"   primary code worker (default choice)
- "qwen2.5-coder:14b"  heavier code worker (use only when 7b is too weak)
- "deepseek-r1:7b"     reasoning worker
CLOUD (Anthropic, COSTS MONEY — use SPARINGLY, ideally once for final synthesis):
- "claude-haiku-4-5"   cheap cloud
- "claude-sonnet-4-6"  mid cloud
- "claude-opus-4-8"    top cloud (reserve for the single synthesis/judge step)

# Cost doctrine (this is the whole point of Mooter)
Fan work out across LOCAL workers in parallel(); reserve at most ONE cloud agent
for the final synthesis. A good workflow runs many qwen workers and zero-or-one
Opus call. Never put a cloud model inside a large parallel() fan-out.

# Output format — STRICT
Reply with ONE JSON object and NOTHING else (no prose, no markdown fences):
{
  "phases": [
    { "title": "Scan", "detail": "grep + read targets", "agentCount": 12, "backend": "ollama" },
    { "title": "Synthesize", "detail": "one Opus pass over findings", "agentCount": 1, "backend": "claude-api", "model": "claude-opus-4-8" }
  ],
  "script": "const targets = [...]; const findings = await parallel(targets, async (t) => { const r = await agent({ model: 'qwen2.5-coder:7b', prompt: '...' + t }); return r.result; }); await checkpoint('findings', findings); const synth = await agent({ model: 'claude-opus-4-8', prompt: 'Synthesize:\\n' + findings.join('\\n') }); return synth.result;"
}
The "script" value is the full JavaScript source as a JSON string (escape newlines as \\n). "agentCount" per phase must match how many agent() calls that phase makes. Set "backend" honestly so the plan's local/cloud split is accurate.`;

/** Extract the JSON object from a model reply that may be fenced or have stray
 *  prose around it. Tolerant: prefers a ```json fence, then any fence, then the
 *  outermost {...}. */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new WriterError("writer reply contained no JSON object", raw);
  }
  return body.slice(start, end + 1);
}

/** Count agent()/mooter.agent() call sites — a cross-check on the model's
 *  self-reported agentCount (ignores ones inside string literals only loosely;
 *  good enough for a sanity warning, not a hard gate). */
export function countAgentCalls(script: string): number {
  const matches = script.match(/\bagent\s*\(/g);
  return matches ? matches.length : 0;
}

/** Compile-check the script WITHOUT running it: wrap exactly as the runtime does
 *  and hand it to the Function constructor (which compiles but never executes,
 *  since we never call the result). Throws WriterError on a syntax error. */
export function assertCompiles(script: string): void {
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (async () => {\n${script}\n});`);
  } catch (err) {
    throw new WriterError(`generated script failed to compile: ${(err as Error).message}`, script);
  }
}

interface RawPlan {
  phases?: Array<{ title?: unknown; detail?: unknown; agentCount?: unknown; backend?: unknown; model?: unknown }>;
  script?: unknown;
}

function normalizePhases(raw: RawPlan): PhasePlan[] {
  if (!Array.isArray(raw.phases) || raw.phases.length === 0) {
    throw new WriterError("writer reply had no phases");
  }
  return raw.phases.map((p, i) => {
    const backend = p.backend === "claude-api" ? "claude-api" : "ollama";
    const phase: PhasePlan = {
      title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : `Phase ${i + 1}`,
      agentCount: typeof p.agentCount === "number" && p.agentCount >= 0 ? Math.round(p.agentCount) : 0,
      backend,
    };
    if (typeof p.detail === "string" && p.detail.trim()) phase.detail = p.detail.trim();
    if (typeof p.model === "string" && p.model.trim()) phase.model = p.model.trim();
    return phase;
  });
}

/** Parse a raw writer reply into a validated WorkflowPlan (no network). Derives
 *  the local/cloud agent split, a conservative token estimate, and a cost
 *  estimate (local = $0; cloud priced via the canonical table). Exported so the
 *  e2e/dry-run test can exercise it with a canned reply. */
export function parsePlan(raw: string): WorkflowPlan {
  let parsed: RawPlan;
  try {
    parsed = JSON.parse(extractJson(raw)) as RawPlan;
  } catch (err) {
    if (err instanceof WriterError) throw err;
    throw new WriterError(`writer reply was not valid JSON: ${(err as Error).message}`, raw);
  }
  if (typeof parsed.script !== "string" || !parsed.script.trim()) {
    throw new WriterError("writer reply had an empty script", raw);
  }
  const script = parsed.script;
  assertCompiles(script);

  const phases = normalizePhases(parsed);
  let agentsLocal = 0;
  let agentsCloud = 0;
  let estimatedCostUsd = 0;
  for (const p of phases) {
    if (p.backend === "claude-api") {
      agentsCloud += p.agentCount;
      estimatedCostUsd += p.agentCount * priceTurn(p.model ?? DEFAULT_CLOUD_MODEL, EST_TOKENS_IN, EST_TOKENS_OUT);
    } else {
      agentsLocal += p.agentCount; // local Ollama = $0
    }
  }
  const agentsTotal = agentsLocal + agentsCloud;
  const tokenEstimate = agentsTotal * (EST_TOKENS_IN + EST_TOKENS_OUT);

  return {
    script,
    phases,
    agentsTotal,
    agentsLocal,
    agentsCloud,
    tokenEstimate,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1e6) / 1e6,
  };
}

/** NL prompt → workflow script + plan (one Opus call). */
export async function writeWorkflow(prompt: string, options: WriteOptions = {}): Promise<WorkflowPlan> {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new WriterError("writeWorkflow: prompt is required");
  }
  const agentFn = options.agentFn ?? defaultAgent;
  const model = options.model ?? DEFAULT_WRITER_MODEL;

  const res = await agentFn({
    model,
    system: WRITER_SYSTEM_PROMPT,
    prompt: `Task: ${prompt.trim()}\n\nWrite the workflow now. Reply with the JSON object only.`,
    backend: "claude-api",
    max_tokens: options.maxTokens ?? 4096,
    temperature: 0,
    host: options.host,
  });

  const plan = parsePlan(res.result);
  plan.writerCostUsd = res.cost_usd;
  return plan;
}
