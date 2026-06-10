// Wave 33.5 Block B.2 — the spawn pipeline (default local-first).
//
//   1. classify the task → tier (classify.js doctrine; never modified)
//   2. tier → mode (T0/T1 local Ollama, T2/T3 cloud)
//   3. REFUSE if no sandbox backend (security wins — no unsandboxed mode)
//   4. create an isolated git worktree on spawn/<id>
//   5. build the 4-layer SandboxConfig
//   6. write the initial record, then hand off to the runner
//
// Everything external (classifier, git, sandbox detection, clock, id) is
// injectable so the whole pipeline is unit-testable without side effects.

import { createHash } from "node:crypto";

import { classifyTier, tierToMode, type Classifier } from "./classify-tier.ts";
import { detectSandbox, type WhichRunner } from "./sandbox/detect.ts";
import { buildSandboxConfig } from "./sandbox/sandbox.ts";
import { createWorktree, type GitRunner } from "./worktree.ts";
import { writeRecord } from "./state.ts";
import { buildCommand } from "./runner.ts";
import type { SpawnRequest, SpawnRecord, Tier } from "./types.ts";

export interface CreateSpawnOptions {
  home?: string;
  sourceCwd?: string;
  now?: number;
  classifier?: Classifier;
  git?: GitRunner;
  which?: WhichRunner;
  platform?: NodeJS.Platform;
  /** Local model for T0/T1 spawns. */
  localModel?: string;
}

export interface CreateSpawnResult {
  record: SpawnRecord;
  command: string[];
}

export class SandboxUnavailableError extends Error {
  constructor(public hint: string) {
    super(`refusing to spawn: no sandbox available — ${hint}`);
    this.name = "SandboxUnavailableError";
  }
}

function spawnId(task: string, now: number): string {
  return `sp_${createHash("sha1").update(task + now).digest("hex").slice(0, 10)}`;
}

/**
 * Plan + materialize a spawn (classify, refuse-if-unsandboxed, worktree, config,
 * initial record). Does NOT launch the process — the caller runs it via
 * runSandboxed(result.record, { command: result.command }). Splitting plan from
 * run keeps the pipeline pure-ish and lets tests assert the plan in isolation.
 */
export function createSpawn(req: SpawnRequest, opts: CreateSpawnOptions = {}): CreateSpawnResult {
  const now = opts.now ?? Date.now();

  // 1-2 — tier + mode.
  const tier: Tier = req.forceTier ?? classifyTier(req.task, opts.classifier);
  const mode = req.mode && req.mode !== "auto" ? req.mode : tierToMode(tier);

  // 3 — refuse without a sandbox (no unsandboxed mode).
  const sb = detectSandbox(opts.which, opts.platform);
  if (!sb.available) throw new SandboxUnavailableError(sb.hint);

  // 4 — isolated worktree.
  const id = spawnId(req.task, now);
  const { worktreePath, branch } = createWorktree(id, {
    baseBranch: req.baseBranch,
    sourceCwd: opts.sourceCwd,
    home: opts.home,
    git: opts.git,
  });

  // 5 — 4-layer config.
  const sandbox = buildSandboxConfig({ worktreePath, mode, tier, home: opts.home });

  // 6 — initial record.
  const record: SpawnRecord = {
    id,
    task: req.task,
    tier,
    mode,
    status: "sandboxed",
    worktreePath,
    branch,
    createdAtMs: now,
    updatedAtMs: now,
    pid: null,
    exitCode: null,
    sandbox,
  };
  writeRecord(record, opts.home);

  const model = opts.localModel ?? "qwen3:30b";
  const command = buildCommand(mode, req.task, model);
  return { record, command };
}
