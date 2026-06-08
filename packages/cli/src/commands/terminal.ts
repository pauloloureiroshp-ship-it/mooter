// Wave 33.5 Block A.7 — `mooter terminal label <name>` sets/clears the override
// the terminal-name statusline chip reads (preferences.json `terminal_label`).
// A merge-preserving write so unrelated prefs (statusline mode, hidden_chips …)
// survive.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

function prefsPath(): string {
  return join(homedir(), ".mooter", "preferences.json");
}

function readPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writePrefs(prefs: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".mooter"), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2) + "\n");
}

export function runTerminal(args: string[]): CmdResult {
  const sub = args[0];
  if (sub === "label") {
    const name = args.slice(1).join(" ").trim();
    const prefs = readPrefs();
    if (!name || name === "--clear") {
      delete prefs.terminal_label;
      writePrefs(prefs);
      return { exitCode: 0, output: "terminal label cleared — chip falls back to branch/cwd." };
    }
    prefs.terminal_label = name;
    writePrefs(prefs);
    return { exitCode: 0, output: `terminal label set → 🪟 ${name}` };
  }
  if (sub === "show" || !sub) {
    const cur = readPrefs().terminal_label;
    return {
      exitCode: 0,
      output: cur
        ? `terminal label: ${String(cur)}`
        : "terminal label: (unset — chip uses tmux/Zellij/WezTerm/branch/cwd)",
    };
  }
  return { exitCode: 1, output: "usage: mooter terminal <label <name>|label --clear|show>" };
}
