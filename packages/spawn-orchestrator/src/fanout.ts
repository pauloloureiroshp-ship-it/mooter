// Wave 58 Phase E — multi-agent background fan-out.
//
// When a task decomposes into ≥3 independent agents, the default is to fan them
// out in the BACKGROUND: plan each via createSpawn (pipeline.ts), launch each
// through the multiplexer bridge (pane where available, piped child_process
// otherwise), track every one through state.ts (writeRecord/patchRecord) AND the
// session herd tracker (tools/router/subagent_tracker.js), then emit ONE summary
// report when the last finishes.
//
// HONESTY (Doctrine V4 §5 + brief): real sandboxed spawn THROWS on this Windows
// box (no bubblewrap; tmux/zellij/wezterm all absent). fanOut never pretends to
// have launched anything it didn't:
//   - If createSpawn throws SandboxUnavailableError for a task, that task lands in
//     the report as status "unavailable" with the real reason — never "launched".
//   - If EVERY task is unavailable (the Windows reality), fanOut returns
//     `realSpawn: false` and a degraded mode. The caller can then fall back to the
//     ordinary Claude-Code-subagent path, while the herd tracker still records the
//     fan-out shape so the statusline/digest reflect what was attempted.
//   - Cost/duration are only ever real measured values; absent values stay 0,
//     never invented.

import { createSpawn, SandboxUnavailableError, type CreateSpawnOptions, type CreateSpawnResult } from "./pipeline.ts";
import { patchRecord, appendOutput, listRecords } from "./state.ts";
import { spawnSummary, spawnChip } from "./chip.ts";
import { launchViaBridge, type BridgeLaunchOptions, type LaunchHandle } from "./multiplexer-bridge.ts";
import type { SpawnRecord, SpawnRequest } from "./types.ts";

/** A single agent's slice of the fan-out. */
export interface FanoutTask {
  task: string;
  forceTier?: SpawnRequest["forceTier"];
  mode?: SpawnRequest["mode"];
}

/** The threshold that flips a request to background fan-out (brief: 3+ agents). */
export const FANOUT_THRESHOLD = 3;

/** True when this set of tasks should default to background fan-out. */
export function isMultiAgent(tasks: FanoutTask[], threshold = FANOUT_THRESHOLD): boolean {
  return tasks.length >= threshold;
}

/**
 * Minimal herd-tracker shape we depend on (the real module is CommonJS:
 * tools/router/subagent_tracker.js). Injectable so tests never touch tmp files.
 */
export interface HerdTracker {
  trackSpawn(o: { agent_name?: string; tier?: string; model?: string; spawn_id?: string; session_id?: string }): string;
  trackComplete(spawn_id: string, o?: { duration_ms?: number; session_id?: string }): boolean;
  trackError(spawn_id: string, o?: { error_class?: string; session_id?: string }): boolean;
}

export type LaunchFn = (
  res: CreateSpawnResult,
  bridgeOpts: BridgeLaunchOptions,
  onData: (s: string) => void,
) => Promise<{ exitCode: number; handle: LaunchHandle; transport: "pane" | "pipe" }>;

export interface FanoutOptions extends CreateSpawnOptions {
  /** Per-task launcher. Default plans via createSpawn then launchViaBridge. */
  launch?: LaunchFn;
  /** Herd tracker (defaults to a no-op; the CLI wires the real CJS module). */
  herd?: HerdTracker;
  /** Forwarded to the bridge (multiplexer detection / pipe fallback / raw spawn). */
  bridge?: BridgeLaunchOptions;
  /** Session id for the herd tracker (session-scoped, ephemeral). */
  sessionId?: string;
  /** Force background (don't block on each task's exit). Default true. */
  background?: boolean;
  now?: number;
  sourceEnv?: NodeJS.ProcessEnv;
}

export interface FanoutTaskResult {
  task: string;
  /** "launched" only when a real sandboxed spawn started. */
  status: "launched" | "unavailable" | "failed";
  spawnId: string | null;
  tier: string | null;
  mode: string | null;
  transport: "pane" | "pipe" | null;
  exitCode: number | null;
  /** Honest reason when not launched (sandbox unavailable / error message). */
  reason?: string;
}

export interface FanoutReport {
  /** True iff at least one task launched a real sandboxed process. */
  realSpawn: boolean;
  /** "live" when something launched; "degraded" when every task was unavailable. */
  mode: "live" | "degraded";
  total: number;
  launched: number;
  unavailable: number;
  failed: number;
  tasks: FanoutTaskResult[];
  /** One-line human summary (the SINGLE report the brief asks for). */
  summary: string;
  /** Aggregate active/cost from state.ts at report time (real, from records). */
  herd: { active: number; totalCostUsd: number };
  /** Statusline chip string (🐝 N spawns active …) — empty when none active. */
  chip: string;
}

const NOOP_HERD: HerdTracker = {
  trackSpawn: () => "",
  trackComplete: () => false,
  trackError: () => false,
};

/** Default launcher: plan via createSpawn, launch through the bridge, wait for exit. */
const defaultLaunch: LaunchFn = (res, bridgeOpts, onData) =>
  new Promise((resolve) => {
    const { handle } = launchViaBridge(
      res.command,
      {
        onData,
        onExit: (code) =>
          resolve({ exitCode: code, handle, transport: handle.transport }),
      },
      bridgeOpts,
    );
  });

/**
 * Fan a set of independent agent tasks out in the background and return ONE
 * aggregated report. Degrades honestly when real sandboxed spawn is unavailable
 * (e.g. Windows without bubblewrap): such tasks are reported "unavailable" with
 * the real reason, the herd tracker still records the attempt, and `realSpawn`
 * reflects whether ANY task actually launched.
 */
export async function fanOut(tasks: FanoutTask[], options: FanoutOptions = {}): Promise<FanoutReport> {
  const herd = options.herd ?? NOOP_HERD;
  const launch = options.launch ?? defaultLaunch;
  const sessionId = options.sessionId;
  const results: FanoutTaskResult[] = [];

  const launches = tasks.map(async (t): Promise<FanoutTaskResult> => {
    // 1 — plan the spawn (classify → sandbox refuse-check → worktree → record).
    let res: CreateSpawnResult;
    try {
      res = createSpawn({ task: t.task, forceTier: t.forceTier, mode: t.mode ?? "auto" }, options);
    } catch (e) {
      if (e instanceof SandboxUnavailableError) {
        // HONEST degraded path: still register the attempt in the herd so the
        // statusline/digest reflect the intended fan-out shape, but never claim
        // a launch. The real Claude-Code-subagent path is the caller's fallback.
        const trackerId = herd.trackSpawn({ agent_name: "spawn-fanout", session_id: sessionId });
        herd.trackError(trackerId, { error_class: "sandbox_unavailable", session_id: sessionId });
        return {
          task: t.task,
          status: "unavailable",
          spawnId: null,
          tier: null,
          mode: null,
          transport: null,
          exitCode: null,
          reason: e.hint,
        };
      }
      return {
        task: t.task,
        status: "failed",
        spawnId: null,
        tier: null,
        mode: null,
        transport: null,
        exitCode: null,
        reason: (e as Error).message,
      };
    }

    // 2 — track in the session herd (real spawn about to launch).
    const trackerId = herd.trackSpawn({
      agent_name: res.record.mode === "local" ? "local-summarizer" : "spawn-fanout",
      tier: res.record.tier,
      model: res.record.mode === "local" ? "ollama" : undefined,
      spawn_id: res.record.id,
      session_id: sessionId,
    });

    // 3 — launch through the multiplexer bridge (pane or piped child_process).
    const startedAt = options.now ?? Date.now();
    patchRecord(res.record.id, { status: "running" }, startedAt, options.home);

    let exitCode = 0;
    let transport: "pane" | "pipe" = "pipe";
    try {
      const out = await launch(
        res,
        options.bridge ?? {},
        (s) => appendOutput(res.record.id, s, options.home),
      );
      exitCode = out.exitCode;
      transport = out.transport;
    } catch (e) {
      herd.trackError(trackerId, { error_class: "launch_error", session_id: sessionId });
      patchRecord(res.record.id, { status: "failed", exitCode: 127 }, Date.now(), options.home);
      return {
        task: t.task,
        status: "failed",
        spawnId: res.record.id,
        tier: res.record.tier,
        mode: res.record.mode,
        transport: null,
        exitCode: 127,
        reason: (e as Error).message,
      };
    }

    // 4 — finalize record + herd.
    const finishedAt = Date.now();
    patchRecord(
      res.record.id,
      { status: exitCode === 0 ? "done" : "failed", exitCode },
      finishedAt,
      options.home,
    );
    herd.trackComplete(trackerId, { duration_ms: Math.max(0, finishedAt - startedAt), session_id: sessionId });

    return {
      task: t.task,
      status: "launched",
      spawnId: res.record.id,
      tier: res.record.tier,
      mode: res.record.mode,
      transport,
      exitCode,
    };
  });

  for (const r of await Promise.all(launches)) results.push(r);

  return buildReport(results, options.home);
}

/** Aggregate per-task results into the single honest summary report. */
export function buildReport(tasks: FanoutTaskResult[], home?: string): FanoutReport {
  const launched = tasks.filter((t) => t.status === "launched").length;
  const unavailable = tasks.filter((t) => t.status === "unavailable").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const realSpawn = launched > 0;
  const mode: "live" | "degraded" = realSpawn ? "live" : "degraded";

  const records: SpawnRecord[] = (() => {
    try {
      return listRecords(home);
    } catch {
      return [];
    }
  })();
  const herd = spawnSummary(records);
  const chip = spawnChip({ home });

  let summary: string;
  if (realSpawn) {
    const bits = [`🐝 fan-out: ${launched}/${tasks.length} launched`];
    if (unavailable) bits.push(`${unavailable} unavailable`);
    if (failed) bits.push(`${failed} failed`);
    summary = bits.join(" · ");
  } else if (unavailable === tasks.length && tasks.length > 0) {
    // The Windows reality: nothing could launch. Say so plainly.
    const why = tasks[0]?.reason ?? "no sandbox backend on this platform";
    summary = `⚠️ real spawn unavailable on this platform — ${why}. Fan-out degraded to tracking-only; use the Claude Code subagent path.`;
  } else if (tasks.length === 0) {
    summary = "no tasks to fan out";
  } else {
    summary = `⚠️ fan-out failed: 0/${tasks.length} launched (${failed} failed, ${unavailable} unavailable)`;
  }

  return {
    realSpawn,
    mode,
    total: tasks.length,
    launched,
    unavailable,
    failed,
    tasks,
    summary,
    herd,
    chip,
  };
}
