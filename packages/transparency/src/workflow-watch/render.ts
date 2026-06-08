// Wave 32 (Phase E) — Ralph-style Workflow Mission Control frame (pure).
//
// Renders one frame from a snapshot of the Wave 28 run store (run record +
// agents + checkpoints) plus the local control state. No I/O — the CLI shell
// reads the store and the control file and passes a plain view in, so tests
// drive this with no SQLite and no TTY.

import { boxTop, boxRow, boxSep, boxBottom } from "../tui/box.ts";
import type { ControlState } from "./control.ts";

export interface WatchAgent {
  label: string;
  backend?: string;
  model?: string;
  costUsd?: number;
  latencyMs?: number;
}

export interface WorkflowWatchView {
  runId: string;
  status: string;
  workflowName?: string;
  numTotal?: number;
  numLocal?: number;
  numCloud?: number;
  actualCostUsd?: number;
  /** estimated all-Opus baseline cost, for the savings line (optional). */
  baselineCostUsd?: number;
  agents: WatchAgent[];
  checkpoints?: { name: string; ts: number }[];
  control: ControlState;
  width?: number;
}

const DEFAULT_WIDTH = 72;

function backendGlyph(backend?: string): string {
  const b = (backend ?? "").toLowerCase();
  if (b.includes("ollama") || b.includes("local") || b.includes("qwen") || b.includes("gemma")) return "🏠";
  if (b.includes("codex") || b.includes("gpt") || b.includes("oai")) return "⚡";
  if (!b) return "·";
  return "☁️";
}

function fmtUsd(n?: number): string {
  if (typeof n !== "number") return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function statusGlyph(status: string): string {
  switch (status) {
    case "running": return "▶";
    case "completed": return "✓";
    case "failed": return "✗";
    case "cancelled": return "⊘";
    default: return "·";
  }
}

export function buildWorkflowWatch(view: WorkflowWatchView): string {
  const width = view.width ?? DEFAULT_WIDTH;
  const out: string[] = [];
  const ctl = view.control;

  out.push(boxTop(`🐮 Workflow Mission Control · ${view.runId.slice(0, 12)} · ${statusGlyph(view.status)} ${view.status}`, width));

  // AGENTS — one row per recorded agent (workers + reviewers). The control file
  // can mark individual agents for kill; we show ✗ next to those.
  out.push(boxRow(`  AGENTS (${view.agents.length}${view.numTotal ? `/${view.numTotal} planned` : ""})`, width));
  if (view.agents.length === 0) {
    out.push(boxRow("    (no agents recorded yet)", width));
  } else {
    for (const a of view.agents.slice(0, 12)) {
      const killed = ctl.agents[a.label] === "kill";
      const mark = killed ? "✗" : "▸";
      const model = (a.model ?? a.backend ?? "—").slice(0, 16);
      const lat = typeof a.latencyMs === "number" ? `${Math.round(a.latencyMs)}ms` : "—";
      out.push(boxRow(`   ${mark} ${backendGlyph(a.backend)} ${a.label.slice(0, 22).padEnd(22)} ${model.padEnd(16)} ${fmtUsd(a.costUsd).padStart(8)} ${lat}`, width));
    }
    if (view.agents.length > 12) out.push(boxRow(`    … +${view.agents.length - 12} more`, width));
  }
  out.push(boxSep(width));

  // METRICS — totals, cost, savings, progress.
  out.push(boxRow("  METRICS", width));
  out.push(boxRow(`    agents: ${view.numTotal ?? view.agents.length} total · ${view.numLocal ?? "?"} local 🏠 · ${view.numCloud ?? "?"} cloud ☁️`, width));
  const cost = fmtUsd(view.actualCostUsd);
  let savings = "";
  if (typeof view.baselineCostUsd === "number" && typeof view.actualCostUsd === "number" && view.baselineCostUsd > 0) {
    const pct = Math.round((1 - view.actualCostUsd / view.baselineCostUsd) * 100);
    savings = ` · saved ${pct}% vs all-Opus (${fmtUsd(view.baselineCostUsd)})`;
  }
  out.push(boxRow(`    cost: ${cost}${savings}`, width));
  if (view.status === "running" && view.numTotal) {
    const done = view.agents.length;
    const pct = Math.min(100, Math.round((done / view.numTotal) * 100));
    out.push(boxRow(`    progress: ${done}/${view.numTotal} agents (${pct}%) · ETA from convergence`, width));
  }
  out.push(boxSep(width));

  // CONTROL STATE — the live intent the watch is broadcasting to the runner.
  const killedAgents = Object.values(ctl.agents).filter((v) => v === "kill").length;
  out.push(boxRow(`  CONTROL: run=${ctl.run}${killedAgents ? ` · ${killedAgents} agent(s) marked kill` : ""}`, width));
  if (ctl.run !== "running" || killedAgents) {
    out.push(boxRow("    (enforced when the run polls the control file)", width));
  }
  out.push(boxSep(width));

  out.push(boxRow("  [p]ause · [r]esume · [k]ill run · [a]gent-kill · [q]uit", width));
  out.push(boxBottom(width));

  return out.join("\n");
}
