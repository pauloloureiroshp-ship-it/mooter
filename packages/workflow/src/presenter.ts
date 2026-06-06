// Plan presenter — Phase G (T2). Stub: signatures only.
//
// Shows the WorkflowPlan in a readable table (ink-table) and asks the user to
// confirm before anything runs. Under --dangerously-skip-permissions it
// auto-accepts. Honest cost/agent counts come straight from the plan.

import { notImplemented } from "./_stub.ts";
import type { WorkflowPlan } from "./writer.ts";

export type PresentDecision = "run" | "view" | "cancel" | "edit";

export interface PresentOptions {
  /** --dangerously-skip-permissions → auto-accept ("run"). */
  autoAccept?: boolean;
}

export async function presentPlan(
  _plan: WorkflowPlan,
  _options: PresentOptions = {},
): Promise<PresentDecision> {
  return notImplemented("presentPlan()", "G");
}
