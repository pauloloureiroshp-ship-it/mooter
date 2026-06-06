// Script writer — Phase G (T2). Stub: signatures only.
//
// Turns a natural-language prompt into an executable workflow.js. ONE Claude
// Opus (Anthropic API) call, behind a rigorous system prompt that constrains
// output to mooter.agent()/parallel()/vote()/converge()/checkpoint() and the
// available local models. Returns the script plus an execution plan for the
// presenter to confirm.

import { notImplemented } from "./_stub.ts";

export interface PhasePlan {
  title: string;
  detail?: string;
  agentCount: number;
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
}

/** NL prompt → workflow script + plan (one Opus call). */
export async function writeWorkflow(_prompt: string): Promise<WorkflowPlan> {
  return notImplemented("writeWorkflow()", "G");
}
