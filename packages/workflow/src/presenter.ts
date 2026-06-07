// Plan presenter — Phase G (T2).
//
// Renders a WorkflowPlan as a readable table and asks the user to confirm before
// anything runs. Under --dangerously-skip-permissions (options.autoAccept) it
// auto-accepts. Honest cost/agent counts come straight from the plan.
//
// Deliberately NOT ink/ink-table here: the presenter is a one-shot confirm
// prompt that must stay trivially testable and never hang a non-TTY CI. The rich
// live TUI (ink) is the job of watch() in tui.ts (Phase H). renderPlan() is a
// pure string function; presentPlan() layers a readline confirm on top, with an
// injectable reader so tests drive it without a terminal.

import type { WorkflowPlan, PhasePlan } from "./writer.ts";

export type PresentDecision = "run" | "view" | "cancel" | "edit";

export interface PresentOptions {
  /** --dangerously-skip-permissions → auto-accept ("run"), no prompt. */
  autoAccept?: boolean;
  /** Decision used when there is no interactive TTY. Default "cancel" (safe:
   *  never run a fresh workflow unattended unless autoAccept was set). */
  defaultDecision?: PresentDecision;
  /** Injectable line reader (tests). Receives the menu prompt, returns the
   *  user's raw answer. Defaults to a readline question on stdin/stdout. */
  readLine?: (prompt: string) => Promise<string>;
  /** Where the rendered plan is written. Default process.stdout. */
  out?: (text: string) => void;
}

function bar(width: number): string {
  return "─".repeat(width);
}

function usd(n: number): string {
  if (!n) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function phaseRow(p: PhasePlan, i: number): string {
  const where = p.backend === "claude-api" ? `cloud${p.model ? ` (${p.model})` : ""}` : "local";
  const detail = p.detail ? ` — ${p.detail}` : "";
  return `  ${i + 1}. ${p.title}  [${p.agentCount} agent${p.agentCount === 1 ? "" : "s"}, ${where}]${detail}`;
}

/** Pure: format a plan as a confirmable summary (no color, no side effects). */
export function renderPlan(plan: WorkflowPlan): string {
  const lines: string[] = [];
  lines.push("┌─ Workflow plan " + bar(46));
  for (let i = 0; i < plan.phases.length; i++) lines.push(phaseRow(plan.phases[i], i));
  lines.push("├" + bar(61));
  lines.push(
    `  agents: ${plan.agentsTotal} total · ${plan.agentsLocal} local (free) · ${plan.agentsCloud} cloud`,
  );
  lines.push(
    `  est. run cost: ${usd(plan.estimatedCostUsd)}` +
      (plan.writerCostUsd != null ? ` · writer: ${usd(plan.writerCostUsd)}` : "") +
      ` · ~${plan.tokenEstimate.toLocaleString("en-US")} tokens`,
  );
  lines.push("└" + bar(61));
  return lines.join("\n");
}

function decisionFromAnswer(answer: string): PresentDecision {
  const a = answer.trim().toLowerCase();
  if (a === "y" || a === "yes" || a === "run" || a === "") return "run";
  if (a === "v" || a === "view") return "view";
  if (a === "e" || a === "edit") return "edit";
  return "cancel";
}

const MENU = "[Y]es run · [V]iew script · [E]dit prompt · [N]o cancel: ";

async function readlineQuestion(prompt: string): Promise<string> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

export async function presentPlan(
  plan: WorkflowPlan,
  options: PresentOptions = {},
): Promise<PresentDecision> {
  const out = options.out ?? ((t: string) => process.stdout.write(t + "\n"));
  out(renderPlan(plan));

  if (options.autoAccept) return "run";

  // No interactive terminal and no injected reader → don't block; safe default.
  if (!options.readLine && !process.stdin.isTTY) {
    return options.defaultDecision ?? "cancel";
  }

  const ask = options.readLine ?? readlineQuestion;
  const answer = await ask(MENU);
  return decisionFromAnswer(answer);
}
