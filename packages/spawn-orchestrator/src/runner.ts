// Wave 33.5 Block B.2 — sandboxed subprocess runner.
//
// Launches the spawn's command wrapped in the detected sandbox, streams its
// stdout/stderr to the spawn's output.log, and patches the record on exit. The
// spawn implementation is injectable so the lifecycle is testable without forking
// a real process or requiring bubblewrap.

import { spawn as nodeSpawn } from "node:child_process";

import { assembleBwrap } from "./sandbox/sandbox.ts";
import { appendOutput, patchRecord } from "./state.ts";
import type { SpawnRecord } from "./types.ts";

export interface SpawnHandle {
  pid: number | null;
  /** Resolves with the exit code when the process ends. */
  done: Promise<number>;
}

export type SpawnImpl = (
  argv: string[],
  hooks: { onData: (s: string) => void; onExit: (code: number) => void },
) => { pid: number | null };

/** Default impl: real child_process.spawn, stdout+stderr → onData. */
export const defaultSpawnImpl: SpawnImpl = (argv, hooks) => {
  const child = nodeSpawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d) => hooks.onData(d.toString()));
  child.stderr?.on("data", (d) => hooks.onData(d.toString()));
  child.on("close", (code) => hooks.onExit(code ?? 0));
  child.on("error", (e) => {
    hooks.onData(`spawn error: ${e.message}\n`);
    hooks.onExit(127);
  });
  return { pid: child.pid ?? null };
};

export interface RunOptions {
  command: string[];
  sourceEnv?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
  spawnImpl?: SpawnImpl;
}

/**
 * Wrap `command` in the record's sandbox and run it. Returns a handle whose
 * `done` resolves with the exit code; the record is patched to running then
 * done/failed, and all output is appended to output.log.
 */
export function runSandboxed(record: SpawnRecord, opts: RunOptions): SpawnHandle {
  const now = opts.now ?? (() => Date.now());
  const impl = opts.spawnImpl ?? defaultSpawnImpl;
  const argv = assembleBwrap({ config: record.sandbox, command: opts.command, sourceEnv: opts.sourceEnv });

  appendOutput(record.id, `$ ${argv.join(" ")}\n`, opts.home);

  let resolveDone: (code: number) => void;
  const done = new Promise<number>((res) => (resolveDone = res));
  let pid: number | null = null;
  let exited = false;

  // Mark running BEFORE invoking impl — a synchronous impl (tests) may fire
  // onExit during the call, and the done/failed patch must win, not be clobbered.
  patchRecord(record.id, { status: "running" }, now(), opts.home);

  const child = impl(argv, {
    onData: (s) => appendOutput(record.id, s, opts.home),
    onExit: (code) => {
      exited = true;
      patchRecord(record.id, { status: code === 0 ? "done" : "failed", exitCode: code, pid }, now(), opts.home);
      resolveDone(code);
    },
  });
  pid = child.pid;

  // For an async impl the process is still running — record its pid now. For a
  // synchronous impl onExit already finalized the record above.
  if (!exited) patchRecord(record.id, { pid }, now(), opts.home);
  return { pid, done };
}

/** Build the command for a spawn by mode. local → Ollama; cloud → headless CC. */
export function buildCommand(mode: "cloud" | "local", task: string, model: string): string[] {
  if (mode === "local") {
    // Ollama on host loopback (sandbox keeps net for "local"). The model is the
    // task brain; the prompt is passed as the run argument.
    return ["ollama", "run", model, task];
  }
  // Cloud: a headless Claude Code print-mode subprocess. Kept as the documented
  // shape; the binary/flags are resolved at call sites that have auth wired.
  return ["claude", "-p", task];
}
