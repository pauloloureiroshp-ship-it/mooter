// Wave 32 (Phase E) — workflow watch control plane.
//
// The Wave 28 workflow engine is INTOCADO (doctrine #2): we never modify it. So
// pause/resume/kill cannot reach into a running engine directly. Instead the
// watch writes a control-intent file that a cooperating runner polls:
//
//   ~/.mooter/workflow-control/<run_id>.json
//   { "run": "running"|"paused"|"kill", "agents": { "<label>": "kill" }, "ts": N }
//
// This is the HONEST contract: the watch owns the control plane (writes intents,
// shows their state); live enforcement is opt-in on the runner side (it polls
// this file between agent dispatches). A run started without the cooperating
// runner still shows intents — they simply have no effect, which the UI states.
//
// Pure file I/O over a documented schema; no engine coupling.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type RunControl = "running" | "paused" | "kill";
export type AgentControl = "kill" | "running";

export interface ControlState {
  run: RunControl;
  agents: Record<string, AgentControl>;
  ts: number;
}

function controlDir(home = homedir()): string {
  return join(home, ".mooter", "workflow-control");
}

export function controlPath(runId: string, home = homedir()): string {
  return join(controlDir(home), `${sanitize(runId)}.json`);
}

function sanitize(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

export function readControl(runId: string, home = homedir()): ControlState {
  try {
    const raw = JSON.parse(readFileSync(controlPath(runId, home), "utf8"));
    return {
      run: (["running", "paused", "kill"] as const).includes(raw.run) ? raw.run : "running",
      agents: raw.agents && typeof raw.agents === "object" ? raw.agents : {},
      ts: Number(raw.ts) || 0,
    };
  } catch {
    return { run: "running", agents: {}, ts: 0 };
  }
}

function writeControl(runId: string, state: ControlState, home = homedir()): void {
  mkdirSync(controlDir(home), { recursive: true });
  writeFileSync(controlPath(runId, home), JSON.stringify(state, null, 2) + "\n");
}

/** Set the whole-run control intent (pause/resume/kill). `now` is injectable for tests. */
export function setRunControl(runId: string, run: RunControl, opts: { home?: string; now?: number } = {}): ControlState {
  const home = opts.home ?? homedir();
  const cur = readControl(runId, home);
  const next: ControlState = { ...cur, run, ts: opts.now ?? 0 };
  writeControl(runId, next, home);
  return next;
}

/** Mark a single agent (by label) for kill. */
export function setAgentControl(
  runId: string,
  label: string,
  control: AgentControl,
  opts: { home?: string; now?: number } = {},
): ControlState {
  const home = opts.home ?? homedir();
  const cur = readControl(runId, home);
  const agents = { ...cur.agents, [label]: control };
  const next: ControlState = { ...cur, agents, ts: opts.now ?? 0 };
  writeControl(runId, next, home);
  return next;
}
