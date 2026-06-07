// Sandboxed runtime — Phase E (T3, CRITICAL 🔒).
//
// Executes a workflow script inside an isolated-vm V8 isolate (NOT vm2 — it has
// historical sandbox-escape CVEs). A fresh isolate has NO Node globals: fs,
// child_process, process, require, and fetch are all absent by construction, so
// the sandbox denies them without an explicit blocklist. We add only a `mooter`
// API:
//   - I/O primitives (agent, checkpoint, log) bridge to the HOST via
//     ivm.Reference (the only things that touch the outside world). The host
//     agent call is routed through an AgentPool so concurrency is bounded where
//     Ollama actually runs, regardless of in-isolate parallelism.
//   - orchestration primitives (parallel, vote, converge) run pure in-isolate —
//     their callbacks live in the isolate and cannot cross the boundary.
//
// Per-script timeout (default 4h) and per-isolate memory cap (default 512MB) are
// enforced by the isolate. Host bridges are injectable (options.api) so tests
// run without network. Doctrine guardrails (push/deploy/secrets → T3) are a
// concern of the writer/agent layer, not bypassable from inside the sandbox.

import ivm from "isolated-vm";
import { agent as defaultAgent } from "./agent.ts";
import type { AgentRequest, AgentResult } from "./agent.ts";
import { checkpoint as defaultCheckpoint, log as defaultLog } from "./primitives.ts";
import { AgentPool } from "./pool.ts";

export class RuntimeError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RuntimeError";
    this.cause = cause;
  }
}

/** Host implementations of the boundary-crossing primitives. Injectable for
 *  tests; defaults wire to the real agent() + the primitives sink. */
export interface RuntimeApi {
  agent?: (req: AgentRequest) => Promise<AgentResult>;
  checkpoint?: (name: string, data: unknown) => Promise<void>;
  log?: (message: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export interface RuntimeOptions {
  /** Max wall-clock for the whole script. Default 4h. */
  timeoutMs?: number;
  /** Per-isolate memory cap in MB. Default 512 (isolated-vm minimum is 8). */
  memoryLimitMb?: number;
  /** run_id this script executes under (for checkpoints). */
  runId?: string;
  /** Read-only input data made available to the script as the global `INPUT`
   *  (deep-copied across the boundary as JSON — must be JSON-serialisable). This
   *  is how the host hands pre-gathered material (e.g. file contents it Read)
   *  into the sandbox, which has no filesystem of its own. */
  input?: unknown;
  /** Host bridges (agent/checkpoint/log). Defaults to real implementations. */
  api?: RuntimeApi;
  /** Host-side AgentPool cap for bridged agent() calls (default: VRAM auto). */
  poolConcurrency?: number;
}

export const RUNTIME_DEFAULTS = {
  timeoutMs: 4 * 60 * 60 * 1000,
  memoryLimitMb: 512,
} as const;

// In-isolate runtime library. Defines the `mooter` API on globalThis so the
// (separately compiled) user script can see it. I/O primitives call host
// References; orchestration primitives are pure JS.
const BOOTSTRAP = `
const __OPTS = { arguments: { copy: true }, result: { copy: true, promise: true } };
function __call(ref, args) { return ref.apply(undefined, args, __OPTS); }

const agent = (req) => __call(__host_agent, [JSON.stringify(req || {})]).then(function (s) { return JSON.parse(s); });
const checkpoint = (name, data) => __call(__host_checkpoint, [String(name), JSON.stringify(data === undefined ? null : data)]);
const log = (message, metadata) => __call(__host_log, [String(message), JSON.stringify(metadata === undefined ? null : metadata)]);

const INPUT = JSON.parse(typeof __INPUT_JSON === 'string' ? __INPUT_JSON : 'null');
globalThis.INPUT = INPUT;

const parallel = async (items, fn, options) => {
  options = options || {};
  const concurrency = Math.max(1, options.concurrency || 4);
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }
  const workers = [];
  const n = Math.min(concurrency, items.length);
  for (let w = 0; w < n; w++) workers.push(worker());
  await Promise.all(workers);
  return results;
};

const vote = async (candidates, voteFn) => {
  if (!Array.isArray(candidates)) throw new TypeError('vote: candidates must be an array');
  if (candidates.length === 0) return [];
  return voteFn(candidates);
};

const converge = async (initial, refineFn, maxIterations) => {
  if (maxIterations === undefined) maxIterations = 3;
  let current = initial;
  for (let iter = 0; iter < maxIterations; iter++) {
    const refined = await parallel(current, (r) => refineFn(r));
    const next = [];
    let changed = false;
    for (let k = 0; k < refined.length; k++) {
      const r = refined[k];
      if (r === null) { changed = true; continue; }
      if (r !== current[k]) changed = true;
      next.push(r);
    }
    current = next;
    if (!changed) break;
  }
  return current;
};

const mooter = { agent: agent, checkpoint: checkpoint, log: log, parallel: parallel, vote: vote, converge: converge };
globalThis.mooter = mooter;
globalThis.agent = agent;
globalThis.parallel = parallel;
globalThis.vote = vote;
globalThis.converge = converge;
globalThis.checkpoint = checkpoint;
globalThis.log = log;
globalThis.console = {
  log: function () { var a = Array.prototype.slice.call(arguments); return log(a.map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }).join(' ')); },
  error: function () { var a = Array.prototype.slice.call(arguments); return log(a.map(String).join(' ')); },
};
`;

/** Compile + run `script` in a fresh isolate; resolves with its return value. */
export async function runScript(script: string, options: RuntimeOptions = {}): Promise<unknown> {
  const timeout = options.timeoutMs ?? RUNTIME_DEFAULTS.timeoutMs;
  const memoryLimit = options.memoryLimitMb ?? RUNTIME_DEFAULTS.memoryLimitMb;
  const api = options.api ?? {};
  const agentFn = api.agent ?? defaultAgent;
  const checkpointFn = api.checkpoint ?? defaultCheckpoint;
  const logFn = api.log ?? defaultLog;

  const pool = new AgentPool({ concurrency: options.poolConcurrency });
  const isolate = new ivm.Isolate({ memoryLimit });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    const hostAgent = new ivm.Reference(async (reqJson: string) => {
      const req = JSON.parse(reqJson) as AgentRequest;
      const res = await pool.run(() => agentFn(req));
      return JSON.stringify(res);
    });
    const hostCheckpoint = new ivm.Reference(async (name: string, dataJson: string) => {
      await checkpointFn(name, JSON.parse(dataJson));
      return "";
    });
    const hostLog = new ivm.Reference(async (message: string, metaJson: string) => {
      const meta = JSON.parse(metaJson);
      await logFn(message, meta === null ? undefined : meta);
      return "";
    });

    await jail.set("__host_agent", hostAgent);
    await jail.set("__host_checkpoint", hostCheckpoint);
    await jail.set("__host_log", hostLog);
    await jail.set("__INPUT_JSON", JSON.stringify(options.input ?? null));

    await (await isolate.compileScript(BOOTSTRAP)).run(context);

    let compiled: ivm.Script;
    try {
      compiled = await isolate.compileScript("(async () => {\n" + script + "\n})()");
    } catch (err) {
      throw new RuntimeError(`workflow script failed to compile: ${(err as Error).message}`, err);
    }

    return await compiled.run(context, { timeout, promise: true, copy: true });
  } catch (err) {
    if (err instanceof RuntimeError) throw err;
    throw new RuntimeError(`workflow script failed: ${(err as Error).message}`, err);
  } finally {
    if (!isolate.isDisposed) isolate.dispose();
  }
}
