// Terminal UI — Phase H (T2).
//
// `mooter workflow watch <run_id>` — live progress for a run, read from the
// SQLite store (Phase F): phase x/N (distinct checkpoints reached), agents
// done/total with the local/cloud split, running cost + savings, and the most
// recent workers (model + latency). Distinct from the opt-in statusline line 3
// (tools/router/workflow-status.js), which is a single line.
//
// Deliberately a plain text renderer, NOT an ink React tree: watch() must be
// trivially testable and never wedge a non-TTY CI. renderProgress() is pure; in
// a TTY, watch() polls until the run is terminal; otherwise it renders once.

import { WorkflowStore, defaultDbPath } from "./state.ts";
import type { RunRecord, AgentRecord, CheckpointRecord } from "./state.ts";
import { priceTurn } from "./pricing.ts";

const OPUS_BASELINE_MODEL = "claude-opus-4-8";

export interface WatchOptions {
  runId: string;
  /** Poll interval for the live view. Default ~500ms. */
  refreshMs?: number;
  /** Render once and return (no polling). Default: poll while in a TTY. */
  once?: boolean;
  /** Cap the number of poll iterations (tests). Default: unbounded. */
  maxPolls?: number;
  /** Inject a store (tests); defaults to the on-disk default store. */
  store?: WorkflowStore;
  /** Output sink; defaults to process.stdout. */
  out?: (text: string) => void;
}

function usd(n: number): string {
  if (!n) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Pure: a multi-line progress snapshot for one run. */
export function renderProgress(
  run: RunRecord,
  agents: AgentRecord[],
  checkpoints: CheckpointRecord[],
): string {
  const phasesDone = checkpoints.length;
  const totalPhases = run.num_phases ?? 0;
  let local = 0;
  let cloud = 0;
  let cost = 0;
  let allOpus = 0;
  for (const a of agents) {
    if (a.backend === "ollama") local++;
    else if (a.backend === "claude-api") cloud++;
    cost += a.cost_usd ?? 0;
    allOpus += priceTurn(OPUS_BASELINE_MODEL, a.tokens_in ?? 0, a.tokens_out ?? 0);
  }
  const saved = Math.max(0, allOpus - cost);

  const head = `🔄 ${run.workflow_name ?? run.run_id} (${run.run_id}) · ${run.status}`;
  const phaseStr = totalPhases ? `phase ${phasesDone}/${totalPhases}` : `${phasesDone} checkpoints`;
  const agentStr = `agents ${agents.length} (${local} local, ${cloud} cloud)`;
  const costStr = `cost ${usd(cost)} · saved ${usd(saved)}`;
  const lines = [head, `   ${phaseStr} · ${agentStr} · ${costStr}`];

  const recent = agents.slice(-3).map((a) => `${a.model ?? "?"} ${a.latency_ms ?? 0}ms`);
  if (recent.length) lines.push(`   last: ${recent.join(" · ")}`);
  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isTerminal = (status?: string): boolean => !!status && status !== "running";

export async function watch(options: WatchOptions): Promise<void> {
  const out = options.out ?? ((t: string) => process.stdout.write(t + "\n"));
  const store = options.store ?? new WorkflowStore(defaultDbPath());
  const owned = !options.store;

  const renderOnce = (): string | undefined => {
    const run = store.loadRun(options.runId);
    if (!run) {
      out(`workflow: no run '${options.runId}'`);
      return undefined;
    }
    out(renderProgress(run, store.agentsFor(run.run_id), store.resumeFrom(run.run_id)));
    return run.status;
  };

  try {
    let status = renderOnce();
    if (status === undefined) return;
    if (options.once || isTerminal(status) || !process.stdout.isTTY) return;

    const refreshMs = options.refreshMs ?? 500;
    const maxPolls = options.maxPolls ?? Number.POSITIVE_INFINITY;
    let polls = 0;
    while (!isTerminal(status) && polls < maxPolls) {
      await sleep(refreshMs);
      status = renderOnce();
      if (status === undefined) return;
      polls++;
    }
  } finally {
    if (owned) store.close();
  }
}
