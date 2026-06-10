// Wave 33.5 Block B.1 — `mooter spawn` CLI handlers.
//
//   mooter spawn <task>            default local-first, sandboxed, in a worktree
//   mooter spawn --cloud <task>    force a cloud subprocess
//   mooter spawn --local <task>    force Ollama
//   mooter spawn --no-sandbox …    REJECTED (security wins)
//   mooter spawn --batch <file>    one task per line
//   mooter spawn list|watch|kill|logs|artifacts
//
// The launcher (default runSandboxed) + git/classifier/which are injectable so the
// command surface is testable without forking processes or requiring bubblewrap.

import { readFileSync, readdirSync, existsSync } from "node:fs";

import { createSpawn, SandboxUnavailableError, type CreateSpawnOptions, type CreateSpawnResult } from "./pipeline.ts";
import { runSandboxed, type RunOptions } from "./runner.ts";
import { listRecords, readRecord, readOutput } from "./state.ts";
import { spawnSummary } from "./chip.ts";
import type { SpawnRecord, SpawnRequest } from "./types.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface SpawnCmdOptions extends CreateSpawnOptions {
  /** Inject the launcher; returns the final exit code. Default runs sandboxed for real. */
  launch?: (res: CreateSpawnResult, home?: string) => Promise<number>;
  /** Wait for completion before returning (default true; blocking is honest for MVP). */
  wait?: boolean;
  sourceEnv?: NodeJS.ProcessEnv;
}

function parseRequest(args: string[]): { req: SpawnRequest | null; reject?: string; batchFile?: string } {
  if (args.includes("--no-sandbox")) {
    return { req: null, reject: "--no-sandbox is not supported — Mooter never spawns unsandboxed (security wins)." };
  }
  const batchIdx = args.indexOf("--batch");
  if (batchIdx >= 0) return { req: null, batchFile: args[batchIdx + 1] };
  const mode = args.includes("--cloud") ? "cloud" : args.includes("--local") ? "local" : "auto";
  const task = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!task) return { req: null, reject: "usage: mooter spawn <task> [--cloud|--local]" };
  return { req: { task, mode } };
}

async function launchOne(res: CreateSpawnResult, opts: SpawnCmdOptions): Promise<number> {
  if (opts.launch) return opts.launch(res, opts.home);
  const runOpts: RunOptions = { command: res.command, home: opts.home, sourceEnv: opts.sourceEnv };
  const handle = runSandboxed(res.record, runOpts);
  return opts.wait === false ? 0 : handle.done;
}

export async function runSpawn(args: string[], opts: SpawnCmdOptions = {}): Promise<CmdResult> {
  const sub = args[0];

  if (sub === "list") return listCmd(opts);
  if (sub === "watch") return listCmd(opts, true);
  if (sub === "kill") return killCmd(args.slice(1), opts);
  if (sub === "logs") return logsCmd(args.slice(1), opts);
  if (sub === "artifacts") return artifactsCmd(args.slice(1), opts);

  const { req, reject, batchFile } = parseRequest(args);
  if (reject) return { exitCode: 1, output: reject };

  if (batchFile) {
    if (!existsSync(batchFile)) return { exitCode: 1, output: `batch file not found: ${batchFile}` };
    const tasks = readFileSync(batchFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    const out: string[] = [];
    for (const task of tasks) {
      try {
        const res = createSpawn({ task, mode: "auto" }, opts);
        await launchOne(res, opts);
        out.push(`spawned ${res.record.id} [${res.record.tier}/${res.record.mode}] — ${task}`);
      } catch (e) {
        out.push(`refused: ${task} — ${(e as Error).message}`);
      }
    }
    return { exitCode: 0, output: out.join("\n") };
  }

  try {
    const res = createSpawn(req as SpawnRequest, opts);
    const code = await launchOne(res, opts);
    return {
      exitCode: 0,
      output: `🐝 spawned ${res.record.id} [${res.record.tier}/${res.record.mode}] in ${res.record.branch}\n   sandbox: ${res.record.sandbox.network} net · worktree-only writes · secrets scoped\n   ${opts.wait === false ? "running in background" : `exited ${code}`} · logs: mooter spawn logs ${res.record.id}`,
    };
  } catch (e) {
    if (e instanceof SandboxUnavailableError) return { exitCode: 1, output: `❌ ${e.message}` };
    return { exitCode: 1, output: `spawn failed: ${(e as Error).message}` };
  }
}

function listCmd(opts: SpawnCmdOptions, watch = false): CmdResult {
  const records = listRecords(opts.home);
  if (!records.length) return { exitCode: 0, output: "no spawns yet. Try: mooter spawn \"fix bug in X\"" };
  const { active, totalCostUsd } = spawnSummary(records);
  const out: string[] = [];
  if (watch) out.push("🐮 Mooter Spawns  ·  local-first agent herd");
  out.push("id            tier  mode   status      branch              task");
  for (const r of records.slice(0, 20)) {
    out.push(
      `${r.id.padEnd(13)} ${r.tier.padEnd(5)} ${r.mode.padEnd(6)} ${r.status.padEnd(11)} ${r.branch.slice(0, 18).padEnd(18)} ${r.task.slice(0, 36)}`,
    );
  }
  out.push("");
  out.push(`${active} active · $${totalCostUsd.toFixed(2)} total (estimated)`);
  return { exitCode: 0, output: out.join("\n") };
}

function killCmd(args: string[], opts: SpawnCmdOptions): CmdResult {
  const id = args[0];
  if (!id) return { exitCode: 1, output: "usage: mooter spawn kill <id> [--graceful]" };
  const rec = findSpawn(id, opts);
  if (!rec) return { exitCode: 1, output: `spawn not found: ${id}` };
  if (rec.pid == null) return { exitCode: 1, output: `spawn ${rec.id} has no live pid (status ${rec.status}).` };
  const graceful = args.includes("--graceful");
  try {
    process.kill(rec.pid, graceful ? "SIGTERM" : "SIGKILL");
    return { exitCode: 0, output: `${graceful ? "SIGTERM" : "SIGKILL"} → spawn ${rec.id} (pid ${rec.pid})` };
  } catch (e) {
    return { exitCode: 1, output: `could not signal pid ${rec.pid}: ${(e as Error).message}` };
  }
}

function logsCmd(args: string[], opts: SpawnCmdOptions): CmdResult {
  const id = args.filter((a) => !a.startsWith("--"))[0];
  if (!id) return { exitCode: 1, output: "usage: mooter spawn logs <id> [--tail]" };
  const rec = findSpawn(id, opts);
  if (!rec) return { exitCode: 1, output: `spawn not found: ${id}` };
  const log = readOutput(rec.id, opts.home);
  if (!log) return { exitCode: 0, output: "(no output yet)" };
  if (args.includes("--tail")) return { exitCode: 0, output: log.split("\n").slice(-20).join("\n") };
  return { exitCode: 0, output: log };
}

function artifactsCmd(args: string[], opts: SpawnCmdOptions): CmdResult {
  const id = args[0];
  if (!id) return { exitCode: 1, output: "usage: mooter spawn artifacts <id>" };
  const rec = findSpawn(id, opts);
  if (!rec) return { exitCode: 1, output: `spawn not found: ${id}` };
  let files: string[] = [];
  try {
    files = readdirSync(rec.worktreePath);
  } catch {
    return { exitCode: 1, output: `worktree gone: ${rec.worktreePath}` };
  }
  return { exitCode: 0, output: files.length ? files.join("\n") : "(no artifacts)" };
}

function findSpawn(idPrefix: string, opts: SpawnCmdOptions): SpawnRecord | null {
  const exact = readRecord(idPrefix, opts.home);
  if (exact) return exact;
  const pref = listRecords(opts.home).filter((r) => r.id.startsWith(idPrefix));
  return pref.length === 1 ? pref[0] : null;
}
