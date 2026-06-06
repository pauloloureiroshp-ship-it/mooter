// `mooter workflow` — local-first dynamic workflow engine (Wave 28).
//
// This file is a THIN delegator. The engine lives in the separate
// `@mooter/workflow` package, which declares native/heavy deps (isolated-vm,
// better-sqlite3, ink, …). To keep the CLI load-safe — every existing command
// and its tests must keep working without those deps installed — we NEVER
// statically import the engine here. `--help` / no-args is fully self-contained;
// real subcommands attempt a lazy `import()` and degrade gracefully while the
// engine is still being built (Phase C+).

import type { CmdResult } from "./trail.ts";

const KNOWN_SUBCOMMANDS = ["create", "list", "watch", "run", "stop", "resume"] as const;

export const WORKFLOW_USAGE = `mooter workflow — local-first dynamic workflow engine (Wave 28)

Usage:
  mooter workflow create "<task>"   write a workflow (Opus, 1 call) → plan → approve → run
  mooter workflow list              list runs (saved + recent)
  mooter workflow watch <run_id>    live progress TUI
  mooter workflow run <name>        run a saved workflow (idempotent)
  mooter workflow stop <run_id>     stop a running workflow
  mooter workflow resume <run_id>   resume a paused/killed run (cross-session)

Workers run locally on Ollama (qwen2.5-coder:7b); only the script writer and
synthesis use the cloud — so a run costs ~$0.45 and your code stays on-device.`;

export async function runWorkflow(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: WORKFLOW_USAGE };
  }

  if (!(KNOWN_SUBCOMMANDS as readonly string[]).includes(sub)) {
    return {
      exitCode: 1,
      output: `mooter workflow: unknown subcommand '${sub}'\n\n${WORKFLOW_USAGE}`,
    };
  }

  // Phase B skeleton: the engine package exists but its phases (agent pool,
  // primitives, sandbox, state, writer) are not implemented yet. Report
  // honestly rather than half-running. Phase C+ replaces this with a lazy
  // import of @mooter/workflow and real dispatch.
  void rest;
  return {
    exitCode: 0,
    output:
      `mooter workflow: the engine is being built (Wave 28).\n` +
      `  '${sub}' lands once the runtime is wired up (Phase C+).\n` +
      `  Skeleton: packages/workflow/ · brief: docs/strategy/WAVE28_WORKFLOW_ENGINE_KICKOFF.md`,
  };
}
