// Wave 33.5 Block C.4 — `mooter uninstall`.
//
//   mooter uninstall              (default, safe) — prints the removal plan; keeps
//                                 ~/.mooter data; does NOT touch settings.json.
//   mooter uninstall --keep-data --confirm   — removes ~/.mooter caches, keeps prefs.
//   mooter uninstall --full --confirm        — wraps `mooter data delete-all`.
//
// Destructive steps require --confirm AND never auto-edit shared config
// (settings.json hooks) — that stays a printed manual step (doctrine: shared
// config / destructive ops need explicit human action).

import { rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface UninstallOptions {
  home?: string;
  /** Injectable remover for tests. */
  remove?: (path: string) => void;
}

const HOOK_NOTE = [
  "Manual step (we never auto-edit shared config):",
  "  remove the Mooter hooks/statusline lines from ~/.claude/settings.json",
  "  (SessionStart, UserPromptSubmit inject_context.js, Stop, PostToolUse, SubagentStop, statusLine).",
];

export function runUninstall(args: string[], opts: UninstallOptions = {}): CmdResult {
  const home = opts.home ?? homedir();
  const remove = opts.remove ?? ((p: string) => rmSync(p, { recursive: true, force: true }));
  const confirm = args.includes("--confirm");
  const full = args.includes("--full");
  const mooterDir = join(home, ".mooter");

  if (!confirm) {
    const plan = full
      ? ["mooter uninstall --full would DELETE all local Mooter data:", `  - ${mooterDir} (state, pastor, spawns, orchestration, preferences)`]
      : ["mooter uninstall would remove Mooter caches (keeping your preferences):", `  - ${join(mooterDir, "spawns")}`, `  - ${join(mooterDir, "orchestration")}`, `  - ${join(mooterDir, "sessions_state.json")}`];
    return {
      exitCode: 0,
      output: [...plan, "", "Re-run with --confirm to proceed.", "", ...HOOK_NOTE].join("\n"),
    };
  }

  if (full) {
    if (existsSync(mooterDir)) remove(mooterDir);
    return { exitCode: 0, output: ["✓ removed all local Mooter data (~/.mooter).", "", ...HOOK_NOTE].join("\n") };
  }

  // keep-data default with --confirm: drop caches, keep preferences.json.
  for (const sub of ["spawns", "orchestration", "sessions_state.json"]) {
    const p = join(mooterDir, sub);
    if (existsSync(p)) remove(p);
  }
  return { exitCode: 0, output: ["✓ removed Mooter caches; preferences kept.", "", ...HOOK_NOTE].join("\n") };
}
